// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { RealtimeConnection } from './connection';
import { openAiCallFactory } from './call';
const servers: Array<WebSocketServer | Server> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => {
    if (server instanceof WebSocketServer) server.clients.forEach((client) => client.terminate());
    else server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  }));
});

it('settings probe configures a real session without requesting a response', async () => {
  const server = new WebSocketServer({ port: 0 }); servers.push(server); await once(server, 'listening');
  const seen: string[] = [];
  server.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'session.created' }));
    socket.on('message', (raw) => { const event = JSON.parse(raw.toString()); seen.push(event.type); if (event.type === 'session.update') socket.send(JSON.stringify({ type: 'session.updated' })); });
  });
  const connection = new RealtimeConnection('test-key', 'model', new AbortController().signal, `ws://127.0.0.1:${(server.address() as { port: number }).port}`);
  await connection.probe(AbortSignal.timeout(2000)); connection.close();
  expect(seen).toEqual(['session.update']);
});

async function provider() {
  const calls: Array<{ url: string; auth?: string; body: string }> = [];
  const http = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += String(chunk);
    calls.push({ url: req.url ?? '', auth: req.headers.authorization, body });
    if (req.url === '/v1/realtime/calls') { res.writeHead(201, { Location: '/v1/realtime/calls/rtc_test123', 'Content-Type': 'application/sdp' }); res.end('v=0 answer'); return; }
    res.writeHead(200); res.end();
  });
  servers.push(http); http.listen(0, '127.0.0.1'); await once(http, 'listening');
  const sideband = new WebSocketServer({ port: 0 }); servers.push(sideband); await once(sideband, 'listening');
  const sockets: Array<{ socket: WebSocket; url: string; auth?: string; received: object[] }> = [];
  sideband.on('connection', (socket, req) => {
    const entry = { socket, url: req.url ?? '', auth: req.headers.authorization, received: [] as object[] };
    sockets.push(entry); socket.on('message', (raw) => entry.received.push(JSON.parse(raw.toString())));
  });
  const factory = openAiCallFactory('server-key', `http://127.0.0.1:${(http.address() as { port: number }).port}`, `ws://127.0.0.1:${(sideband.address() as { port: number }).port}`);
  return { calls, sockets, factory };
}

describe('WebRTC unified call with server sideband', () => {
  it.each([
    ['quota code', '{"error":{"code":"insufficient_quota"}}', 'REALTIME_INSUFFICIENT_QUOTA'],
    ['quota type', '{"error":{"type":"insufficient_quota"}}', 'REALTIME_INSUFFICIENT_QUOTA'],
    ['rate limit', '{"error":{"code":"rate_limit_exceeded"}}', 'REALTIME_RATE_LIMITED'],
    ['empty body', '', 'REALTIME_RATE_LIMITED'],
    ['malformed body', '<html>unavailable</html>', 'REALTIME_RATE_LIMITED'],
    ['null error', '{"error":null}', 'REALTIME_RATE_LIMITED'],
  ])('classifies a rejected 429 call: %s', async (_name, body, code) => {
    const http = createServer((_req, res) => { res.writeHead(429); res.end(body); });
    servers.push(http); http.listen(0, '127.0.0.1'); await once(http, 'listening');
    const factory = openAiCallFactory('test-key', `http://127.0.0.1:${(http.address() as { port: number }).port}`, 'ws://127.0.0.1:1');
    await expect(factory({ sdp: 'v=0', session: {}, signal: new AbortController().signal, onEvent: () => {}, onClose: () => {} })).rejects.toThrow(code);
  });
  it('posts the offer with server-side session, attaches the sideband to the call and hangs up on close', async () => {
    const { calls, sockets, factory } = await provider();
    const events: string[] = []; const closes: string[] = [];
    const { answer, call } = await factory({ sdp: 'v=0 offer', session: { type: 'realtime', instructions: 'teach' }, signal: new AbortController().signal,
      onEvent: (event) => events.push(event.type), onClose: (code) => closes.push(code) });
    expect(answer).toBe('v=0 answer');
    expect(calls[0].auth).toBe('Bearer server-key');
    expect(calls[0].body).toContain('name="sdp"'); expect(calls[0].body).toContain('v=0 offer'); expect(calls[0].body).toContain('"instructions":"teach"');
    call.send({ type: 'session.update' }); // queued until the sideband is open
    await expect.poll(() => sockets.length).toBe(1);
    expect(sockets[0].url).toBe('/v1/realtime?call_id=rtc_test123'); expect(sockets[0].auth).toBe('Bearer server-key');
    await expect.poll(() => sockets[0].received).toEqual([{ type: 'session.update' }]);
    sockets[0].socket.send(JSON.stringify({ type: 'input_audio_buffer.speech_started', item_id: 'i1' }));
    await expect.poll(() => events).toEqual(['input_audio_buffer.speech_started']);
    call.close(); call.close();
    // Closing the sideband alone would leave WebRTC media running; the call itself is hung up once.
    await expect.poll(() => calls.filter((c) => c.url === '/v1/realtime/calls/rtc_test123/hangup').length).toBe(1);
    expect(closes).toEqual([]);
  });
  it('reports a provider-side sideband loss and still hangs up the call', async () => {
    const { calls, sockets, factory } = await provider();
    const closes: string[] = [];
    await factory({ sdp: 'v=0 offer', session: {}, signal: new AbortController().signal, onEvent: () => {}, onClose: (code) => closes.push(code) });
    await expect.poll(() => sockets.length).toBe(1);
    sockets[0].socket.close();
    await expect.poll(() => closes).toEqual(['PROVIDER_DISCONNECTED']);
    await expect.poll(() => calls.some((c) => c.url.endsWith('/hangup'))).toBe(true);
  });
  it('maps rejected calls to settings errors without opening a sideband', async () => {
    const http = createServer((_req, res) => { res.writeHead(401); res.end('{}'); }); servers.push(http); http.listen(0, '127.0.0.1'); await once(http, 'listening');
    const factory = openAiCallFactory('bad-key', `http://127.0.0.1:${(http.address() as { port: number }).port}`, 'ws://127.0.0.1:1');
    await expect(factory({ sdp: 'v=0', session: {}, signal: new AbortController().signal, onEvent: () => {}, onClose: () => {} })).rejects.toThrow('REALTIME_AUTH_FAILED');
  });
});

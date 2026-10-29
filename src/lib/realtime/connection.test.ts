// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { once } from 'node:events';
import { RealtimeConnection } from './connection';
const servers: WebSocketServer[] = [];
const connections: RealtimeConnection[] = [];
afterEach(async () => {
  connections.splice(0).forEach((c) => c.close());
  await Promise.all(servers.splice(0).map((server) => { server.clients.forEach((client) => client.terminate()); return new Promise<void>((resolve) => server.close(() => resolve())); }));
});
const usage = { input_tokens: 10, output_tokens: 10, input_token_details: { text_tokens: 10, audio_tokens: 0, cached_tokens: 0 }, output_token_details: { text_tokens: 10, audio_tokens: 0 } };
async function fixture(change?: (socket: WebSocket, event: Record<string, any>) => boolean) {
  const server = new WebSocketServer({ port: 0 }); servers.push(server); await once(server, 'listening');
  let receipt = false;
  server.on('connection', (socket) => {
    const send = (data: object) => socket.send(JSON.stringify(data));
    send({ type: 'session.created' });
    socket.on('message', (raw) => {
      const event = JSON.parse(raw.toString());
      if (change?.(socket, event)) return;
      if (event.type === 'session.update') send({ type: 'session.updated' });
      if (event.type === 'input_audio_buffer.commit') send({ type: 'input_audio_buffer.committed', item_id: 'input-1' });
      if (event.type === 'conversation.item.create') receipt = JSON.parse(event.item.output).ok;
      if (event.type === 'response.create') {
        const assess = event.response.output_modalities[0] === 'text';
        const response = { id: assess ? 'assessment' : 'speech', status: 'completed', metadata: event.response.metadata, usage,
          output: assess ? [{ type: 'function_call', name: 'record_assessment', call_id: 'call-1', arguments: '{"target_id":"apple"}' }] : [] };
        send({ type: 'response.created', response });
        if (!assess) {
          expect(receipt).toBe(true);
          send({ type: 'response.output_audio.delta', response_id: response.id, delta: Buffer.alloc(4800).toString('base64') });
          send({ type: 'response.output_audio_transcript.delta', response_id: response.id, delta: '读得不错。' });
        }
        send({ type: 'response.done', response });
      }
    });
  });
  const address = server.address() as { port: number };
  const lifetime = new AbortController();
  const connection = new RealtimeConnection('test-key', 'test-model', lifetime.signal, `ws://127.0.0.1:${address.port}`); connections.push(connection);
  return { connection, lifetime };
}
describe('official Realtime protocol adapter', () => {
  it('executes and acknowledges the tool before requesting any speech, with correlated usage', async () => {
    const { connection } = await fixture(); const events: string[] = [];
    await connection.turn({ turnId: 'turn-1', instructions: 'test', pcm: Buffer.alloc(4800), signal: new AbortController().signal,
      assess: (args) => { expect(args).toEqual({ target_id: 'apple' }); events.push('saved'); return { ok: true }; },
      audio: () => events.push('audio'), transcript: () => events.push('transcript'), usage: (value) => { expect(value).toEqual(usage); events.push('usage'); } });
    expect(events).toEqual(['usage', 'saved', 'audio', 'transcript', 'usage']);
  });
  it('does not execute a response belonging to another input turn', async () => {
    const { connection } = await fixture((socket, event) => {
      if (event.type !== 'response.create') return false;
      socket.send(JSON.stringify({ type: 'response.created', response: { id: 'bad', metadata: { turnId: 'other' } } })); return true;
    });
    const usages: unknown[] = [];
    await expect(connection.turn({ turnId: 'turn-1', instructions: 'test', signal: new AbortController().signal,
      assess: () => { throw new Error('must not execute'); }, audio: () => {}, transcript: () => {}, usage: (u) => usages.push(u) })).rejects.toThrow('PROVIDER_TURN_MISMATCH');
    expect(usages).toEqual([null]);
  });
  it('cancels a pending provider response, releases the connection and marks usage incomplete', async () => {
    const abort = new AbortController();
    const { connection } = await fixture((_socket, event) => { if (event.type === 'response.create') { abort.abort(); return true; } return false; });
    const usages: unknown[] = [];
    await expect(connection.turn({ turnId: 'turn-1', instructions: 'test', signal: abort.signal,
      audio: () => {}, transcript: () => {}, usage: (u) => usages.push(u) })).rejects.toThrow();
    expect(usages).toEqual([null]);
  });
});

it('fails a completed audio response with no audio instead of unlocking a silent teacher', async () => {
  const { connection } = await fixture((socket, event) => {
    if (event.type !== 'response.create' || event.response.output_modalities[0] !== 'audio') return false;
    const response = { id: 'empty-speech', status: 'completed', metadata: event.response.metadata, usage, output: [] };
    socket.send(JSON.stringify({ type: 'response.created', response }));
    socket.send(JSON.stringify({ type: 'response.done', response })); return true;
  });
  await expect(connection.turn({ turnId: 'turn-1', instructions: 'test', signal: new AbortController().signal,
    assess: () => ({ ok: true }), audio: () => { throw new Error('no audio expected'); }, transcript: () => {}, usage: () => {} })).rejects.toThrow('PROVIDER_MISSING_AUDIO');
});

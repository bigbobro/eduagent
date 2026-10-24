// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { guardUpgrade } from './upgrade-guard';

// 真实 http server + 真实 ws 客户端,验证未配置时 upgrade 得到 HTTP 503。
describe('guardUpgrade', () => {
  let server: Server;
  let port: number;
  const saved = { mock: process.env.VOICE_MOCK, llm: process.env.LLM_API_KEY };
  const wss = new WebSocketServer({ noServer: true });

  beforeEach(async () => {
    delete process.env.VOICE_MOCK;
    delete process.env.LLM_API_KEY;
    delete process.env.MIMO_API_KEY;
    server = createServer();
    server.on('upgrade', (req, socket, head) => {
      if (guardUpgrade(req, socket as Socket, port) !== 'ok') return;
      wss.handleUpgrade(req, socket as Socket, head, (ws) => ws.close());
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    if (saved.mock === undefined) delete process.env.VOICE_MOCK; else process.env.VOICE_MOCK = saved.mock;
    if (saved.llm === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = saved.llm;
    await new Promise((r) => server.close(r));
  });

  function connect(origin?: string) {
    return new Promise<{ status?: number; body?: string; opened?: boolean; error?: string }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/voice/tts`, { headers: origin ? { Origin: origin } : {} });
      ws.on('open', () => { ws.close(); resolve({ opened: true }); });
      ws.on('unexpected-response', (_req, res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      ws.on('error', (e) => resolve({ error: e.message }));
    });
  }

  it('unconfigured: upgrade is answered with HTTP 503 NOT_CONFIGURED and the socket closes', async () => {
    const r = await connect(`http://127.0.0.1:${port}`);
    expect(r.status).toBe(503);
    expect(JSON.parse(r.body!)).toEqual({ code: 'NOT_CONFIGURED' });
  });

  it('mock mode counts as configured: upgrade succeeds', async () => {
    process.env.VOICE_MOCK = 'true';
    const r = await connect(`http://127.0.0.1:${port}`);
    expect(r.opened).toBe(true);
  });

  it('foreign Origin is still destroyed before the configuration check', async () => {
    process.env.VOICE_MOCK = 'true';
    const r = await connect('http://evil.example');
    expect(r.opened).toBeUndefined();
    expect(r.status).toBeUndefined();
    expect(r.error).toBeTruthy();
  });
});

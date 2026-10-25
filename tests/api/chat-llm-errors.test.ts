// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/chat/route';
import { endSession } from '@/lib/agent/session';
import { resetConfig } from '@/lib/config';
import { testLlm } from '@/lib/settings/test-connection';

describe('lesson LLM errors against a local fake provider', () => {
  let server: Server;
  let baseUrl: string;
  let status = 402;
  let body = '';
  const key = 'fake-test-key-never-expose';

  beforeEach(async () => {
    server = createServer((req, res) => {
      req.resume();
      req.on('end', () => res.writeHead(status, { 'Content-Type': 'application/json' }).end(body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    vi.stubEnv('VOICE_MOCK', 'false');
    vi.stubEnv('LLM_API_KEY', key);
    vi.stubEnv('LLM_BASE_URL', baseUrl);
    vi.stubEnv('LLM_MODEL', 'fake-model');
    for (const name of ['DOUBAO_APP_ID', 'DOUBAO_ACCESS_KEY', 'DOUBAO_ASR_RESOURCE_ID', 'DOUBAO_TTS_RESOURCE_ID']) vi.stubEnv(name, 'fake-value');
    resetConfig();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetConfig();
  });

  it.each([
    [402, 'LLM_INSUFFICIENT_BALANCE', '余额不足', { code: 30001, message: 'Sorry, your account balance is insufficient' }],
    [401, 'LLM_AUTH_FAILED', '鉴权失败', { error: { code: 'invalid_api_key', message: key } }],
    [404, 'LLM_MODEL_UNAVAILABLE', '模型不存在', { error: { code: 'model_not_found' } }],
    [429, 'LLM_RATE_LIMITED', '请求太频繁', { error: { code: 'rate_limit_exceeded' } }],
    [500, 'LLM_OTHER', '课堂暂时没准备好', { message: key }],
  ])('carries %i classification through start SSE, message SSE and connection test', async (httpStatus, code, message, payload) => {
    status = httpStatus;
    body = JSON.stringify(payload);
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const post = (request: object) => POST(new Request('http://localhost/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
    }) as NextRequest);
    const opening = await post({ action: 'start', courseId: 'food', learnerId: 'test-learner' });
    const sessionId = opening.headers.get('X-Session-Id')!;
    try {
      expect(opening.status).toBe(200);
      const openingText = await opening.text();
      const turn = await post({ action: 'message', sessionId, text: 'hello' });
      for (const text of [openingText, await turn.text()]) {
        expect(text).toContain('event: error');
        expect(text).toContain(`"code":"${code}"`);
        expect(text).toContain(message);
        expect(text).not.toContain('event: done');
        expect(text).not.toContain(key);
      }
      const probe = await testLlm({ baseUrl, apiKey: key, model: 'fake-model', provider: 'custom' });
      expect(probe).toMatchObject({ ok: false, code, reason: expect.stringContaining(message) });
      expect(probe.reason).toContain(`HTTP ${status}`);
      const logText = logs.mock.calls.flat().join('\n');
      expect(logText).toContain(`code="${code}"`);
      expect(logText).toContain(`status=${status}`);
      if (status === 402) expect(logText).toContain('providerCode="30001"');
      expect(logText).not.toContain(key);
    } finally {
      endSession(sessionId);
    }
  });
});

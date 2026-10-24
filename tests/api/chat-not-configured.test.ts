// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/chat/route';

describe('/api/chat when not configured', () => {
  const keys = ['VOICE_MOCK', 'LLM_API_KEY', 'MIMO_API_KEY', 'DOUBAO_APP_ID', 'DOUBAO_ACCESS_KEY'];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => { for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!; } });

  const start = () => POST(new NextRequest('http://127.0.0.1:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', courseId: 'animals' }),
  }));

  it('returns 503 with code NOT_CONFIGURED', async () => {
    const res = await start();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('mock mode is configured: start proceeds (SSE stream)', async () => {
    process.env.VOICE_MOCK = 'true';
    const res = await start();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    await res.body?.cancel();
  });
});

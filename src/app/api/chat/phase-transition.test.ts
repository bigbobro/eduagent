import { beforeEach, describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, endSession, getSession } from '@/lib/agent/session';
import { POST } from './route';

function makeReq(body: any): any {
  return { json: async () => body };
}

describe('POST /api/chat action=phase-transition', () => {
  beforeEach(() => {
    process.env.VOICE_MOCK = 'true';
    process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://mock.local/v1';
    process.env.LLM_API_KEY = process.env.LLM_API_KEY || 'mock-key';
  });

  it('updates session.currentPhase and streams SSE', async () => {
    if (process.env.VOICE_MOCK !== 'true') return;
    const session = createSession(foodCourse);
    const res = await POST(makeReq({
      action: 'phase-transition',
      sessionId: session.id,
      to: 'interactive',
    }));

    expect(getSession(session.id)?.currentPhase).toBe('interactive');
    expect(res.headers.get('Content-Type')).toContain('event-stream');
    endSession(session.id);
  });

  it('returns 404 for unknown session', async () => {
    const res = await POST(makeReq({
      action: 'phase-transition',
      sessionId: 'nope',
      to: 'interactive',
    }));

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid phase', async () => {
    const session = createSession(foodCourse);
    const res = await POST(makeReq({
      action: 'phase-transition',
      sessionId: session.id,
      to: 'garbage',
    }));

    expect(res.status).toBe(400);
    endSession(session.id);
  });
});

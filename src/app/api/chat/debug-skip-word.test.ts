import { beforeEach, describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, endSession, getSession } from '@/lib/agent/session';
import { POST } from './route';

function makeReq(body: any): any {
  return { json: async () => body };
}

describe('POST /api/chat action=debug-skip-word', () => {
  beforeEach(() => {
    process.env.VOICE_MOCK = 'true';
    process.env.MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://mock.local/v1';
    process.env.MIMO_API_KEY = process.env.MIMO_API_KEY || 'mock-key';
  });

  it('marks the current word card cleared and advances to the next word', async () => {
    const session = createSession(foodCourse);
    session.memory.currentCardId = 'apple';

    const res = await POST(makeReq({
      action: 'debug-skip-word',
      sessionId: session.id,
    }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      skippedCardId: 'apple',
      nextCardId: 'banana',
      clearedCardIds: ['apple'],
    });
    expect(getSession(session.id)?.memory.cardProgress.apple).toBe('cleared');
    expect(getSession(session.id)?.memory.currentCardId).toBe('banana');
    endSession(session.id);
  });

  it('returns 404 for unknown session', async () => {
    const res = await POST(makeReq({
      action: 'debug-skip-word',
      sessionId: 'nope',
    }));

    expect(res.status).toBe(404);
  });
});

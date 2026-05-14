import { beforeEach, describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, endSession, getSession } from '@/lib/agent/session';
import { POST } from './route';

function makeReq(body: any): any {
  return { json: async () => body };
}

describe('POST /api/chat action=quiz-answer', () => {
  beforeEach(() => {
    process.env.VOICE_MOCK = 'true';
    process.env.MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://mock.local/v1';
    process.env.MIMO_API_KEY = process.env.MIMO_API_KEY || 'mock-key';
  });

  it('records quiz answer and returns ok', async () => {
    const session = createSession(foodCourse);
    const res = await POST(makeReq({
      action: 'quiz-answer',
      sessionId: session.id,
      quizId: 'q1',
      answer: 'apple',
      correct: true,
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(getSession(session.id)?.memory.totalInteractions).toBeGreaterThan(0);
    endSession(session.id);
  });

  it('returns 404 for unknown session', async () => {
    const res = await POST(makeReq({
      action: 'quiz-answer',
      sessionId: 'nope',
      quizId: 'q1',
      answer: 'x',
      correct: false,
    }));

    expect(res.status).toBe(404);
  });
});

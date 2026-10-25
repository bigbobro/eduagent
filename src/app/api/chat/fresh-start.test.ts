import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { POST } from './route';
import { getDb } from '@/lib/db';
import { getCourseProgress, upsertCourseProgress } from '@/lib/db/queries';
import { createMemory, initializeCardProgress } from '@/lib/agent/memory';
import { serializeProgress } from '@/lib/agent/course-progress';
import { endSession, getSession } from '@/lib/agent/session';

const start = (extra: object = {}) => POST({ json: async () => ({ action: 'start', courseId: foodCourse.id, learnerId: 'test-learner', ...extra }) } as any);

function seedResumableBreakpoint() {
  const snapshot = serializeProgress(initializeCardProgress(createMemory(), foodCourse));
  snapshot.clearedCardIds = ['apple']; snapshot.cardProgress.apple = 'cleared';
  snapshot.cardCorrectCount.apple = 2; snapshot.currentCardId = 'milk';
  upsertCourseProgress(foodCourse.id, snapshot, 'interactive', false, 'test-learner');
}

beforeEach(() => {
  vi.stubEnv('VOICE_MOCK', 'true'); vi.stubEnv('LLM_API_KEY', 'mock-key');
  getDb().exec('DELETE FROM course_progress');
  seedResumableBreakpoint();
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/chat action=start fresh flag', () => {
  it('still resumes the breakpoint when fresh is not sent', async () => {
    const res = await start();
    expect(res.headers.get('X-Resume-Info')).toBeTruthy();
    const session = getSession(res.headers.get('X-Session-Id')!);
    expect(session?.memory.clearedCardIds).toContain('apple');
    await res.text(); endSession(res.headers.get('X-Session-Id')!);
  });

  it('starts a new session without X-Resume-Info when fresh is true, then leaves the old breakpoint for the first turn to overwrite', async () => {
    const res = await start({ fresh: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Resume-Info')).toBeNull();
    const session = getSession(res.headers.get('X-Session-Id')!);
    expect(session?.memory.clearedCardIds).toEqual([]);
    expect(session?.currentPhase).toBe('intro');
    expect(getCourseProgress(foodCourse.id, 'test-learner')).toBeTruthy();
    await res.text(); endSession(res.headers.get('X-Session-Id')!);
  });

  it('treats fresh:false like an omitted flag', async () => {
    const res = await start({ fresh: false });
    expect(res.headers.get('X-Resume-Info')).toBeTruthy();
    await res.text(); endSession(res.headers.get('X-Session-Id')!);
  });
});

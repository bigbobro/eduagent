import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { animalsCourse } from '@/data/courses/animals';
import { POST } from '@/app/api/chat/route';
import { createMemory, initializeCardProgress } from '@/lib/agent/memory';
import { serializeProgress } from '@/lib/agent/course-progress';
import { endSession } from '@/lib/agent/session';
import { buildProgressSnapshot } from '@/lib/progress';
import { getDb } from './index';
import { getAllCourseProgress, getCourseProgress, upsertCourseProgress } from './queries';

const valid = () => serializeProgress(initializeCardProgress(createMemory(), foodCourse));
const raw = () => getDb().prepare('SELECT * FROM course_progress WHERE course_id = ?').get(foodCourse.id);
beforeEach(() => { vi.stubEnv('VOICE_MOCK', 'true'); vi.stubEnv('LLM_API_KEY', 'mock-key'); getDb().exec('DELETE FROM course_progress'); });
afterEach(() => vi.unstubAllEnvs());
function insert(snapshot: unknown, phase = 'interactive', completed = 0) {
  getDb().prepare('INSERT INTO course_progress (course_id, snapshot, phase, completed, updated_at) VALUES (?, ?, ?, ?, ?)').run(foodCourse.id, typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot), phase, completed, '2026-07-20T00:00:00Z');
}

describe('persisted progress validation and preservation', () => {
  it.each([
    ['invalid JSON', '{broken', 'interactive', 0],
    ['missing fields', {}, 'interactive', 0],
    ['null snapshot', 'null', 'interactive', 0],
    ['invalid course phase', valid(), 'learning', 0],
    ['invalid micro phase', { ...valid(), phase: 'interactive' }, 'interactive', 0],
    ['invalid count', { ...valid(), totalInteractions: -1 }, 'interactive', 0],
    ['invalid array member', { ...valid(), clearedCardIds: [42] }, 'interactive', 0],
    ['invalid progress state', { ...valid(), cardProgress: { apple: 'finished' } }, 'interactive', 0],
    ['invalid performance date', { ...valid(), wordPerformance: [['apple', { attempts: 1, correct: 1, lastAttempt: 'bad-date' }]] }, 'interactive', 0],
    ['invalid performance counts', { ...valid(), wordPerformance: [['apple', { attempts: 1, correct: 2, lastAttempt: '2026-07-20T00:00:00Z' }]] }, 'interactive', 0],
    ['invalid completed flag', valid(), 'interactive', 2],
  ])('%s remains byte-identical after start attempts and aggregate reads', async (_name, snapshot, phase, completed) => {
    insert(snapshot, phase as string, completed as number);
    const before = raw();
    const lessons = getDb().prepare('SELECT COUNT(*) AS n FROM lesson_logs').get();
    expect(() => getCourseProgress(foodCourse.id)).toThrow();
    for (let i = 0; i < 2; i++) {
      const response = await POST({ json: async () => ({ action: 'start', courseId: foodCourse.id }) } as any);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'INVALID_COURSE_PROGRESS' });
    }
    expect(getAllCourseProgress(getDb()).has(foodCourse.id)).toBe(false);
    expect(buildProgressSnapshot(getDb(), [foodCourse, animalsCourse]).courses).toHaveLength(2);
    expect(raw()).toEqual(before);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM lesson_logs').get()).toEqual(lessons);
  });

  it('retains unknown ids and accepts newly added cards without changing stored content on read', async () => {
    const snapshot = valid();
    delete snapshot.cardProgress.egg;
    snapshot.cardProgress.retired = 'cleared'; snapshot.clearedCardIds = ['retired'];
    snapshot.passedQuizIds = ['retired-quiz']; snapshot.currentCardId = 'retired';
    insert(snapshot);
    const before = raw();
    expect(getCourseProgress(foodCourse.id)?.snapshot).toEqual(snapshot);
    const projected = buildProgressSnapshot(getDb(), [foodCourse]).courses[0];
    expect(projected.progressPercent).toBe(0);
    expect(raw()).toEqual(before);
    const response = await POST({ json: async () => ({ action: 'start', courseId: foodCourse.id }) } as any);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.headers.get('X-Resume-Info')!).resumeCardId).toBe('apple');
    await response.text(); endSession(response.headers.get('X-Session-Id')!);
    const restored = getCourseProgress(foodCourse.id)!;
    expect(restored.snapshot.cardProgress.egg).toBe('untouched');
    expect(restored.snapshot.cardProgress.retired).toBe('cleared');
    expect(restored.snapshot.passedQuizIds).toContain('retired-quiz');
  });

  it('preserves normal courses when another course has a damaged row', () => {
    insert({});
    const other = serializeProgress(initializeCardProgress(createMemory(), animalsCourse));
    other.clearedCardIds = ['cat'];
    upsertCourseProgress(animalsCourse.id, other, 'interactive', false);
    const before = raw();
    expect(getAllCourseProgress(getDb()).get(animalsCourse.id)?.snapshot).toEqual(other);
    expect(buildProgressSnapshot(getDb(), [foodCourse, animalsCourse]).courses[1].progressPercent).toBeGreaterThan(0);
    expect(raw()).toEqual(before);
  });
});

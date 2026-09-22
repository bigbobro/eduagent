import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { getDb } from '@/lib/db';
import { getCourseProgress } from '@/lib/db/queries';
import { buildSessionList } from '@/lib/stats';
import { buildReport } from '../../../scripts/lesson-report-data';
import * as llm from '@/lib/llm';
import { createSession, createSessionFromSnapshot, endSession, recordQuizAnswer, setSessionPhase, streamUserInput } from './session';

const reply = JSON.stringify({ speech: 'Hello!', actions: [], state_update: {} });
beforeEach(() => {
  vi.spyOn(llm, 'streamLLM').mockImplementation(async function* () { yield { done: false, delta: reply }; });
});
afterEach(() => vi.restoreAllMocks());
async function turn(id: string) {
  const events = [];
  for await (const event of streamUserInput(id, 'apple')) events.push(event);
  return events;
}
async function expectCount(id: string, count: number) {
  const db = getDb();
  expect(db.prepare('SELECT COUNT(*) AS n FROM interaction_logs WHERE lesson_id = ?').get(id)).toEqual({ n: count });
  expect(buildSessionList(db, [foodCourse]).find((row) => row.lessonId === id)?.interactionCount).toBe(count);
  const report = await buildReport(db, id, async () => null);
  expect(report.eval.sessionHealth.interactionCountMatchesLog).toBe(true);
  expect(report.eval.sessionHealth.issues).not.toContain('interaction_count_mismatch');
}

describe('per-lesson accounting', () => {
  it('counts each lesson independently through two resumes without resetting course context', async () => {
    let session = createSession(foodCourse);
    for (let round = 0; round < 3; round++) {
      expect(session.memory.totalInteractions).toBe(round * 3);
      setSessionPhase(session.id, 'interactive');
      expect(await turn(session.id)).toContainEqual({ type: 'done' });
      recordQuizAnswer(session.id, foodCourse.phases.reinforcement.quizzes[0].id, 'apple', true);
      setSessionPhase(session.id, 'reinforcement');
      expect(await turn(session.id)).toContainEqual({ type: 'done' });
      await expectCount(session.id, 3);
      endSession(session.id);
      await expectCount(session.id, 3);
      const progress = getCourseProgress(foodCourse.id)!;
      expect(progress.snapshot.totalInteractions).toBe((round + 1) * 3);
      expect(progress.snapshot.passedQuizIds).toContain(foodCourse.phases.reinforcement.quizzes[0].id);
      if (round < 2) session = createSessionFromSnapshot(foodCourse, progress);
    }
  });

  it('does not include a failed generation in the lesson count, even on end', async () => {
    const session = createSession(foodCourse);
    await turn(session.id);
    vi.mocked(llm.streamLLM).mockImplementationOnce(async function* () { throw new Error('provider unavailable'); });
    expect(await turn(session.id)).toContainEqual({ type: 'error', message: 'provider unavailable' });
    endSession(session.id);
    await expectCount(session.id, 1);
  });

  it('leaves existing historical summaries untouched', async () => {
    const db = getDb();
    db.prepare("INSERT INTO lesson_logs (id, course_id, start_time, interaction_count) VALUES ('historical', 'food', '2026-01-01', 91)").run();
    const session = createSession(foodCourse);
    await turn(session.id);
    endSession(session.id);
    expect(db.prepare("SELECT interaction_count FROM lesson_logs WHERE id = 'historical'").get()).toEqual({ interaction_count: 91 });
  });
});

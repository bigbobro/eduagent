import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from './sqlite';
import { getDb } from './index';
import * as dbIndex from './index';
import { runMigrations } from './schema';
import { createLearner, deleteLearner, listLearners } from './learners';
import { createLessonLog, getCourseProgress, insertInteraction, upsertCourseProgress, upsertWordPerformance } from './queries';
import { buildProgressSnapshot } from '../progress';
import { buildSessionList, buildStatsSnapshot } from '../stats';
import { createSession, createSessionFromSnapshot, endSession, getSession, recordQuizAnswer } from '../agent/session';
import { createMemory, initializeCardProgress } from '../agent/memory';
import { serializeProgress } from '../agent/course-progress';
import { foodCourse } from '@/data/courses/food';
import { POST } from '@/app/api/chat/route';

const snapshot = () => {
  const value = serializeProgress(initializeCardProgress(createMemory(), foodCourse));
  value.clearedCardIds = ['apple']; value.cardProgress.apple = 'cleared';
  value.cardCorrectCount.apple = 2; value.currentCardId = 'milk';
  return value;
};
function legacyDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  db.exec(`DROP TABLE course_progress; DROP TABLE lesson_logs; DROP TABLE learners;
    DELETE FROM schema_migrations WHERE version = 5;
    CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, start_time TEXT NOT NULL,
      end_time TEXT, interaction_count INTEGER DEFAULT 0, token_usage TEXT DEFAULT '{}', ended_gracefully INTEGER DEFAULT 0);
    CREATE TABLE course_progress (course_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, phase TEXT NOT NULL,
      completed INTEGER DEFAULT 0, updated_at TEXT NOT NULL);`);
  return db;
}
describe('migration v5', () => {
  it('leaves a fresh database without a default child and is repeatable without markers', () => {
    const db = new Database(':memory:');
    try {
      runMigrations(db); runMigrations(db);
      db.exec('DELETE FROM schema_migrations'); runMigrations(db);
      expect(db.prepare('SELECT * FROM learners').all()).toEqual([]);
      expect(db.prepare('PRAGMA table_info(course_progress)').all().filter((r: any) => r.pk).map((r: any) => r.name)).toEqual(['learner_id', 'course_id']);
    } finally { db.close(); }
  });
  it('can resume a migrated legacy breakpoint and persist the next turn', () => {
    const db = legacyDb();
    db.prepare('INSERT INTO course_progress VALUES (?, ?, ?, ?, ?)').run('food', JSON.stringify(snapshot()), 'interactive', 0, '2026-01-01T00:00:00Z');
    runMigrations(db);
    const spy = vi.spyOn(dbIndex, 'getDb').mockReturnValue(db);
    try {
      const progress = getCourseProgress('food', 'legacy-learner')!;
      const session = createSessionFromSnapshot(foodCourse, progress, 'legacy-learner');
      expect(session.memory.clearedCardIds).toEqual(['apple']);
      expect(session.currentPhase).toBe('interactive');
      expect(recordQuizAnswer(session.id, 'legacy-quiz', 'apple', true)).toBe(true);
      endSession(session.id);
      expect(getCourseProgress('food', 'legacy-learner')?.snapshot.passedQuizIds).toContain('legacy-quiz');
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { spy.mockRestore(); db.close(); }
  });
  it.each(['lessons', 'breakpoint', 'both'])('assigns all legacy %s records and preserves resumable snapshots', (records) => {
    const db = legacyDb();
    try {
      if (records !== 'breakpoint') db.exec("INSERT INTO lesson_logs (id, course_id, start_time) VALUES ('old', 'food', '2026-01-01')");
      if (records !== 'lessons') db.prepare('INSERT INTO course_progress VALUES (?, ?, ?, ?, ?)').run('food', JSON.stringify(snapshot()), 'interactive', 0, '2026-01-01T00:00:00Z');
      runMigrations(db);
      expect(db.prepare('SELECT id, name FROM learners').all()).toEqual([{ id: 'legacy-learner', name: '宝贝' }]);
      if (records !== 'breakpoint') expect(db.prepare('SELECT learner_id FROM lesson_logs').get()).toEqual({ learner_id: 'legacy-learner' });
      if (records !== 'lessons') {
        const row = db.prepare('SELECT * FROM course_progress').get() as any;
        expect(JSON.parse(row.snapshot)).toEqual(snapshot()); expect(row.phase).toBe('interactive');
        expect(buildProgressSnapshot(db, [foodCourse], 'legacy-learner').courses[0].hasResume).toBe(true);
      }
      db.exec('DELETE FROM schema_migrations'); runMigrations(db);
      expect(db.prepare('SELECT COUNT(*) AS n FROM learners').get()).toEqual({ n: 1 });
      db.pragma('foreign_keys = ON');
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });
});

describe('learner isolation and deletion', () => {
  beforeEach(() => {
    getDb().exec('DELETE FROM interaction_logs; DELETE FROM word_performance; DELETE FROM course_progress; DELETE FROM lesson_logs; DELETE FROM learners;');
  });
  it('isolates A/B progress, stats, session lists, and resuming the same course', () => {
    const a = createLearner('A'); const b = createLearner('B');
    createLessonLog('lesson-a', 'food', a.id);
    getDb().exec("UPDATE lesson_logs SET start_time='2026-01-01T00:00:00Z', end_time='2026-01-01T00:10:00Z'");
    upsertWordPerformance('lesson-a', 'apple', true);
    upsertCourseProgress('food', snapshot(), 'interactive', false, a.id);
    expect(buildProgressSnapshot(getDb(), [foodCourse], a.id).courses[0]).toMatchObject({ timesStarted: 1, hasResume: true });
    expect(buildProgressSnapshot(getDb(), [foodCourse], b.id).courses[0]).toMatchObject({ timesStarted: 0, hasResume: false, progressPercent: 0 });
    expect(buildStatsSnapshot(getDb(), a.id)).toMatchObject({ totalSessions: 1, totalMinutes: 10 });
    expect(buildStatsSnapshot(getDb(), b.id)).toMatchObject({ totalSessions: 0, totalMinutes: 0 });
    expect(buildSessionList(getDb(), [foodCourse], a.id).map((s) => s.lessonId)).toEqual(['lesson-a']);
    expect(buildSessionList(getDb(), [foodCourse], b.id)).toEqual([]);
    expect(getCourseProgress('food', b.id)).toBeUndefined();
    const resumed = createSessionFromSnapshot(foodCourse, getCourseProgress('food', a.id)!, a.id);
    expect(resumed.learnerId).toBe(a.id); expect(resumed.memory.clearedCardIds).toEqual(['apple']);
    const fresh = createSession(foodCourse, b.id);
    expect(fresh.memory.clearedCardIds).toEqual([]);
    endSession(resumed.id); endSession(fresh.id);
    expect(getCourseProgress('food', a.id)?.snapshot.clearedCardIds).toEqual(['apple']);
    expect(getCourseProgress('food', b.id)?.snapshot.clearedCardIds).toEqual([]);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM course_progress WHERE course_id = ?').get('food')).toEqual({ n: 2 });
  });
  it('cascades all A records in one transaction and stops live sessions while B remains intact', () => {
    const a = createLearner('A'); const b = createLearner('B');
    const session = createSession(foodCourse, a.id);
    createLessonLog('b', 'food', b.id);
    for (const id of [session.id, 'b']) {
      upsertWordPerformance(id, 'apple', true);
      insertInteraction(id, { timestamp: new Date(), userInput: 'apple', aiResponse: '', actions: [], modelCalls: { llm: { latency: 0, inputTokens: 0, outputTokens: 0 } } });
    }
    upsertCourseProgress('food', snapshot(), 'interactive', false, a.id);
    upsertCourseProgress('food', snapshot(), 'interactive', false, b.id);
    expect(deleteLearner(a.id)).toBe(true);
    expect(getSession(session.id)).toBeUndefined();
    expect(recordQuizAnswer(session.id, 'q1', 'apple', true)).toBe(false);
    endSession(session.id);
    expect(listLearners().map((l) => l.id)).toEqual([b.id]);
    for (const table of ['lesson_logs', 'interaction_logs', 'word_performance', 'course_progress']) expect(getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 1 });
    expect(getDb().prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(deleteLearner(a.id)).toBe(false);
  });
  it('rolls back the complete deletion if a dependent write fails', () => {
    const a = createLearner('A'); createLessonLog('a', 'food', a.id); upsertWordPerformance('a', 'apple', true);
    getDb().exec("CREATE TRIGGER fail_delete BEFORE DELETE ON lesson_logs BEGIN SELECT RAISE(ABORT, 'injected'); END");
    try {
      expect(() => deleteLearner(a.id)).toThrow('injected');
      expect(listLearners()).toHaveLength(1);
      expect(getDb().prepare('SELECT COUNT(*) AS n FROM word_performance').get()).toEqual({ n: 1 });
    } finally { getDb().exec('DROP TRIGGER fail_delete'); }
  });
  it('rejects a start without learnerId or with a non-existent learnerId', async () => {
    vi.stubEnv('VOICE_MOCK', 'true');
    try {
      for (const [learnerId, status] of [[undefined, 400], ['missing', 404]] as const) {
        const res = await POST({ json: async () => ({ action: 'start', courseId: 'food', learnerId }) } as any);
        expect(res.status).toBe(status);
      }
      expect(getDb().prepare('SELECT * FROM lesson_logs').all()).toEqual([]);
    } finally { vi.unstubAllEnvs(); }
  });
});

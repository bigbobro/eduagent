import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// touchLessonLog/createLessonLog go through getDb() (the DB_PATH singleton), so point it at a
// throwaway in-memory database. path.resolve mangles the literal ':memory:' through DATABASE_PATH,
// so mock the module instead of setting the env var.
const holder = vi.hoisted(() => ({ db: null as import('better-sqlite3').Database | null }));
vi.mock('./index', async () => {
  const Database = (await import('better-sqlite3')).default;
  holder.db = new Database(':memory:');
  return { getDb: () => holder.db };
});

import { runMigrations } from './schema';
import { createLessonLog, finishLessonLog, touchLessonLog, getRecentLessons } from './queries';
import { buildStatsSnapshot } from '../stats';

const db = () => holder.db!;

beforeAll(() => runMigrations(db()));
beforeEach(() => db().exec('DELETE FROM lesson_logs'));

describe('touchLessonLog — incremental lesson finalization', () => {
  it('turns a fresh lesson\'s NULL end_time into a set one and tracks interaction_count', () => {
    createLessonLog('l1', 'food');
    expect(getRecentLessons(db(), 10)[0].endTime).toBeNull();

    touchLessonLog('l1', 4);

    const row = getRecentLessons(db(), 10)[0];
    expect(row.endTime).not.toBeNull();
    expect(row.interactionCount).toBe(4);
  });

  it('lets stats compute a real duration for a lesson that never sent action:end', () => {
    // Kid started 15 min ago, then closed the tab → finishLessonLog never ran.
    const start = new Date(Date.now() - 15 * 60_000).toISOString();
    db()
      .prepare("INSERT INTO lesson_logs (id, course_id, start_time, interaction_count) VALUES ('l2','food',?,0)")
      .run(start);
    expect(buildStatsSnapshot(db()).totalMinutes).toBe(0); // NULL end_time counts as 0 duration

    touchLessonLog('l2', 9);

    expect(buildStatsSnapshot(db()).totalMinutes).toBeGreaterThanOrEqual(14);
  });

  it('finishLessonLog still overwrites end_time as the graceful final flush', () => {
    createLessonLog('l3', 'food');
    touchLessonLog('l3', 2);
    const mid = getRecentLessons(db(), 10)[0].endTime;

    finishLessonLog('l3', 6, {
      asr: { requests: 0, tokens: 0 },
      llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
      tts: { requests: 0, characters: 0 },
    });

    const row = getRecentLessons(db(), 10)[0];
    expect(row.endTime).not.toBeNull();
    expect(row.endTime! >= mid!).toBe(true);
    expect(row.interactionCount).toBe(6);
  });
});

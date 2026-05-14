import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { buildStatsSnapshot, buildSessionList } from './stats';
import { allCourses } from '@/data/courses/transportation';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
    CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
  `);
  return db;
}

describe('buildStatsSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00'));
  });

  it('empty DB → zeros and 7-day array', () => {
    const s = buildStatsSnapshot(makeDb());
    expect(s.totalMinutes).toBe(0);
    expect(s.totalSessions).toBe(0);
    expect(s.last7Days).toHaveLength(7);
    expect(s.last7Days.every((d) => d.minutes === 0)).toBe(true);
  });

  it('distributes minutes across 7 days by startTime local date', () => {
    const db = makeDb();
    db.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-13T11:50:00','2026-05-13T12:05:00',5,'{}')`).run();
    db.prepare(`INSERT INTO lesson_logs VALUES ('l2','transportation','2026-05-10T09:00:00','2026-05-10T10:00:00',10,'{}')`).run();
    const s = buildStatsSnapshot(db);
    expect(s.totalSessions).toBe(2);
    expect(s.totalMinutes).toBe(75);
    const today = s.last7Days[6];
    expect(today.minutes).toBe(15);
    const threeDaysAgo = s.last7Days[3];
    expect(threeDaysAgo.minutes).toBe(60);
  });
});

describe('buildSessionList', () => {
  it('default limit=10, DESC by startTime', () => {
    const db = makeDb();
    for (let i = 0; i < 15; i++) {
      const start = new Date(2026, 4, 1 + i, 10, 0, 0).toISOString();
      const end = new Date(2026, 4, 1 + i, 10, 30, 0).toISOString();
      db.prepare(`INSERT INTO lesson_logs VALUES (?,?,?,?,?,?)`).run(`l${i}`, 'transportation', start, end, 3, '{}');
    }
    const list = buildSessionList(db, allCourses);
    expect(list).toHaveLength(10);
    expect(list[0].lessonId).toBe('l14');
    expect(list[9].lessonId).toBe('l5');
  });

  it('counts mastered words (ratio ≥ 0.6)', () => {
    const db = makeDb();
    db.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-12T10:00:00','2026-05-12T10:15:00',5,'{}')`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','car',10,9,1)`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','bus',5,2,3)`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','train',5,3,2)`).run();
    const list = buildSessionList(db, allCourses);
    expect(list[0].wordsAttempted).toBe(3);
    expect(list[0].wordsMastered).toBe(2);
  });
});

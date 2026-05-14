import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const memDb = new Database(':memory:');
memDb.exec(`
  CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
  CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
`);
vi.mock('@/lib/db', () => ({ getDb: () => memDb }));

import { GET } from '@/app/api/progress/route';

describe('/api/progress', () => {
  beforeEach(() => {
    memDb.exec('DELETE FROM word_performance; DELETE FROM lesson_logs;');
  });

  it('empty DB returns ProgressSnapshot shape', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('courses');
    expect(json).toHaveProperty('totalWordsMastered', 0);
    expect(json).toHaveProperty('generatedAt');
  });

  it('derives mastery correctly when data present', async () => {
    memDb.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-10T10:00:00Z','2026-05-10T10:15:00Z',5,'{}')`).run();
    memDb.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','car',10,10,0)`).run();
    const res = await GET();
    const json = await res.json();
    const transport = json.courses.find((c: any) => c.courseId === 'transportation');
    const car = transport.words.find((w: any) => w.word === 'car');
    expect(car.masteryStars).toBe(3);
    expect(json.totalWordsMastered).toBeGreaterThanOrEqual(1);
  });
});

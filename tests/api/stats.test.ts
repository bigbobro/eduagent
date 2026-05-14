import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const memDb = new Database(':memory:');
memDb.exec(`
  CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
  CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
`);
vi.mock('@/lib/db', () => ({ getDb: () => memDb }));

import { GET } from '@/app/api/stats/route';

beforeEach(() => {
  memDb.exec('DELETE FROM lesson_logs; DELETE FROM word_performance;');
});

describe('/api/stats', () => {
  it('empty DB shape', async () => {
    const res = await GET();
    const json = await res.json();
    expect(json.totalMinutes).toBe(0);
    expect(json.totalSessions).toBe(0);
    expect(json.totalWordsMastered).toBe(0);
    expect(json.last7Days).toHaveLength(7);
  });

  it('totalWordsMastered matches progress aggregator', async () => {
    memDb.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-10T10:00:00Z','2026-05-10T10:30:00Z',3,'{}')`).run();
    memDb.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','car',10,10,0)`).run();
    const res = await GET();
    const json = await res.json();
    expect(json.totalWordsMastered).toBeGreaterThanOrEqual(1);
    expect(json.totalSessions).toBe(1);
    expect(json.totalMinutes).toBeGreaterThanOrEqual(29);
  });
});

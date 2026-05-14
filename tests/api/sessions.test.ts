import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const memDb = new Database(':memory:');
memDb.exec(`
  CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
  CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
`);
vi.mock('@/lib/db', () => ({ getDb: () => memDb }));

import { GET } from '@/app/api/sessions/route';

beforeEach(() => {
  memDb.exec('DELETE FROM lesson_logs; DELETE FROM word_performance;');
});

describe('/api/sessions', () => {
  it('default limit=10, DESC sort', async () => {
    for (let i = 0; i < 12; i++) {
      const dt = `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`;
      memDb.prepare(`INSERT INTO lesson_logs VALUES (?, 'transportation', ?, ?, 3, '{}')`).run(`s${i}`, dt, dt);
    }
    const req = new Request('http://x/api/sessions');
    const res = await GET(req);
    const json = await res.json();
    expect(json).toHaveLength(10);
    expect(json[0].lessonId).toBe('s11');
  });

  it('?limit=3 takes effect', async () => {
    for (let i = 0; i < 5; i++) {
      const dt = `2026-05-0${i + 1}T10:00:00Z`;
      memDb.prepare(`INSERT INTO lesson_logs VALUES (?, 'transportation', ?, ?, 1, '{}')`).run(`s${i}`, dt, dt);
    }
    const req = new Request('http://x/api/sessions?limit=3');
    const res = await GET(req);
    const json = await res.json();
    expect(json).toHaveLength(3);
  });
});

import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { buildReport, defaultCourseLoader, type CourseLoader } from './lesson-report-data';

function createMemDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE lesson_logs (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      interaction_count INTEGER DEFAULT 0,
      token_usage TEXT DEFAULT '{}'
    );
    CREATE TABLE interaction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      user_input TEXT DEFAULT '',
      ai_response TEXT DEFAULT '',
      actions TEXT DEFAULT '[]',
      model_calls TEXT DEFAULT '{}'
    );
  `);
  return db;
}

interface SeedSession {
  id: string;
  courseId: string;
  startTime: string;
  endTime?: string | null;
  tokenUsage?: object;
  interactions?: Array<{ user: string; ai: string; actions?: unknown[]; ts?: string; modelCalls?: object }>;
}

function seedSession(db: Database.Database, s: SeedSession): void {
  db.prepare(
    'INSERT INTO lesson_logs (id, course_id, start_time, end_time, interaction_count, token_usage) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    s.id,
    s.courseId,
    s.startTime,
    s.endTime ?? null,
    s.interactions?.length ?? 0,
    JSON.stringify(s.tokenUsage ?? {})
  );
  s.interactions?.forEach((it, i) => {
    db.prepare(
      'INSERT INTO interaction_logs (lesson_id, timestamp, user_input, ai_response, actions, model_calls) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      s.id,
      it.ts ?? new Date(Date.parse(s.startTime) + i * 1000).toISOString(),
      it.user,
      it.ai,
      JSON.stringify(it.actions ?? []),
      JSON.stringify(it.modelCalls ?? {})
    );
  });
}

const noopCourseLoader: CourseLoader = async () => null;

const stubFoodLoader: CourseLoader = async (id) =>
  id === 'food'
    ? { title: '食物 Food', words: ['apple', 'banana', 'bread', 'milk', 'egg', 'rice'] }
    : null;

describe('buildReport — basic aggregation', () => {
  it('reads session + interactions + token totals', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 'sess-1',
      courseId: 'food',
      startTime: '2026-05-02T04:17:35.000Z',
      endTime: '2026-05-02T04:27:28.000Z',
      tokenUsage: {
        llm: { requests: 2, inputTokens: 2400, outputTokens: 200 },
        asr: { requests: 0, tokens: 0 },
        tts: { requests: 0, characters: 0 },
      },
      interactions: [
        { user: '(开始)', ai: 'hello', actions: [{ tool: 'show_card', params: { card_id: 'apple' } }],
          modelCalls: { llm: { inputTokens: 1200 } } },
        { user: 'apple', ai: 'great', actions: [],
          modelCalls: { llm: { inputTokens: 1200 } } },
      ],
    });

    const r = await buildReport(db, 'sess-1', noopCourseLoader);

    expect(r.session.id).toBe('sess-1');
    expect(r.session.courseId).toBe('food');
    expect(r.session.startTime).toBe('2026-05-02T04:17:35.000Z');
    expect(r.session.endTime).toBe('2026-05-02T04:27:28.000Z');
    expect(r.session.durationSec).toBe(593);
    expect(r.session.ended).toBe(true);
    expect(r.session.interactionCount).toBe(2);
    expect(r.tokens.llm.requests).toBe(2);
    expect(r.tokens.llm.input).toBe(2400);
    expect(r.tokens.llm.output).toBe(200);
    expect(r.tokens.llm.avgInputPerRound).toBe(1200);
    expect(r.tokens.llm.maxInput).toBe(1200);
    expect(r.interactions).toHaveLength(2);
    expect(r.interactions[0].n).toBe(1);
    expect(r.interactions[0].user).toBe('(开始)');
    expect(r.interactions[0].actions).toEqual([{ tool: 'show_card', params: { card_id: 'apple' } }]);
  });

  it('returns the latest session when no id provided', async () => {
    const db = createMemDb();
    seedSession(db, { id: 'old', courseId: 'food', startTime: '2026-04-01T00:00:00.000Z' });
    seedSession(db, { id: 'new', courseId: 'food', startTime: '2026-05-02T00:00:00.000Z' });

    const r = await buildReport(db, null, noopCourseLoader);
    expect(r.session.id).toBe('new');
  });
});

describe('buildReport — anomaly flags', () => {
  it('highAvgInput=true when avg > 1000', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z',
      interactions: [
        { user: 'a', ai: 'a', modelCalls: { llm: { inputTokens: 1500 } } },
        { user: 'b', ai: 'b', modelCalls: { llm: { inputTokens: 1500 } } },
      ],
    });
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.highAvgInput).toBe(true);
  });

  it('highAvgInput=false when avg <= 1000', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z',
      interactions: [
        { user: 'a', ai: 'a', modelCalls: { llm: { inputTokens: 800 } } },
        { user: 'b', ai: 'b', modelCalls: { llm: { inputTokens: 1000 } } },
      ],
    });
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.highAvgInput).toBe(false);
  });

  it('asrUsageNotTracked=true when asr.requests=0', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z',
      tokenUsage: { asr: { requests: 0 }, tts: { requests: 0 } },
    });
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.asrUsageNotTracked).toBe(true);
    expect(r.anomalies.ttsUsageNotTracked).toBe(true);
    expect(r.tokens.asr.tracked).toBe(false);
  });

  it('asrUsageNotTracked=false when asr.requests>0', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z',
      tokenUsage: { asr: { requests: 5 }, tts: { requests: 3 } },
    });
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.asrUsageNotTracked).toBe(false);
    expect(r.anomalies.ttsUsageNotTracked).toBe(false);
    expect(r.tokens.asr.tracked).toBe(true);
  });

  it('tokensCorrupted=true when token_usage is invalid JSON', async () => {
    const db = createMemDb();
    db.prepare(
      'INSERT INTO lesson_logs (id, course_id, start_time, token_usage) VALUES (?, ?, ?, ?)'
    ).run('s', 'x', '2026-01-01T00:00:00.000Z', '{not json');
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.tokensCorrupted).toBe(true);
    expect(r.tokens.llm.input).toBe(0);
    expect(r.tokens.asr.requests).toBe(0);
  });
});

describe('buildReport — course definition', () => {
  it('populates courseTitle and targetWords from courseLoader', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'food', startTime: '2026-01-01T00:00:00.000Z' });

    const r = await buildReport(db, 's', stubFoodLoader);
    expect(r.session.courseTitle).toBe('食物 Food');
    expect(r.session.targetWords).toEqual(['apple', 'banana', 'bread', 'milk', 'egg', 'rice']);
  });

  it('lowercases all targetWords', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'mixed', startTime: '2026-01-01T00:00:00.000Z' });
    const loader: CourseLoader = async () => ({ title: 'Mixed', words: ['Cat', 'DOG', 'Bird'] });

    const r = await buildReport(db, 's', loader);
    expect(r.session.targetWords).toEqual(['cat', 'dog', 'bird']);
  });

  it('falls back when course not found', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'unknown', startTime: '2026-01-01T00:00:00.000Z' });

    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.session.courseTitle).toBe('unknown');
    expect(r.session.targetWords).toEqual([]);
  });

  it('defaultCourseLoader reads phased word cards', async () => {
    const course = await defaultCourseLoader('food');

    expect(course?.title).toBe('食物 Food');
    expect(course?.words).toEqual([
      'apple',
      'banana',
      'bread',
      'milk',
      'egg',
      'rice',
      'water',
      'juice',
      'cake',
      'cheese',
      'carrot',
      'chicken',
    ]);
  });
});

describe('buildReport — edge cases', () => {
  it('endTime null → ended=false, durationSec=null', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z', endTime: null });

    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.session.ended).toBe(false);
    expect(r.session.durationSec).toBeNull();
  });

  it('empty interactions → counts and avgs default to 0, no throw', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z' });

    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.session.interactionCount).toBe(0);
    expect(r.tokens.llm.avgInputPerRound).toBe(0);
    expect(r.tokens.llm.maxInput).toBe(0);
    expect(r.anomalies.highAvgInput).toBe(false);
    expect(r.interactions).toEqual([]);
  });

  it('throws when sessionId not found', async () => {
    const db = createMemDb();
    await expect(buildReport(db, 'nope', noopCourseLoader)).rejects.toThrow(/session not found/);
  });
});

import Database from '../src/lib/db/sqlite';
import { describe, it, expect } from 'vitest';
import { buildReport, defaultCourseLoader, type CourseLoader } from './lesson-report-data';

function createMemDb(): Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE lesson_logs (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      interaction_count INTEGER DEFAULT 0,
      token_usage TEXT DEFAULT '{}',
      ended_gracefully INTEGER DEFAULT 0
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
    CREATE TABLE word_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL,
      word TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      needs_review INTEGER DEFAULT 0
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
  endedGracefully?: boolean;
  interactions?: Array<{ user: string; ai: string; actions?: unknown[]; ts?: string; modelCalls?: object }>;
}

function seedSession(db: Database, s: SeedSession): void {
  db.prepare(
    'INSERT INTO lesson_logs (id, course_id, start_time, end_time, interaction_count, token_usage, ended_gracefully) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    s.id,
    s.courseId,
    s.startTime,
    s.endTime ?? null,
    s.interactions?.length ?? 0,
    JSON.stringify(s.tokenUsage ?? {}),
    s.endedGracefully ? 1 : 0
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

function seedWordPerformance(
  db: Database,
  lessonId: string,
  rows: Array<{ word: string; attempts: number; correct: number; needsReview?: number }>,
): void {
  rows.forEach((row) => {
    db.prepare(
      'INSERT INTO word_performance (lesson_id, word, attempts, correct, needs_review) VALUES (?, ?, ?, ?, ?)'
    ).run(lessonId, row.word, row.attempts, row.correct, row.needsReview ?? 0);
  });
}

const noopCourseLoader: CourseLoader = async () => null;

const stubFoodLoader: CourseLoader = async (id) =>
  id === 'food'
    ? {
        title: '食物 Food',
        words: ['apple', 'banana', 'bread', 'milk', 'egg', 'rice'],
        wordCards: [
          { id: 'apple', english: 'apple', chinese: '苹果' },
          { id: 'banana', english: 'banana', chinese: '香蕉' },
          { id: 'bread', english: 'bread', chinese: '面包' },
          { id: 'milk', english: 'milk', chinese: '牛奶' },
          { id: 'egg', english: 'egg', chinese: '鸡蛋' },
          { id: 'rice', english: 'rice', chinese: '米饭' },
        ],
      }
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

    expect(r.session.learnerId).toBeNull();
    db.exec("ALTER TABLE lesson_logs ADD COLUMN learner_id TEXT; UPDATE lesson_logs SET learner_id = 'learner-a' WHERE id = 'sess-1'");
    expect((await buildReport(db, 'sess-1', noopCourseLoader)).session.learnerId).toBe('learner-a');
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
    expect(r.tokens.llm.promptInputBreakdown.trackedTurns).toBe(0);
    expect(r.eval.sessionHealth.ended).toBe(true);
    expect(r.eval.costContext.llmInputTokens).toBe(2400);
    expect(r.interactions).toHaveLength(2);
    expect(r.interactions[0].n).toBe(1);
    expect(r.interactions[0].user).toBe('(开始)');
    expect(r.interactions[0].actions).toEqual([{ tool: 'show_card', params: { card_id: 'apple' } }]);
    expect(r).not.toHaveProperty('childUtterances');
    expect(r).not.toHaveProperty('notAttempts');
    expect(r).not.toHaveProperty('targetRuns');
  });

  it('returns the latest session when no id provided', async () => {
    const db = createMemDb();
    seedSession(db, { id: 'old', courseId: 'food', startTime: '2026-04-01T00:00:00.000Z' });
    seedSession(db, { id: 'new', courseId: 'food', startTime: '2026-05-02T00:00:00.000Z' });

    const r = await buildReport(db, null, noopCourseLoader);
    expect(r.session.id).toBe('new');
  });
});

describe('buildReport — prompt input breakdown', () => {
  it('aggregates per-turn LLM input composition from model calls', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 's',
      courseId: 'food',
      startTime: '2026-01-01T00:00:00.000Z',
      interactions: [
        {
          user: 'a',
          ai: 'a',
          modelCalls: {
            llm: {
              inputTokens: 1000,
              inputBreakdown: {
                totalChars: 1000,
                systemChars: 800,
                messageChars: 200,
                messageCount: 2,
                buckets: [
                  { key: 'static_rules', label: 'Role and static rules', chars: 400, estimatedTokens: 400 },
                  { key: 'course_definition', label: 'Course definition', chars: 300, estimatedTokens: 300 },
                  { key: 'history', label: 'LLM message history', chars: 200, estimatedTokens: 200 },
                  { key: 'prompt_separators', label: 'Prompt separators', chars: 100, estimatedTokens: 100 },
                ],
              },
            },
          },
        },
        {
          user: 'b',
          ai: 'b',
          modelCalls: {
            llm: {
              inputTokens: 2000,
              inputBreakdown: {
                totalChars: 2000,
                systemChars: 1600,
                messageChars: 400,
                messageCount: 4,
                buckets: [
                  { key: 'static_rules', label: 'Role and static rules', chars: 800, estimatedTokens: 800 },
                  { key: 'course_definition', label: 'Course definition', chars: 700, estimatedTokens: 700 },
                  { key: 'history', label: 'LLM message history', chars: 400, estimatedTokens: 400 },
                  { key: 'prompt_separators', label: 'Prompt separators', chars: 100, estimatedTokens: 100 },
                ],
              },
            },
          },
        },
      ],
    });

    const r = await buildReport(db, 's', noopCourseLoader);
    const breakdown = r.tokens.llm.promptInputBreakdown;

    expect(breakdown.trackedTurns).toBe(2);
    expect(breakdown.avgTotalChars).toBe(1500);
    expect(breakdown.avgSystemChars).toBe(1200);
    expect(breakdown.avgMessageChars).toBe(300);
    expect(breakdown.avgMessageCount).toBe(3);
    expect(breakdown.largestBucket).toEqual({
      key: 'static_rules',
      label: 'Role and static rules',
      by: 'estimatedTokens',
      value: 1200,
    });
    expect(breakdown.buckets[0]).toMatchObject({
      key: 'static_rules',
      totalChars: 1200,
      avgChars: 600,
      totalEstimatedTokens: 1200,
      avgEstimatedTokens: 600,
      shareOfEstimatedTokens: 0.4,
    });
    expect(r.eval.costContext.promptBreakdownTrackedTurns).toBe(2);
    expect(r.eval.costContext.promptBreakdownCoverageRate).toBe(1);
    expect(r.eval.costContext.largestPromptBucket).toMatchObject({
      key: 'static_rules',
      shareOfEstimatedTokens: 0.4,
      avgEstimatedTokens: 600,
    });
  });
});

describe('buildReport — Eval v1 scorecard', () => {
  it('quantifies session health, cost/context, teaching-loop outcomes, behavior, and signals', async () => {
    const db = createMemDb();
    const breakdown = {
      totalChars: 1200,
      systemChars: 900,
      messageChars: 300,
      messageCount: 3,
      buckets: [
        { key: 'static_rules', label: 'Role and static rules', chars: 700, estimatedTokens: 700 },
        { key: 'course_definition', label: 'Course definition', chars: 300, estimatedTokens: 300 },
        { key: 'history', label: 'LLM message history', chars: 200, estimatedTokens: 200 },
      ],
    };
    seedSession(db, {
      id: 'eval-1',
      courseId: 'food',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T00:08:00.000Z',
      tokenUsage: {
        llm: { requests: 4, inputTokens: 4800, outputTokens: 400 },
        asr: { requests: 3, tokens: 0 },
        tts: { requests: 4, characters: 240 },
      },
      interactions: [
        {
          user: '(开始)',
          ai: 'This is apple.',
          actions: [{ tool: 'show_card', params: { card_id: 'apple' } }],
          modelCalls: { llm: { inputTokens: 1200, outputTokens: 100, inputBreakdown: breakdown } },
        },
        {
          user: 'apple',
          ai: 'Good apple.',
          actions: [{ tool: 'show_card', params: { card_id: 'apple' } }],
          modelCalls: { llm: { inputTokens: 1200, outputTokens: 100, inputBreakdown: breakdown } },
        },
        {
          user: 'apple',
          ai: 'Great apple. Now banana.',
          actions: [{ tool: 'show_card', params: { card_id: 'banana' } }],
          modelCalls: { llm: { inputTokens: 1200, outputTokens: 100, inputBreakdown: breakdown } },
        },
        {
          user: 'banana',
          ai: '今天我们一起练了 apple, 下次再来玩吧。',
          actions: [{ tool: 'show_card', params: { card_id: 'banana' } }],
          modelCalls: { llm: { inputTokens: 1200, outputTokens: 100, inputBreakdown: breakdown } },
        },
      ],
    });
    seedWordPerformance(db, 'eval-1', [
      { word: 'apple', attempts: 2, correct: 2 },
      { word: 'banana', attempts: 3, correct: 1, needsReview: 1 },
    ]);

    const r = await buildReport(db, 'eval-1', stubFoodLoader);

    expect(r.eval.sessionHealth).toMatchObject({
      status: 'ok',
      ended: true,
      durationSec: 480,
      interactionCount: 4,
      recordedInteractionCount: 4,
      interactionCountMatchesLog: true,
      llmRequestsPerInteraction: 1,
      providerUsageTracked: { asr: true, tts: true },
      tokensCorrupted: false,
      issues: [],
    });
    expect(r.eval.costContext).toMatchObject({
      llmRequests: 4,
      llmInputTokens: 4800,
      avgInputPerRound: 1200,
      highAvgInput: true,
      promptBreakdownTrackedTurns: 4,
      promptBreakdownCoverageRate: 1,
      largestPromptBucket: {
        key: 'static_rules',
        shareOfEstimatedTokens: 0.5833,
        avgEstimatedTokens: 700,
      },
    });
    expect(r.eval.teachingLoop).toMatchObject({
      targetWordCount: 6,
      attemptedWordCount: 2,
      clearedWordCount: 1,
      needsReviewWordCount: 1,
      coverageRate: 0.3333,
      clearRate: 0.1667,
      attemptsPerClearedWord: 2,
      totalAttempts: 5,
      totalCorrect: 3,
    });
    expect(r.eval.teachingLoop.words.find((word) => word.word === 'apple')).toMatchObject({
      attempts: 2,
      correct: 2,
      cleared: true,
    });
    expect(r.eval.agentBehavior.prematureClosingTurns).toEqual([4]);
    expect(r.eval.nextIterationSignals.map((s) => s.key)).toEqual(expect.arrayContaining([
      'prompt_input_slimming',
      'coverage_gap',
      'clear_rate_low',
      'needs_review',
      'premature_closing',
    ]));
  });

  it('keeps historical rows readable when word performance table and prompt breakdown are missing', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 'old',
      courseId: 'food',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T00:02:00.000Z',
      tokenUsage: {
        llm: { requests: 1, inputTokens: 900, outputTokens: 90 },
        asr: { requests: 0, tokens: 0 },
        tts: { requests: 0, characters: 0 },
      },
      interactions: [
        {
          user: 'apple',
          ai: 'Good apple.',
          actions: [{ tool: 'show_card', params: { card_id: 'apple' } }],
          modelCalls: { llm: { inputTokens: 900, outputTokens: 90 } },
        },
      ],
    });
    db.exec('DROP TABLE word_performance');

    const r = await buildReport(db, 'old', stubFoodLoader);

    expect(r.eval.teachingLoop.attemptedWordCount).toBe(0);
    expect(r.eval.teachingLoop.clearRate).toBe(0);
    expect(r.eval.costContext.promptBreakdownTrackedTurns).toBe(0);
    expect(r.eval.costContext.promptBreakdownCoverageRate).toBe(0);
    expect(r.eval.sessionHealth.status).toBe('warn');
    expect(r.eval.sessionHealth.issues).toEqual(['asr_usage_not_tracked', 'tts_usage_not_tracked']);
    expect(r.eval.nextIterationSignals.map((s) => s.key)).toEqual(expect.arrayContaining([
      'provider_tracking',
      'prompt_breakdown_missing',
      'coverage_gap',
    ]));
  });

  it('detects residual speech/card mismatch, stuck-card runs, and repeated speech', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 'behavior',
      courseId: 'food',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T00:03:00.000Z',
      tokenUsage: {
        llm: { requests: 3, inputTokens: 2400, outputTokens: 240 },
        asr: { requests: 3, tokens: 0 },
        tts: { requests: 3, characters: 120 },
      },
      interactions: [
        {
          user: 'apple',
          ai: 'Say banana again.',
          actions: [{ tool: 'show_card', params: { card_id: 'apple' } }],
          modelCalls: { llm: { inputTokens: 800, outputTokens: 80 } },
        },
        {
          user: 'apple',
          ai: 'Say banana again.',
          actions: [{ tool: 'show_card', params: { card_id: 'apple' } }],
          modelCalls: { llm: { inputTokens: 800, outputTokens: 80 } },
        },
        {
          user: 'apple',
          ai: 'Say banana again.',
          actions: [{ tool: 'show_card', params: { card_id: 'apple' } }],
          modelCalls: { llm: { inputTokens: 800, outputTokens: 80 } },
        },
      ],
    });
    seedWordPerformance(db, 'behavior', [
      { word: 'apple', attempts: 3, correct: 0, needsReview: 1 },
    ]);

    const r = await buildReport(db, 'behavior', stubFoodLoader);

    expect(r.eval.teachingLoop.stuckCardRuns).toEqual([
      { cardId: 'apple', startTurn: 1, endTurn: 3, length: 3 },
    ]);
    expect(r.eval.agentBehavior.speechCardMismatchCount).toBe(3);
    expect(r.eval.agentBehavior.speechCardMismatches?.[0]).toEqual({
      turn: 1,
      showCardId: 'apple',
      mentionedOtherCardId: 'banana',
    });
    expect(r.eval.agentBehavior.repeatedSpeechRuns).toEqual([
      { startTurn: 1, endTurn: 3, length: 3, sample: 'Say banana again.' },
    ]);
    expect(r.eval.nextIterationSignals.map((s) => s.key)).toEqual(expect.arrayContaining([
      'teaching_loop_stuck',
      'speech_card_alignment',
      'repeated_speech',
    ]));
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

// R1 (2026-07-04, session 6f6e7bec): touchLessonLog now writes token_usage every turn, so a
// non-empty token_usage no longer implies action:'end' fired. endedGracefully reads the
// dedicated flag instead of piggybacking on `ended` (end_time non-NULL).
describe('buildReport — sessionHealth.endedGracefully (R1)', () => {
  it('is true when the lesson was finished via the graceful action:end path', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 'graceful', courseId: 'food', startTime: '2026-07-04T00:00:00.000Z',
      endTime: '2026-07-04T00:10:00.000Z', endedGracefully: true,
    });
    const r = await buildReport(db, 'graceful', noopCourseLoader);
    expect(r.eval.sessionHealth.ended).toBe(true);
    expect(r.eval.sessionHealth.endedGracefully).toBe(true);
  });

  it('is false for a touch-only lesson even though end_time and token_usage are both set', () => {
    const db = createMemDb();
    seedSession(db, {
      id: 'touched', courseId: 'food', startTime: '2026-07-04T00:00:00.000Z',
      endTime: '2026-07-04T00:10:00.000Z', // touchLessonLog sets this every turn
      tokenUsage: { llm: { requests: 5, inputTokens: 5000, outputTokens: 500 } },
      // endedGracefully omitted → 0
    });
    return buildReport(db, 'touched', noopCourseLoader).then((r) => {
      expect(r.eval.sessionHealth.ended).toBe(true); // end_time non-NULL — unchanged semantics
      expect(r.eval.sessionHealth.endedGracefully).toBe(false); // but never graceful-finished
    });
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

// ─── R-C 权威账本(schema v2,2026-07-03 方案 A)──────────────────────────────
// 真实事故:2026-07-03 sports 课运行时 12 词全部 R-C 过关,但 word_performance 的
// LLM 判定账本每词只有 correct=1,报告按 correct>=2 判 cleared → clearRate=0 假报警。
describe('buildReport — R-C authoritative clear state (rc_correct / rc_cleared)', () => {
  function migrateRcColumns(db: Database): void {
    db.exec(`
      ALTER TABLE word_performance ADD COLUMN rc_correct INTEGER;
      ALTER TABLE word_performance ADD COLUMN rc_cleared INTEGER;
    `);
  }

  it('prefers rc_cleared over legacy correct>=2 and reports clearRateSource=rc', async () => {
    const db = createMemDb();
    migrateRcColumns(db);
    seedSession(db, { id: 'rc-1', courseId: 'food', startTime: '2026-07-03T13:00:00.000Z', endTime: '2026-07-03T13:20:00.000Z' });
    // 2026-07-03 真实形态:LLM 账本 correct=1,但 R-C 两次命中已过关。
    const words = ['apple', 'banana', 'bread', 'milk', 'egg', 'rice'];
    words.forEach((word) => {
      db.prepare(
        'INSERT INTO word_performance (lesson_id, word, attempts, correct, needs_review, rc_correct, rc_cleared) VALUES (?, ?, 1, 1, 0, 2, 1)'
      ).run('rc-1', word);
    });

    const r = await buildReport(db, 'rc-1', stubFoodLoader);
    expect(r.eval.teachingLoop.clearRateSource).toBe('rc');
    expect(r.eval.teachingLoop.clearedWordCount).toBe(6);
    expect(r.eval.teachingLoop.clearRate).toBe(1);
    expect(r.eval.teachingLoop.words.every((w) => w.cleared && w.rcTracked && w.rcCorrect === 2)).toBe(true);
    // 不再出现 clear_rate_low / clear_rate_source_legacy 假报警
    const keys = r.eval.nextIterationSignals.map((s) => s.key);
    expect(keys).not.toContain('clear_rate_low');
    expect(keys).not.toContain('clear_rate_source_legacy');
  });

  it('rc_cleared=0 is authoritative too — LLM-lenient correct>=2 no longer fakes a clear', async () => {
    const db = createMemDb();
    migrateRcColumns(db);
    seedSession(db, { id: 'rc-2', courseId: 'food', startTime: '2026-07-03T13:00:00.000Z' });
    // LLM 判了 2 次 correct(宽松误判),但 raw R2 从未命中 → 权威口径未过关。
    db.prepare(
      'INSERT INTO word_performance (lesson_id, word, attempts, correct, needs_review, rc_correct, rc_cleared) VALUES (?, ?, 2, 2, 0, 0, 0)'
    ).run('rc-2', 'apple');

    const r = await buildReport(db, 'rc-2', stubFoodLoader);
    const apple = r.eval.teachingLoop.words.find((w) => w.word === 'apple')!;
    expect(apple.cleared).toBe(false);
    expect(apple.rcTracked).toBe(true);
  });

  it('legacy rows (rc columns NULL / absent) fall back to correct>=2 with clearRateSource=legacy_llm_correct + info signal', async () => {
    const db = createMemDb(); // 老 schema:没有 rc 列
    seedSession(db, { id: 'legacy-1', courseId: 'food', startTime: '2026-05-02T04:00:00.000Z' });
    seedWordPerformance(db, 'legacy-1', [
      { word: 'apple', attempts: 3, correct: 2 },
      { word: 'banana', attempts: 2, correct: 1 },
    ]);

    const r = await buildReport(db, 'legacy-1', stubFoodLoader);
    expect(r.eval.teachingLoop.clearRateSource).toBe('legacy_llm_correct');
    const apple = r.eval.teachingLoop.words.find((w) => w.word === 'apple')!;
    expect(apple.cleared).toBe(true); // 旧语义原样保留
    expect(apple.rcTracked).toBe(false);
    expect(apple.rcCorrect).toBeNull();
    const legacySignal = r.eval.nextIterationSignals.find((s) => s.key === 'clear_rate_source_legacy');
    expect(legacySignal?.severity).toBe('info');
  });
});

// ─── R6 守卫活动聚合(model_calls.guards)────────────────────────────────────
// 盲区背景:守卫改写发生在落库前,存量 ai_response 已是改写后文本,speechCardMismatch
// 检测器对真实错位(2026-07-03 n=31/n=49)恒为 0。守卫计数是唯一可见的干预痕迹。
describe('buildReport — guard activity aggregation', () => {
  it('aggregates rc rejects / suppressions / speech rewrites into agentBehavior + info signal', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 'g-1',
      courseId: 'food',
      startTime: '2026-07-03T13:00:00.000Z',
      interactions: [
        { user: 'Stating.', ai: '没关系,看这张卡!', modelCalls: { guards: { rcRejected: ['volleyball'], speechRewrite: 'in-progress-leak' } } },
        { user: 'I can play soccer.', ai: '说得真棒!', modelCalls: { guards: { rcSuppressed: ['sentence_soccer'], speechRewrite: 'all-cleared-wait' } } },
        { user: 'ok', ai: '继续!', modelCalls: {} },
      ],
    });

    const r = await buildReport(db, 'g-1', stubFoodLoader);
    expect(r.eval.agentBehavior.guardActivity).toEqual({
      rcRejectedCount: 1,
      rcSuppressedCount: 1,
      speechRewriteCount: 2,
      speechRewriteByType: { 'in-progress-leak': 1, 'all-cleared-wait': 1 },
    });
    const guardSignal = r.eval.nextIterationSignals.find((s) => s.key === 'guard_activity');
    expect(guardSignal?.severity).toBe('info');
    expect(guardSignal?.value).toBe(4);
  });

  it('zero guard activity → no guard_activity signal', async () => {
    const db = createMemDb();
    seedSession(db, { id: 'g-2', courseId: 'food', startTime: '2026-07-03T13:00:00.000Z', interactions: [{ user: 'hi', ai: 'hello' }] });
    const r = await buildReport(db, 'g-2', stubFoodLoader);
    expect(r.eval.agentBehavior.guardActivity.speechRewriteCount).toBe(0);
    expect(r.eval.nextIterationSignals.map((s) => s.key)).not.toContain('guard_activity');
  });
});

it('reports Realtime model mastery and usage without falling back to two legacy hits', async () => {
  const db = createMemDb();
  try {
    db.exec("ALTER TABLE lesson_logs ADD COLUMN lesson_mode TEXT DEFAULT 'legacy'");
    seedSession(db, { id: 'rt', courseId: 'food', startTime: '2026-01-01T00:00:00Z', endTime: '2026-01-01T00:01:00Z',
      tokenUsage: { realtime: { model: 'gpt-realtime-2.1', usage: [], complete: false } },
      interactions: [{ user: 'apple', ai: '读得不错。', modelCalls: { assessment: { source: 'model', target_id: 'apple', mastered: true } } }] });
    db.exec("UPDATE lesson_logs SET lesson_mode = 'realtime' WHERE id = 'rt'");
    seedWordPerformance(db, 'rt', [{ word: 'apple', attempts: 1, correct: 1 }]);
    const report = await buildReport(db, 'rt', defaultCourseLoader);
    expect(report.session.mode).toBe('realtime');
    expect(report.eval.teachingLoop.clearRateSource).toBe('realtime_model');
    expect(report.eval.teachingLoop.words.find((word) => word.word === 'apple')?.cleared).toBe(true);
    expect(report.tokens.realtime?.tokenPriceUsd).toBeNull();
    expect(report.anomalies.asrUsageNotTracked).toBe(false);
    expect(report.anomalies.ttsUsageNotTracked).toBe(false);
  } finally { db.close(); }
});

describe('buildReport — realtime responses', () => {
  it('lists every stored response and summarizes them with the reply wait', async () => {
    const db = createMemDb();
    db.exec(`CREATE TABLE realtime_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT NOT NULL, timestamp TEXT NOT NULL, kind TEXT NOT NULL,
      status TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', tools TEXT NOT NULL DEFAULT '', reply_ms INTEGER)`);
    seedSession(db, { id: 'rt-1', courseId: 'food', startTime: '2026-11-11T00:00:00.000Z' });
    const add = db.prepare('INSERT INTO realtime_responses (lesson_id, timestamp, kind, status, text, tools, reply_ms) VALUES (?, ?, ?, ?, ?, ?, ?)');
    add.run('rt-1', '2026-11-11T00:00:01.000Z', 'opening', 'completed', 'Hi!', '', null);
    add.run('rt-1', '2026-11-11T00:00:02.000Z', 'speech', 'completed', 'Great!', 'show_card', 1000);
    add.run('rt-1', '2026-11-11T00:00:03.000Z', 'speech', 'cancelled', '', '', 3000);
    add.run('rt-1', '2026-11-11T00:00:04.000Z', 'speech', 'cancelled', 'Say', '', 2000);
    add.run('rt-1', '2026-11-11T00:00:05.000Z', 'speech', 'completed', '', 'show_card', 4000);
    add.run('rt-1', '2026-11-11T00:00:06.000Z', 'nudge', 'completed', 'Try again?', '', null);
    const report = (result: string) => JSON.stringify({ result, heard: 'x', evidence: 'x', mastered: false, next_action: 'retry' });
    add.run('rt-1', '2026-11-11T00:00:07.000Z', 'assess', 'completed', report('correct'), 'record_assessment', null);
    add.run('rt-1', '2026-11-11T00:00:08.000Z', 'assess', 'completed', report('correct'), 'record_assessment', null);
    add.run('rt-1', '2026-11-11T00:00:09.000Z', 'assess', 'completed', report('close'), 'record_assessment', null);
    add.run('rt-1', '2026-11-11T00:00:10.000Z', 'assess', 'completed', report('wrong'), 'record_assessment', null);
    add.run('rt-1', '2026-11-11T00:00:11.000Z', 'assess', 'completed', report('not_attempt'), 'record_assessment', null);
    add.run('rt-1', '2026-11-11T00:00:12.000Z', 'assess', 'cancelled', '', '', null); // failed: not completed
    add.run('rt-1', '2026-11-11T00:00:13.000Z', 'assess', 'completed', '', '', null); // failed: no tool call
    add.run('rt-1', '2026-11-11T00:00:14.000Z', 'assess', 'completed', '{nope', 'record_assessment', null); // failed: unparseable
    add.run('rt-1', '2026-11-11T00:00:15.000Z', 'assess', 'completed', JSON.stringify({ result: 'great' }), 'record_assessment', null); // failed: unknown result
    const r = await buildReport(db, 'rt-1', noopCourseLoader);
    expect(r.responses).toHaveLength(15);
    expect(r.responses[1]).toEqual({ n: 2, ts: '2026-11-11T00:00:02.000Z', kind: 'speech', status: 'completed', text: 'Great!', tools: 'show_card', replyMs: 1000 });
    expect(r.responses[6]).toMatchObject({ kind: 'assess', status: 'completed', tools: 'record_assessment' });
    // Teacher counts exclude the assessor rows; the assessor has its own summary.
    expect(r.responseStats).toEqual({ total: 6, completed: 4, cancelled: 2, emptyCancelled: 1,
      assessments: { total: 9, failed: 4, results: { correct: 2, close: 1, wrong: 1, not_attempt: 1 } }, nudges: 1, replyMs: { count: 4, median: 2500, p90: 4000, max: 4000 } });
  });
  it('gives empty responses and null stats for a lesson recorded before the table existed', async () => {
    const db = createMemDb();
    seedSession(db, { id: 'old-1', courseId: 'food', startTime: '2026-11-01T00:00:00.000Z' });
    const r = await buildReport(db, 'old-1', noopCourseLoader);
    expect(r.responses).toEqual([]);
    expect(r.responseStats).toMatchObject({ total: 0, assessments: { total: 0, failed: 0, results: { correct: 0, close: 0, wrong: 0, not_attempt: 0 } }, replyMs: { count: 0, median: null, p90: null, max: null } });
  });
});

describe('buildReport — Realtime diagnostics', () => {
  function realtimeDb() {
    const db = createMemDb();
    db.exec(`ALTER TABLE lesson_logs ADD COLUMN lesson_mode TEXT DEFAULT 'legacy';
      CREATE TABLE realtime_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT NOT NULL, timestamp TEXT NOT NULL, kind TEXT NOT NULL,
        status TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', tools TEXT NOT NULL DEFAULT '', reply_ms INTEGER)`);
    return db;
  }

  it('counts usable child utterances once across a retry, lists old/new not_attempt targets and segments saved attempts by assessment target', async () => {
    const db = realtimeDb();
    try {
      const assessments = [
        ...Array.from({ length: 6 }, (_, i) => ({ source: 'model', target_id: 'apple', result: i === 2 ? 'close' : 'correct', mastered: i === 5 })),
        { source: 'model', target_id: 'milk', result: 'wrong', mastered: false },
        { source: 'model', target_id: 'apple', result: 'correct', mastered: false },
        { source: 'application', target_id: 'quiz-1', result: 'correct' },
      ];
      seedSession(db, { id: 'rt', courseId: 'food', startTime: '2026-11-14T00:00:00.000Z',
        interactions: assessments.map((assessment) => ({ user: 'x', ai: 'x', modelCalls: { assessment } })) });
      db.exec("UPDATE lesson_logs SET lesson_mode = 'realtime' WHERE id = 'rt'");
      seedWordPerformance(db, 'rt', [{ word: 'apple', attempts: 7, correct: 6, needsReview: 1 }]);
      const add = db.prepare('INSERT INTO realtime_responses (lesson_id, timestamp, kind, status, text, tools) VALUES (?, ?, ?, ?, ?, ?)');
      add.run('rt', '2026-11-14T00:00:00.000Z', 'speech', 'completed', 'hello', 'show_card');
      add.run('rt', '2026-11-14T00:00:01.000Z', 'assess', 'failed', '', '');
      assessments.forEach((assessment, i) => add.run('rt', `2026-11-14T00:00:${String(i + 2).padStart(2, '0')}.000Z`, 'assess', 'completed', JSON.stringify({ ...assessment, heard: 'x' }), `record_assessment(${assessment.target_id})`));
      add.run('rt', '2026-11-14T00:00:19.000Z', 'assess', 'completed', '{invalid', 'record_assessment(apple)');
      add.run('rt', '2026-11-14T00:00:20.000Z', 'assess', 'completed', JSON.stringify({ result: 'not_attempt', heard: 'hi' }), 'record_assessment');
      add.run('rt', '2026-11-14T00:00:21.000Z', 'assess', 'completed', JSON.stringify({ result: 'not_attempt', heard: 'what?' }), 'record_assessment(milk)');
      const r = await buildReport(db, 'rt', async () => ({ title: 'Food', words: ['apple', 'milk'], quizIds: ['quiz-1'] }));
      expect(r.childUtterances).toBe(11);
      expect(r.responseStats.assessments).toMatchObject({ total: 13, failed: 2 });
      expect(r.notAttempts).toEqual([
        { n: 10, ts: '2026-11-14T00:00:20.000Z', targetId: null, heard: 'hi' },
        { n: 11, ts: '2026-11-14T00:00:21.000Z', targetId: 'milk', heard: 'what?' },
      ]);
      expect(r.targetRuns).toEqual([
        { targetId: 'apple', startTurn: 1, endTurn: 6, length: 6, correct: 5, cleared: true },
        { targetId: 'milk', startTurn: 7, endTurn: 7, length: 1, correct: 0, cleared: false },
        { targetId: 'apple', startTurn: 8, endTurn: 8, length: 1, correct: 1, cleared: false },
        { targetId: 'quiz-1', startTurn: 9, endTurn: 9, length: 1, correct: 1, cleared: true },
      ]);
      expect(r.eval.teachingLoop).toMatchObject({ stuckCardRuns: null, maxStuckRunLength: null });
      expect(r.eval.agentBehavior).toMatchObject({ speechCardMismatchCount: null, speechCardMismatches: null, emptyActionTurns: null });
      expect(r.eval.nextIterationSignals).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'long_target_run', severity: 'warn', value: 6 }),
        expect.objectContaining({ key: 'not_attempts', severity: 'info', value: 2 }),
      ]));
      const keys = r.eval.nextIterationSignals.map((s) => s.key);
      for (const key of ['coverage_gap', 'clear_rate_low', 'clear_rate_source_legacy', 'needs_review', 'teaching_loop_stuck']) expect(keys).not.toContain(key);
      expect(r.responses[0].tools).toBe('show_card'); // old tools remain readable
    } finally { db.close(); }
  });

  it('breaks a target run at a saved row with no target and reports no Realtime signals below the threshold', async () => {
    const db = realtimeDb();
    try {
      seedSession(db, { id: 'rt', courseId: 'food', startTime: '2026-11-14T00:00:00.000Z', interactions: [
        { user: 'apple', ai: '', modelCalls: { assessment: { target_id: 'apple', result: 'correct', mastered: false } } },
        { user: 'old', ai: '' },
        { user: 'apple', ai: '', modelCalls: { assessment: { target_id: 'apple', result: 'close', mastered: false } } },
      ] });
      db.exec("UPDATE lesson_logs SET lesson_mode = 'realtime' WHERE id = 'rt'");
      const r = await buildReport(db, 'rt', stubFoodLoader);
      expect(r.childUtterances).toBe(0);
      expect(r.notAttempts).toEqual([]);
      expect(r.targetRuns).toEqual([
        { targetId: 'apple', startTurn: 1, endTurn: 1, length: 1, correct: 1, cleared: false },
        { targetId: 'apple', startTurn: 3, endTurn: 3, length: 1, correct: 0, cleared: false },
      ]);
      expect(r.eval.nextIterationSignals.map((s) => s.key)).not.toEqual(expect.arrayContaining(['long_target_run']));
      expect(r.eval.nextIterationSignals.map((s) => s.key)).not.toContain('not_attempts');
    } finally { db.close(); }
  });
});

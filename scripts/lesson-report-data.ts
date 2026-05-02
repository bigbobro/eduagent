/// <reference types="node" />
import path from 'path';
import fs from 'fs';
import type { Database } from 'better-sqlite3';

export interface ReportData {
  session: {
    id: string;
    courseId: string;
    courseTitle: string;
    targetWords: string[];
    startTime: string;
    endTime: string | null;
    durationSec: number | null;
    interactionCount: number;
    ended: boolean;
  };
  tokens: {
    llm: { requests: number; input: number; output: number; avgInputPerRound: number; maxInput: number };
    asr: { requests: number; tracked: boolean };
    tts: { requests: number; tracked: boolean };
  };
  anomalies: {
    highAvgInput: boolean;
    asrUsageNotTracked: boolean;
    ttsUsageNotTracked: boolean;
    tokensCorrupted: boolean;
  };
  interactions: Array<{
    n: number;
    ts: string;
    user: string;
    ai: string;
    actions: unknown[];
  }>;
}

export type CourseLoader = (courseId: string) => Promise<{ title: string; words: string[] } | null>;

interface LessonRow {
  id: string;
  course_id: string;
  start_time: string;
  end_time: string | null;
  interaction_count: number;
  token_usage: string;
}

interface InteractionRow {
  timestamp: string;
  user_input: string;
  ai_response: string;
  actions: string;
  model_calls: string;
}

export async function buildReport(
  db: Database,
  sessionId: string | null,
  courseLoader: CourseLoader
): Promise<ReportData> {
  const lesson = sessionId
    ? (db.prepare('SELECT * FROM lesson_logs WHERE id = ?').get(sessionId) as LessonRow | undefined)
    : (db.prepare('SELECT * FROM lesson_logs ORDER BY start_time DESC LIMIT 1').get() as LessonRow | undefined);

  if (!lesson) {
    throw new Error(`session not found: ${sessionId ?? '(latest)'}`);
  }

  const course = await courseLoader(lesson.course_id);
  const courseTitle = course?.title ?? lesson.course_id;
  const targetWords = (course?.words ?? []).map((w) => w.toLowerCase());

  const rows = db.prepare(
    'SELECT timestamp, user_input, ai_response, actions, model_calls FROM interaction_logs WHERE lesson_id = ? ORDER BY id ASC'
  ).all(lesson.id) as InteractionRow[];

  const interactions = rows.map((r, i) => ({
    n: i + 1,
    ts: r.timestamp,
    user: r.user_input,
    ai: r.ai_response,
    actions: safeJsonParse(r.actions, []) as unknown[],
  }));

  const usage = parseTokenUsage(lesson.token_usage);
  const inputs = rows.map((r) => {
    const mc = safeJsonParse(r.model_calls, {}) as { llm?: { inputTokens?: number } };
    return mc.llm?.inputTokens ?? 0;
  });
  const sumInput = inputs.reduce((a, b) => a + b, 0);
  const avgInputPerRound = inputs.length > 0 ? Math.round(sumInput / inputs.length) : 0;
  const maxInput = inputs.length > 0 ? Math.max(...inputs) : 0;

  const startMs = Date.parse(lesson.start_time);
  const endMs = lesson.end_time ? Date.parse(lesson.end_time) : null;
  const durationSec = endMs !== null ? Math.round((endMs - startMs) / 1000) : null;

  return {
    session: {
      id: lesson.id,
      courseId: lesson.course_id,
      courseTitle,
      targetWords,
      startTime: lesson.start_time,
      endTime: lesson.end_time,
      durationSec,
      interactionCount: interactions.length,
      ended: lesson.end_time !== null,
    },
    tokens: {
      llm: {
        requests: usage.llm.requests,
        input: usage.llm.inputTokens,
        output: usage.llm.outputTokens,
        avgInputPerRound,
        maxInput,
      },
      asr: { requests: usage.asr.requests, tracked: usage.asr.requests > 0 },
      tts: { requests: usage.tts.requests, tracked: usage.tts.requests > 0 },
    },
    anomalies: {
      highAvgInput: avgInputPerRound > 1000,
      asrUsageNotTracked: usage.asr.requests === 0,
      ttsUsageNotTracked: usage.tts.requests === 0,
      tokensCorrupted: usage.corrupted,
    },
    interactions,
  };
}

function safeJsonParse(s: string, fallback: unknown): unknown {
  try { return JSON.parse(s); } catch { return fallback; }
}

interface ParsedUsage {
  llm: { requests: number; inputTokens: number; outputTokens: number };
  asr: { requests: number };
  tts: { requests: number };
  corrupted: boolean;
}

function parseTokenUsage(raw: string): ParsedUsage {
  const empty: ParsedUsage = {
    llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
    asr: { requests: 0 },
    tts: { requests: 0 },
    corrupted: false,
  };
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, number>>;
    return {
      llm: {
        requests: parsed.llm?.requests ?? 0,
        inputTokens: parsed.llm?.inputTokens ?? 0,
        outputTokens: parsed.llm?.outputTokens ?? 0,
      },
      asr: { requests: parsed.asr?.requests ?? 0 },
      tts: { requests: parsed.tts?.requests ?? 0 },
      corrupted: false,
    };
  } catch {
    return { ...empty, corrupted: true };
  }
}

interface CourseModule {
  [key: string]: { title: string; objectives: { words: Array<{ english: string }> } } | unknown;
}

export const defaultCourseLoader: CourseLoader = async (courseId) => {
  try {
    const mod = (await import(`../src/data/courses/${courseId}`)) as CourseModule;
    const candidate = Object.values(mod).find(
      (v): v is { title: string; objectives: { words: Array<{ english: string }> } } =>
        typeof v === 'object' && v !== null && 'title' in v && 'objectives' in v
    );
    if (!candidate) return null;
    return {
      title: candidate.title,
      words: candidate.objectives.words.map((w) => w.english),
    };
  } catch {
    return null;
  }
};

async function main(): Promise<void> {
  const sessionId = process.argv[2] ?? null;
  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './db/eduagent.db');

  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`DB 不存在:${dbPath}。先跑过 dev server 让其初始化数据库。\n`);
    process.exit(1);
  }

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  try {
    const data = await buildReport(db, sessionId, defaultCourseLoader);
    process.stdout.write(JSON.stringify(data, null, 2));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('session not found')) {
      process.stderr.write(`${err.message}\n\n最近 5 节课:\n`);
      const recent = db.prepare(
        'SELECT id, course_id, start_time FROM lesson_logs ORDER BY start_time DESC LIMIT 5'
      ).all() as Array<{ id: string; course_id: string; start_time: string }>;
      recent.forEach((r) => process.stderr.write(`  ${r.id}  ${r.course_id}  ${r.start_time}\n`));
      process.exit(1);
    }
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) {
  void main();
}

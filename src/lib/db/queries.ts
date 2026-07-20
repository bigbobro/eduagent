import type { Database } from 'better-sqlite3';
import { getDb } from './index';
import { TokenUsage, InteractionLog, CourseProgressSnapshot } from '@/types/session';
import { PhaseName } from '@/types/course';

export function createLessonLog(id: string, courseId: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO lesson_logs (id, course_id, start_time) VALUES (?, ?, ?)'
  ).run(id, courseId, new Date().toISOString());
}

export function finishLessonLog(id: string, interactionCount: number, tokenUsage: TokenUsage): void {
  const db = getDb();
  db.prepare(
    'UPDATE lesson_logs SET end_time = ?, interaction_count = ?, token_usage = ?, ended_gracefully = 1 WHERE id = ?'
  ).run(new Date().toISOString(), interactionCount, JSON.stringify(tokenUsage), id);
}

// Incremental finalization: bump end_time + interaction_count on every committed turn so a
// lesson whose client never sends action:'end' (tab close / refresh / crash) still has a
// non-NULL end_time — otherwise stats count its duration as 0. R1 (2026-07-04, session
// 6f6e7bec): also carry token_usage on every touch — previously it was ONLY written by the
// graceful finishLessonLog, so a lesson that never sent action:'end' permanently reported
// {} (0 req/0 in/0 out, ASR/TTS "not tracked" false alarms) even though every turn's usage
// was tracked in memory the whole time. ended_gracefully is left untouched here (stays
// whatever it was — 0 by default) so it still tells graceful-end apart from touched-only;
// end_time IS NULL is not used as a liveness flag anywhere, so writing it mid-lesson is safe.
export function touchLessonLog(id: string, interactionCount: number, tokenUsage: TokenUsage): void {
  const db = getDb();
  db.prepare(
    'UPDATE lesson_logs SET end_time = ?, interaction_count = ?, token_usage = ? WHERE id = ?'
  ).run(new Date().toISOString(), interactionCount, JSON.stringify(tokenUsage), id);
}

export function insertInteraction(lessonId: string, log: InteractionLog): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO interaction_logs (lesson_id, timestamp, user_input, ai_response, actions, model_calls) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    lessonId,
    log.timestamp.toISOString(),
    log.userInput,
    log.aiResponse,
    JSON.stringify(log.actions),
    JSON.stringify(log.modelCalls)
  );
}

export function upsertWordPerformance(lessonId: string, word: string, correct: boolean): void {
  const db = getDb();
  const existing = db.prepare(
    'SELECT * FROM word_performance WHERE lesson_id = ? AND word = ?'
  ).get(lessonId, word) as { attempts: number; correct: number } | undefined;

  if (existing) {
    db.prepare(
      'UPDATE word_performance SET attempts = ?, correct = ?, needs_review = ? WHERE lesson_id = ? AND word = ?'
    ).run(
      existing.attempts + 1,
      existing.correct + (correct ? 1 : 0),
      existing.correct + (correct ? 1 : 0) < existing.attempts + 1 ? 1 : 0,
      lessonId,
      word
    );
  } else {
    db.prepare(
      'INSERT INTO word_performance (lesson_id, word, attempts, correct, needs_review) VALUES (?, ?, ?, ?, ?)'
    ).run(lessonId, word, 1, correct ? 1 : 0, correct ? 0 : 1);
  }
}

// R-C 权威账本(2026-07-03 方案 A):cardCorrectCount / cleared 的落库镜像,只写
// rc_* 两列,不碰上面 LLM 判定账本(attempts/correct/needs_review),两本账互不改写。
export function upsertWordRcState(lessonId: string, word: string, rcCorrect: number, rcCleared: boolean): void {
  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM word_performance WHERE lesson_id = ? AND word = ?'
  ).get(lessonId, word);

  if (existing) {
    db.prepare(
      'UPDATE word_performance SET rc_correct = ?, rc_cleared = ? WHERE lesson_id = ? AND word = ?'
    ).run(rcCorrect, rcCleared ? 1 : 0, lessonId, word);
  } else {
    db.prepare(
      'INSERT INTO word_performance (lesson_id, word, attempts, correct, needs_review, rc_correct, rc_cleared) VALUES (?, ?, 0, 0, 0, ?, ?)'
    ).run(lessonId, word, rcCorrect, rcCleared ? 1 : 0);
  }
}

// R1/R3 (2026-07-20 session persistence): one breakpoint row per course. `phase` here is the
// course-level PhaseName (intro/interactive/reinforcement/done), distinct from
// CourseProgressSnapshot.phase (LessonMemory's internal teaching micro-phase). `completed`
// gates resume in the /api/chat 'start' route — a completed course is not deleted, it is
// just ignored on the next start (fresh restart = review). No expiry (PRD R4: not implemented
// — if a future iteration needs it, compare `updated_at` against a threshold at the read site).
export function upsertCourseProgress(
  courseId: string,
  snapshot: CourseProgressSnapshot,
  phase: PhaseName,
  completed: boolean,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO course_progress (course_id, snapshot, phase, completed, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(course_id) DO UPDATE SET
      snapshot = excluded.snapshot,
      phase = excluded.phase,
      completed = excluded.completed,
      updated_at = excluded.updated_at
  `).run(courseId, JSON.stringify(snapshot), phase, completed ? 1 : 0, new Date().toISOString());
}

export interface CourseProgressRow {
  courseId: string;
  snapshot: CourseProgressSnapshot;
  phase: PhaseName;
  completed: boolean;
  updatedAt: string;
}

// Malformed/legacy snapshot JSON is treated as "no usable breakpoint" (returns undefined)
// rather than throwing — a corrupt row must not break the 'start' route; the caller falls
// back to a fresh session, same as if no row existed.
export function getCourseProgress(courseId: string): CourseProgressRow | undefined {
  const db = getDb();
  const row = db.prepare(
    'SELECT course_id AS courseId, snapshot, phase, completed, updated_at AS updatedAt FROM course_progress WHERE course_id = ?',
  ).get(courseId) as { courseId: string; snapshot: string; phase: string; completed: number; updatedAt: string } | undefined;
  if (!row) return undefined;
  try {
    const snapshot = JSON.parse(row.snapshot) as CourseProgressSnapshot;
    return { courseId: row.courseId, snapshot, phase: row.phase as PhaseName, completed: row.completed === 1, updatedAt: row.updatedAt };
  } catch (err) {
    console.error('[db] course_progress snapshot JSON parse failed for', courseId, err);
    return undefined;
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────
// The single SQL boundary for the report tables. Read callers (progress.ts / stats.ts)
// take an injected `db` (so tests can pass an in-memory database) and forward it here;
// they keep only the JS shaping/aggregation, no SQL strings.

// Session persistence (2026-07-20): per-course "times started" for the home list. Each
// createSession AND createSessionFromSnapshot inserts a lesson_logs row, so this counts
// every entry into the course including resumes (PRD R2 semantics).
export function getLessonCountByCourse(db: Database): Map<string, number> {
  const rows = db
    .prepare('SELECT course_id AS courseId, COUNT(*) AS n FROM lesson_logs GROUP BY course_id')
    .all() as Array<{ courseId: string; n: number }>;
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.courseId, r.n);
  return map;
}

// db-injectable read of every course_progress breakpoint, for the home progress aggregation.
// Tolerant of a missing table (fresh checkout before the first /api/chat call, or a minimal
// test DB) and of a corrupt snapshot row (skipped) — a bad breakpoint must never break the
// home list. Mirrors getCourseProgress's per-row JSON-parse guard.
export function getAllCourseProgress(db: Database): Map<string, CourseProgressRow> {
  const map = new Map<string, CourseProgressRow>();
  let rows: Array<{ courseId: string; snapshot: string; phase: string; completed: number; updatedAt: string }>;
  try {
    rows = db
      .prepare('SELECT course_id AS courseId, snapshot, phase, completed, updated_at AS updatedAt FROM course_progress')
      .all() as Array<{ courseId: string; snapshot: string; phase: string; completed: number; updatedAt: string }>;
  } catch {
    return map; // table not created yet — treat as "no breakpoints"
  }
  for (const row of rows) {
    try {
      map.set(row.courseId, {
        courseId: row.courseId,
        snapshot: JSON.parse(row.snapshot) as CourseProgressSnapshot,
        phase: row.phase as PhaseName,
        completed: row.completed === 1,
        updatedAt: row.updatedAt,
      });
    } catch (err) {
      console.error('[db] course_progress snapshot JSON parse failed for', row.courseId, err);
    }
  }
  return map;
}

export interface LessonTimingRow {
  id: string;
  startTime: string;
  endTime: string | null;
}

export function getLessonTimings(db: Database): LessonTimingRow[] {
  return db
    .prepare(`SELECT id, start_time AS startTime, end_time AS endTime FROM lesson_logs`)
    .all() as LessonTimingRow[];
}

export interface RecentLessonRow {
  id: string;
  courseId: string;
  startTime: string;
  endTime: string | null;
  interactionCount: number;
}

export function getRecentLessons(db: Database, limit: number): RecentLessonRow[] {
  return db
    .prepare(
      `SELECT id, course_id AS courseId, start_time AS startTime, end_time AS endTime, interaction_count AS interactionCount
       FROM lesson_logs
       ORDER BY start_time DESC
       LIMIT ?`,
    )
    .all(limit) as RecentLessonRow[];
}

export interface LessonWordPerfCount {
  attempted: number;
  mastered: number;
}

export function getLessonWordPerfCount(db: Database, lessonId: string): LessonWordPerfCount {
  return db
    .prepare(
      `SELECT COUNT(*) AS attempted,
              SUM(CASE WHEN attempts > 0 AND correct * 1.0 / attempts >= 0.6 THEN 1 ELSE 0 END) AS mastered
       FROM word_performance WHERE lesson_id = ?`,
    )
    .get(lessonId) as LessonWordPerfCount;
}

export interface WordPerfByCourseRow {
  word: string;
  attempts: number;
  correct: number;
  lastPracticed: string;
  courseId: string;
}

export function getWordPerformanceByCourse(db: Database): WordPerfByCourseRow[] {
  return db
    .prepare(
      `SELECT wp.word            AS word,
              SUM(wp.attempts)   AS attempts,
              SUM(wp.correct)    AS correct,
              MAX(ll.start_time) AS lastPracticed,
              ll.course_id       AS courseId
       FROM word_performance wp
       JOIN lesson_logs ll ON ll.id = wp.lesson_id
       GROUP BY wp.word, ll.course_id`,
    )
    .all() as WordPerfByCourseRow[];
}

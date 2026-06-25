import type { Database } from 'better-sqlite3';
import { getDb } from './index';
import { TokenUsage, InteractionLog } from '@/types/session';

export function createLessonLog(id: string, courseId: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO lesson_logs (id, course_id, start_time) VALUES (?, ?, ?)'
  ).run(id, courseId, new Date().toISOString());
}

export function finishLessonLog(id: string, interactionCount: number, tokenUsage: TokenUsage): void {
  const db = getDb();
  db.prepare(
    'UPDATE lesson_logs SET end_time = ?, interaction_count = ?, token_usage = ? WHERE id = ?'
  ).run(new Date().toISOString(), interactionCount, JSON.stringify(tokenUsage), id);
}

// Incremental finalization: bump end_time + interaction_count on every committed turn so a
// lesson whose client never sends action:'end' (tab close / refresh / crash) still has a
// non-NULL end_time — otherwise stats count its duration as 0. The graceful finishLessonLog
// stays the final flush (it also writes token_usage). end_time IS NULL is not used as a
// liveness flag anywhere, so writing it mid-lesson is safe.
export function touchLessonLog(id: string, interactionCount: number): void {
  const db = getDb();
  db.prepare(
    'UPDATE lesson_logs SET end_time = ?, interaction_count = ? WHERE id = ?'
  ).run(new Date().toISOString(), interactionCount, id);
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

// ─── Reads ───────────────────────────────────────────────────────────────
// The single SQL boundary for the report tables. Read callers (progress.ts / stats.ts)
// take an injected `db` (so tests can pass an in-memory database) and forward it here;
// they keep only the JS shaping/aggregation, no SQL strings.

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

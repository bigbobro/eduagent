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

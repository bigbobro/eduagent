import { z } from 'zod';
import type { CourseProgressRow, CourseProgressSnapshot } from '@/types/session';
import { lessonPhaseSchema, invalidProgressMessage } from '@/lib/lesson-protocol';

const count = z.number().int().nonnegative();
const ids = z.array(z.string());
const wordPerformance = z.object({
  attempts: count, correct: count, lastAttempt: z.string().datetime({ offset: true }),
}).refine((value) => value.correct <= value.attempts, 'correct exceeds attempts');
const snapshotSchema = z.object({
  currentWord: z.string(), currentCardId: z.string(),
  phase: z.enum(['opening', 'review', 'learning', 'quiz', 'closing']),
  wordsLearned: ids, wordsToReview: ids, clearedCardIds: ids,
  cardProgress: z.record(z.string(), z.enum(['untouched', 'attempted', 'cleared', 'needs_review'])),
  cardAttemptStreak: z.record(z.string(), count), cardCorrectCount: z.record(z.string(), count),
  parkedCardIds: ids, parkRetryCardIds: ids,
  wordPerformance: z.array(z.tuple([z.string(), wordPerformance])),
  totalInteractions: count, passedQuizIds: ids,
}) satisfies z.ZodType<CourseProgressSnapshot>;
const rowSchema = z.object({
  courseId: z.string(), snapshot: snapshotSchema, phase: lessonPhaseSchema,
  completed: z.union([z.literal(0), z.literal(1)]), updatedAt: z.string().datetime({ offset: true }),
});
export class InvalidCourseProgressError extends Error {
  readonly code = 'INVALID_COURSE_PROGRESS';
  constructor(readonly courseId: string, readonly fields: string[]) {
    super(invalidProgressMessage);
    this.name = 'InvalidCourseProgressError';
  }
}

export interface StoredCourseProgressRow {
  courseId: string; snapshot: string; phase: string; completed: number; updatedAt: string;
}
export function parseCourseProgressRow(row: StoredCourseProgressRow): CourseProgressRow {
  let snapshot: unknown;
  try { snapshot = JSON.parse(row.snapshot); }
  catch { throw new InvalidCourseProgressError(row.courseId, ['snapshot.JSON']); }
  const result = rowSchema.safeParse({ ...row, snapshot });
  if (!result.success) {
    throw new InvalidCourseProgressError(row.courseId, result.error.issues.map((issue) => issue.path.join('.')));
  }
  return { ...result.data, completed: result.data.completed === 1 };
}

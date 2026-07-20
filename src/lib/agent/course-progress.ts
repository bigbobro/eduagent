import { Course } from '@/types/course';
import { CourseProgressSnapshot, LessonMemory } from '@/types/session';
import type { CourseProgressRow } from '@/lib/db/queries';

// Session persistence (2026-07-20 PRD/design) — see .trellis/tasks/07-20-session-persistence.
// NOTE: named `course-progress.ts` rather than the design doc's `progress-snapshot.ts` to
// avoid colliding with the pre-existing src/lib/agent/progress-snapshot.test.ts, which tests
// the unrelated SSE `progress_snapshot` event emitted by streamUserInput.

/**
 * Serialize the durable-enough subset of LessonMemory for `course_progress` persistence.
 * Deliberately excludes `messages` and `interestSignals` — resume restarts the LLM context,
 * it does not replay old chat (PRD R1: "跳到上次位置,重新开个头").
 */
export function serializeProgress(memory: LessonMemory): CourseProgressSnapshot {
  return {
    currentWord: memory.currentWord,
    currentCardId: memory.currentCardId,
    phase: memory.phase,
    wordsLearned: [...memory.wordsLearned],
    wordsToReview: [...memory.wordsToReview],
    clearedCardIds: [...memory.clearedCardIds],
    cardProgress: { ...memory.cardProgress },
    cardAttemptStreak: { ...memory.cardAttemptStreak },
    cardCorrectCount: { ...memory.cardCorrectCount },
    parkedCardIds: [...memory.parkedCardIds],
    parkRetryCardIds: [...memory.parkRetryCardIds],
    wordPerformance: Array.from(memory.wordPerformance.entries()).map(([word, perf]) => [
      word,
      { attempts: perf.attempts, correct: perf.correct, lastAttempt: perf.lastAttempt.toISOString() },
    ]),
    totalInteractions: memory.totalInteractions,
    passedQuizIds: [...memory.passedQuizIds],
  };
}

/**
 * Overlay a persisted snapshot onto a base LessonMemory (typically `createMemory()`).
 * Does NOT backfill cards added to the course after the snapshot was taken — callers must
 * run `initializeCardProgress(result, course)` afterward (see createSessionFromSnapshot).
 */
export function deserializeProgress(base: LessonMemory, snapshot: CourseProgressSnapshot): LessonMemory {
  return {
    ...base,
    currentWord: snapshot.currentWord,
    currentCardId: snapshot.currentCardId,
    phase: snapshot.phase,
    wordsLearned: [...snapshot.wordsLearned],
    wordsToReview: [...snapshot.wordsToReview],
    clearedCardIds: [...snapshot.clearedCardIds],
    cardProgress: { ...snapshot.cardProgress },
    cardAttemptStreak: { ...snapshot.cardAttemptStreak },
    cardCorrectCount: { ...snapshot.cardCorrectCount },
    parkedCardIds: [...snapshot.parkedCardIds],
    parkRetryCardIds: [...snapshot.parkRetryCardIds],
    wordPerformance: new Map(
      snapshot.wordPerformance.map(([word, perf]) => [
        word,
        { attempts: perf.attempts, correct: perf.correct, lastAttempt: new Date(perf.lastAttempt) },
      ]),
    ),
    totalInteractions: snapshot.totalInteractions,
    passedQuizIds: [...snapshot.passedQuizIds],
  };
}

/**
 * R3 (PRD): a course is complete when every word card is cleared AND every reinforcement
 * quiz has been answered correctly at least once (passedQuizIds covers all quiz ids).
 * A course with zero quizzes is vacuously complete once its words clear.
 */
export function isCourseComplete(course: Course, memory: LessonMemory): boolean {
  const wordCards = course.cards.filter((c) => c.kind === 'word');
  const allWordsCleared = wordCards.every((c) => memory.cardProgress[c.id] === 'cleared');
  if (!allWordsCleared) return false;
  const quizIds = course.phases.reinforcement.quizzes.map((q) => q.id);
  return quizIds.every((id) => memory.passedQuizIds.includes(id));
}

/**
 * Pick the word card a resumed lesson should show first: the in-progress current card if
 * it's still uncleared, otherwise the first uncleared word card in teaching order. Returns
 * '' when every word card is already cleared (e.g. only reinforcement quizzes remain).
 * This is only an initial UI hint — the next real turn re-derives the authoritative card
 * through normalizeAssistantActions (R-C), so it deliberately does not replicate the
 * parked-card retry-tier logic there.
 */
export function resolveResumeCardId(course: Course, memory: LessonMemory): string {
  const wordCardIds = new Set(course.cards.filter((c) => c.kind === 'word').map((c) => c.id));
  const current = memory.currentCardId;
  if (current && wordCardIds.has(current) && memory.cardProgress[current] !== 'cleared') {
    return current;
  }
  return course.teachingHints.newCardIds.find(
    (id) => wordCardIds.has(id) && memory.cardProgress[id] !== 'cleared',
  ) || '';
}

/**
 * A persisted breakpoint is worth resuming to only when there is real progress. The 'start'
 * opening-speech turn persists an intro-phase snapshot with nothing cleared; treating that as
 * a resume would give a child who only heard the intro and left a misplaced "welcome back"
 * next time. So resumable = not completed, AND either past intro or with at least one cleared
 * card / passed quiz. A completed course is never resumed (its row is kept but ignored — the
 * next start is a fresh review, PRD R3).
 */
export function isResumableProgress(row: CourseProgressRow): boolean {
  if (row.completed) return false;
  return (
    row.phase !== 'intro' ||
    row.snapshot.clearedCardIds.length > 0 ||
    row.snapshot.passedQuizIds.length > 0
  );
}

import type { Database } from 'better-sqlite3';
import type { Course } from '@/types/course';
import type { ProgressSnapshot, CourseProgress, WordMastery } from '@/types/progress';
import { getWordPerformanceByCourse, getLessonCountByCourse, getAllCourseProgress, type WordPerfByCourseRow } from './db/queries';
import { isResumableProgress } from './agent/course-progress';

export function masteryStarsFromRatio(correct: number, attempts: number): 0 | 1 | 2 | 3 {
  if (attempts === 0) return 0;
  const ratio = correct / attempts;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio > 0) return 1;
  return 0;
}

export function buildProgressSnapshot(db: Database, courses: Course[]): ProgressSnapshot {
  const rows = getWordPerformanceByCourse(db);

  const perfByCourse = new Map<string, Map<string, WordPerfByCourseRow>>();
  for (const r of rows) {
    if (!perfByCourse.has(r.courseId)) perfByCourse.set(r.courseId, new Map());
    perfByCourse.get(r.courseId)!.set(r.word, r);
  }

  // Session persistence (2026-07-20, PRD R2): per-course times-started + breakpoint state.
  const lessonCounts = getLessonCountByCourse(db);
  const progressRows = getAllCourseProgress(db);

  const courseSnapshots: CourseProgress[] = courses.map((course) => {
    const perfMap = perfByCourse.get(course.id) ?? new Map<string, WordPerfByCourseRow>();
    const words: WordMastery[] = course.cards
      .filter((c) => c.kind === 'word')
      .map((c) => {
        const p = perfMap.get(c.english);
        const attempts = p?.attempts ?? 0;
        const correct = p?.correct ?? 0;
        return {
          word: c.english,
          zh: c.chinese,
          imageUrl: c.imageUrl,
          attempts,
          correct,
          masteryStars: masteryStarsFromRatio(correct, attempts),
          lastPracticed: p?.lastPracticed ?? null,
        };
      });

    // progressPercent = current breakpoint progress = (cleared word cards + passed quizzes)
    // / (total word cards + total quizzes), matching the R3 completion definition so 100% == done.
    const wordCardIds = new Set(course.cards.filter((c) => c.kind === 'word').map((c) => c.id));
    const quizIds = new Set(course.phases.reinforcement.quizzes.map((q) => q.id));
    const totalUnits = wordCardIds.size + quizIds.size;
    const row = progressRows.get(course.id);
    let progressPercent = 0;
    let hasResume = false;
    let completed = false;
    if (row) {
      completed = row.completed;
      hasResume = isResumableProgress(row);
      if (completed) {
        progressPercent = 100;
      } else if (totalUnits > 0) {
        const wordCleared = row.snapshot.clearedCardIds.filter((id) => wordCardIds.has(id)).length;
        const quizPassed = row.snapshot.passedQuizIds.filter((id) => quizIds.has(id)).length;
        progressPercent = Math.round(((wordCleared + quizPassed) / totalUnits) * 100);
      }
    }

    return {
      courseId: course.id,
      courseTitle: course.title,
      courseTone: course.tone,
      totalWords: words.length,
      masteredWords: words.filter((w) => w.masteryStars === 3).length,
      words,
      timesStarted: lessonCounts.get(course.id) ?? 0,
      progressPercent,
      hasResume,
      completed,
    };
  });

  return {
    courses: courseSnapshots,
    totalWordsMastered: courseSnapshots.reduce((s, c) => s + c.masteredWords, 0),
    generatedAt: new Date().toISOString(),
  };
}

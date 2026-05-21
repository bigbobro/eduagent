import type { Database } from 'better-sqlite3';
import type { Course } from '@/types/course';
import type { ProgressSnapshot, CourseProgress, WordMastery } from '@/types/progress';

export function masteryStarsFromRatio(correct: number, attempts: number): 0 | 1 | 2 | 3 {
  if (attempts === 0) return 0;
  const ratio = correct / attempts;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio > 0) return 1;
  return 0;
}

interface PerfRow {
  word: string;
  attempts: number;
  correct: number;
  lastPracticed: string;
  courseId: string;
}

export function buildProgressSnapshot(db: Database, courses: Course[]): ProgressSnapshot {
  const rows = db
    .prepare(
      `
    SELECT wp.word            AS word,
           SUM(wp.attempts)   AS attempts,
           SUM(wp.correct)    AS correct,
           MAX(ll.start_time) AS lastPracticed,
           ll.course_id       AS courseId
    FROM word_performance wp
    JOIN lesson_logs ll ON ll.id = wp.lesson_id
    GROUP BY wp.word, ll.course_id
  `,
    )
    .all() as PerfRow[];

  const perfByCourse = new Map<string, Map<string, PerfRow>>();
  for (const r of rows) {
    if (!perfByCourse.has(r.courseId)) perfByCourse.set(r.courseId, new Map());
    perfByCourse.get(r.courseId)!.set(r.word, r);
  }

  const courseSnapshots: CourseProgress[] = courses.map((course) => {
    const perfMap = perfByCourse.get(course.id) ?? new Map<string, PerfRow>();
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
    return {
      courseId: course.id,
      courseTitle: course.title,
      courseTone: course.tone,
      totalWords: words.length,
      masteredWords: words.filter((w) => w.masteryStars === 3).length,
      words,
    };
  });

  return {
    courses: courseSnapshots,
    totalWordsMastered: courseSnapshots.reduce((s, c) => s + c.masteredWords, 0),
    generatedAt: new Date().toISOString(),
  };
}

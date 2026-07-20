import type { PaletteKey } from './course';

export interface WordMastery {
  word: string;
  zh: string;
  imageUrl?: string;
  emoji?: string;
  attempts: number;
  correct: number;
  masteryStars: 0 | 1 | 2 | 3;
  lastPracticed: string | null;
}

export interface CourseProgress {
  courseId: string;
  courseTitle: string;
  courseTone: PaletteKey;
  totalWords: number;
  masteredWords: number;
  words: WordMastery[];
  // Session persistence (2026-07-20) — per-course status for the home list (PRD R2).
  timesStarted: number; // lesson_logs count for this course (includes resumes)
  progressPercent: number; // 0-100, current breakpoint progress; 100 once completed
  hasResume: boolean; // has a resumable (incomplete, non-empty) breakpoint to continue
  completed: boolean; // course fully finished (all word cards cleared + all quizzes passed)
}

export interface ProgressSnapshot {
  courses: CourseProgress[];
  totalWordsMastered: number;
  generatedAt: string;
}

export interface SessionSummary {
  lessonId: string;
  courseId: string;
  courseTitle: string;
  startTime: string;
  endTime: string | null;
  durationMs: number;
  interactionCount: number;
  wordsAttempted: number;
  wordsMastered: number;
}

export interface StatsSnapshot {
  totalMinutes: number;
  totalSessions: number;
  totalWordsMastered: number;
  last7Days: Array<{ date: string; minutes: number }>;
}

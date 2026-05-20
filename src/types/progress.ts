import type { PaletteKey } from './course';

export interface WordMastery {
  word: string;
  zh: string;
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

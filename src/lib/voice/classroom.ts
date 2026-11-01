import type { Course, PhaseName } from '@/types/course';
import type { ToolAction } from '@/types/tools';
import type { LessonProgressSnapshot, ResumeInfo } from '@/lib/lesson-protocol';
import type { PresentedTarget } from '@/lib/realtime-protocol';

/** In conversation mode: awaiting = microphone open and quiet, listening = child speech detected, paused = child paused the microphone. */
export type LessonStateName = 'idle' | 'greeting' | 'awaiting' | 'listening' | 'thinking' | 'speaking' | 'quiz-speaking' | 'ending' | 'paused';
export interface QuizResult {
  quizId: string;
  ok: boolean;
  correct: boolean;
  source: 'legacy-asr' | 'application' | 'model';
  next: 'retry' | 'advance';
}
export interface ClassroomEvents {
  state: LessonStateName;
  subtitle: { text: string; source: 'user' | 'ai'; provenance?: 'asr' | 'model'; messageId?: string };
  'subtitle-clear': undefined;
  'asr-final': { text: string };
  actions: ToolAction[];
  progress: LessonProgressSnapshot;
  error: { message: string; code?: string };
  'phase-change': PhaseName;
  'transition-retry-change': boolean;
  'intro-busy-change': boolean;
  'intro-active-card-change': string | null;
  'quiz-saving': boolean;
  'quiz-result': QuizResult;
  /** Realtime only: this sitting is over but the course is not complete; progress is saved. */
  'sitting-ended': undefined;
}

/** Teaching intentions shared by classroom views. Provider prompts and judging stay inside each mode. */
export interface Classroom {
  /** push-to-talk: views drive capture with start/stopListening. conversation: the microphone stays open for the whole lesson. */
  readonly interaction: 'push-to-talk' | 'conversation';
  on<K extends keyof ClassroomEvents>(event: K, listener: (data: ClassroomEvents[K]) => void): void;
  off<K extends keyof ClassroomEvents>(event: K, listener: (data: ClassroomEvents[K]) => void): void;
  getState(): LessonStateName;
  getResumeInfo(): ResumeInfo | null;
  startLesson(learnerId: string, options?: { fresh?: boolean }): Promise<boolean>;
  endLesson(): Promise<void>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  repeatCard(cardId: string): Promise<void>;
  requestIntroCard(cardId: string): Promise<boolean>;
  retryLastTurn?(): Promise<void>;
  retryTransition(): Promise<void>;
  completeReinforcement(): Promise<void>;
  presentQuiz(quizId: string): Promise<void>;
  startQuizListening(quizId: string): Promise<void>;
  submitPick(quizId: string, picked: string): Promise<void>;
  retryQuiz(quizId: string): Promise<void>;
  /** Conversation mode: what the view actually rendered, reported after commit so speech binds to the visible target. */
  presented?(target: PresentedTarget): void;
  setPaused?(paused: boolean): Promise<void>;
}

export function findQuiz(course: Course, quizId: string) {
  const quiz = course.phases.reinforcement.quizzes.find((item) => item.id === quizId);
  if (!quiz) throw new Error('Quiz is outside this course');
  return quiz;
}

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
/**
 * One committed answer about a course card, whatever the exercise: a spoken card in the teaching phase, a
 * repeat-after-me question or a picture choice. Presentation layers (the word battle) consume this single stream;
 * practice-question flow control still uses `quiz-result`.
 */
export interface AnswerResult {
  /** The course card the answer was about: the assessed card, or the card a practice question targets. */
  cardId: string;
  via: 'voice' | 'choice';
  result: 'correct' | 'close' | 'wrong' | 'off_topic' | 'silence';
  /** Voice answers only: the child recalled or used the word unprompted (not an echo). Always false for questions. */
  mastered: boolean;
  /** Set when the answer was to a practice question. */
  quizId?: string;
  /** Receipt revision: unique per committed answer within one lesson run, usable as an animation key. */
  revision: number;
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
  /** Realtime only for now: every committed answer, emitted once. Push-to-talk does not emit it. */
  'answer-result': AnswerResult;
  /** Realtime with the word battle on: the sitting's closing recall game starts now. */
  'sitting-wrap-up': undefined;
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
  /** `game` (conversation mode only): the word battle is on, so the teacher is told the game rules for this call. */
  startLesson(learnerId: string, options?: { fresh?: boolean; game?: boolean }): Promise<boolean>;
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

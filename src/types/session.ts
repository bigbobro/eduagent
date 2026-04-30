import { ToolAction } from './tools';

export type LessonPhase = 'opening' | 'review' | 'learning' | 'quiz' | 'closing';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ToolAction[];
}

export interface InterestSignal {
  type: 'question' | 'preference' | 'confusion' | 'engagement';
  description: string;
  timestamp: Date;
  relatedWord?: string;
}

export interface WordPerf {
  attempts: number;
  correct: number;
  lastAttempt: Date;
}

export interface LessonMemory {
  messages: Message[];
  currentWord: string;
  phase: LessonPhase;
  wordsLearned: string[];
  wordsToReview: string[];
  interestSignals: InterestSignal[];
  wordPerformance: Map<string, WordPerf>;
  silentTurns: number;
  totalInteractions: number;
}

export interface InteractionLog {
  timestamp: Date;
  userInput: string;
  aiResponse: string;
  actions: ToolAction[];
  modelCalls: {
    asr?: { latency: number; tokens: number };
    llm: { latency: number; inputTokens: number; outputTokens: number };
    tts?: { latency: number; characters: number };
  };
}

export interface TokenUsage {
  asr: { requests: number; tokens: number };
  llm: { requests: number; inputTokens: number; outputTokens: number };
  tts: { requests: number; characters: number };
}

export interface LessonLog {
  sessionId: string;
  courseId: string;
  startTime: Date;
  endTime: Date;
  interactionCount: number;
  interactions: InteractionLog[];
  tokenUsage: TokenUsage;
}

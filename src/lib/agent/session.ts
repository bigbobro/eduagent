import { v4 as uuidv4 } from 'uuid';
import { Course, PhaseName } from '@/types/course';
import { LessonMemory, TokenUsage, InteractionLog } from '@/types/session';
import { AgentResponse, ToolAction } from '@/types/tools';
import {
  createMemory,
  addUserMessage,
  getMessagesForLLM,
  commitAssistantStreamResult,
  initializeCardProgress,
} from './memory';
import { buildSystemPrompt } from './prompt';
import { streamLLM } from '@/lib/mimo/llm';
import { StreamingSpeechExtractor } from './speech-extractor';
import { createLessonLog, finishLessonLog, insertInteraction, upsertWordPerformance } from '@/lib/db/queries';

export interface Session {
  id: string;
  courseId: string;
  course: Course;
  memory: LessonMemory;
  tokenUsage: TokenUsage;
  startTime: Date;
  currentPhase: PhaseName;
}

const sessions = new Map<string, Session>();

export function createSession(course: Course): Session {
  const id = uuidv4();
  const session: Session = {
    id,
    courseId: course.id,
    course,
    memory: initializeCardProgress(createMemory(), course),
    tokenUsage: {
      asr: { requests: 0, tokens: 0 },
      llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
      tts: { requests: 0, characters: 0 },
    },
    startTime: new Date(),
    currentPhase: 'intro',
  };
  sessions.set(id, session);
  createLessonLog(id, course.id);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function endSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  finishLessonLog(session.id, session.memory.totalInteractions, session.tokenUsage);
  sessions.delete(sessionId);
}

export function setSessionPhase(sessionId: string, phase: PhaseName): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.currentPhase = phase;
}

export function recordQuizAnswer(
  sessionId: string,
  quizId: string,
  answer: string,
  correct: boolean,
): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.memory.totalInteractions += 1;
  insertInteraction(session.id, {
    timestamp: new Date(),
    userInput: `[quiz:${quizId} ${correct ? 'correct' : 'wrong'}] ${answer}`,
    aiResponse: '',
    actions: [],
    modelCalls: {
      llm: { latency: 0, inputTokens: 0, outputTokens: 0 },
    },
  });
  return true;
}

export type StreamUserEvent =
  | { type: 'speech-delta'; text: string }
  | { type: 'speech-end' }
  | { type: 'actions'; actions: ToolAction[]; state_update: AgentResponse['state_update'] }
  | { type: 'progress_snapshot'; clearedCardIds: string[]; totalAttempts: number; currentPhase: PhaseName }
  | { type: 'done' }
  | { type: 'error'; message: string };

export async function* streamUserInput(
  sessionId: string,
  userText: string,
  asrResult?: { latency: number; tokens: number },
  signal?: AbortSignal
): AsyncGenerator<StreamUserEvent> {
  const session = sessions.get(sessionId);
  if (!session) {
    yield { type: 'error', message: `Session ${sessionId} not found` };
    return;
  }

  session.memory = addUserMessage(session.memory, userText);

  const systemPrompt = buildSystemPrompt(session.course, session.memory, session.currentPhase);
  const messages = getMessagesForLLM(session.memory);

  const extractor = new StreamingSpeechExtractor();
  let speechClosed = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let llmLatency = 0;

  try {
    for await (const ev of streamLLM(systemPrompt, messages, signal)) {
      if (ev.done) {
        inputTokens = ev.usage.inputTokens;
        outputTokens = ev.usage.outputTokens;
        llmLatency = ev.latency;
        break;
      }
      const out = extractor.feed(ev.delta);
      if (out.speechDelta) {
        yield { type: 'speech-delta', text: out.speechDelta };
      }
      if (out.complete && !speechClosed) {
        speechClosed = true;
        yield { type: 'speech-end' };
      }
    }
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    return;
  }

  if (!speechClosed) {
    // 兜底:LLM 没正常关闭 speech 字段(畸形)
    yield { type: 'speech-end' };
  }

  const result = extractor.finalize();
  yield {
    type: 'actions',
    actions: result.actions,
    state_update: result.state_update,
  };

  // commit memory + token + interaction log
  const beforePerformance = new Map(session.memory.wordPerformance);
  session.memory = commitAssistantStreamResult(
    session.memory,
    result.speech,
    result.actions,
    result.state_update
  );
  const assessment = result.state_update.attempt_assessment;
  if (assessment && result.state_update.current_word) {
    const before = beforePerformance.get(result.state_update.current_word);
    const after = session.memory.wordPerformance.get(result.state_update.current_word);
    if (after && (!before || after.attempts > before.attempts)) {
      upsertWordPerformance(session.id, result.state_update.current_word, assessment.result === 'correct');
    }
  }
  session.tokenUsage.llm.requests += 1;
  session.tokenUsage.llm.inputTokens += inputTokens;
  session.tokenUsage.llm.outputTokens += outputTokens;
  if (asrResult) {
    session.tokenUsage.asr.requests += 1;
    session.tokenUsage.asr.tokens += asrResult.tokens;
  }
  session.tokenUsage.tts.requests += 1;
  session.tokenUsage.tts.characters += result.speech.length;

  const interactionLog: InteractionLog = {
    timestamp: new Date(),
    userInput: userText,
    aiResponse: result.speech,
    actions: result.actions,
    modelCalls: {
      asr: asrResult,
      llm: { latency: llmLatency, inputTokens, outputTokens },
      tts: { latency: 0, characters: result.speech.length },
    },
  };
  insertInteraction(session.id, interactionLog);

  let totalAttempts = 0;
  session.memory.wordPerformance.forEach((p) => { totalAttempts += p.attempts; });
  yield {
    type: 'progress_snapshot',
    clearedCardIds: [...session.memory.clearedCardIds],
    totalAttempts,
    currentPhase: session.currentPhase,
  };

  yield { type: 'done' };
}

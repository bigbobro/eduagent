import { v4 as uuidv4 } from 'uuid';
import { Course } from '@/types/course';
import { LessonMemory, TokenUsage, InteractionLog } from '@/types/session';
import { AgentResponse } from '@/types/tools';
import { createMemory, addUserMessage, addAssistantMessage, getMessagesForLLM } from './memory';
import { buildSystemPrompt } from './prompt';
import { callLLM } from '@/lib/mimo/llm';
import { createLessonLog, finishLessonLog, insertInteraction } from '@/lib/db/queries';

export interface Session {
  id: string;
  courseId: string;
  course: Course;
  memory: LessonMemory;
  tokenUsage: TokenUsage;
  startTime: Date;
}

const sessions = new Map<string, Session>();

export function createSession(course: Course): Session {
  const id = uuidv4();
  const session: Session = {
    id,
    courseId: course.id,
    course,
    memory: createMemory(),
    tokenUsage: {
      asr: { requests: 0, tokens: 0 },
      llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
      tts: { requests: 0, characters: 0 },
    },
    startTime: new Date(),
  };

  sessions.set(id, session);
  createLessonLog(id, course.id);

  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export async function processUserInput(
  sessionId: string,
  userText: string,
  asrResult?: { latency: number; tokens: number }
): Promise<{ response: AgentResponse; session: Session }> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Add user message to memory
  session.memory = addUserMessage(session.memory, userText);

  // Build system prompt with current memory
  const systemPrompt = buildSystemPrompt(session.course, session.memory);

  // Get messages for LLM
  const messages = getMessagesForLLM(session.memory);

  // Call LLM
  const llmResult = await callLLM(systemPrompt, messages);

  // Update token usage
  session.tokenUsage.llm.requests += 1;
  session.tokenUsage.llm.inputTokens += llmResult.usage.inputTokens;
  session.tokenUsage.llm.outputTokens += llmResult.usage.outputTokens;

  if (asrResult) {
    session.tokenUsage.asr.requests += 1;
    session.tokenUsage.asr.tokens += asrResult.tokens;
  }

  // Add assistant message to memory
  session.memory = addAssistantMessage(session.memory, llmResult.response);

  // Log interaction
  const interactionLog: InteractionLog = {
    timestamp: new Date(),
    userInput: userText,
    aiResponse: llmResult.response.speech,
    actions: llmResult.response.actions,
    modelCalls: {
      asr: asrResult,
      llm: {
        latency: llmResult.latency,
        inputTokens: llmResult.usage.inputTokens,
        outputTokens: llmResult.usage.outputTokens,
      },
    },
  };
  insertInteraction(session.id, interactionLog);

  return { response: llmResult.response, session };
}

export function endSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  finishLessonLog(session.id, session.memory.totalInteractions, session.tokenUsage);
  sessions.delete(sessionId);
}

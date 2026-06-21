import { v4 as uuidv4 } from 'uuid';
import { Course, PhaseName, WordCard } from '@/types/course';
import { LessonMemory, PromptInputBreakdown, TokenUsage } from '@/types/session';
import { AgentResponse, ToolAction } from '@/types/tools';
import { sessionStore, type Session } from './session-store';
import {
  createMemory,
  addUserMessage,
  getMessagesForLLM,
  commitAssistantStreamResult,
  initializeCardProgress,
} from './memory';
import { buildPromptInput } from './prompt';
import { streamLLM } from '@/lib/mimo/llm';
import { StreamingSpeechExtractor, sanitizeSpeech } from './speech-extractor';
import { createLessonLog, finishLessonLog, insertInteraction, upsertWordPerformance } from '@/lib/db/queries';
import { GuardContext, runPipeline } from './guards/index';
import { closingGuard } from './guards/closing-guard';
import { prematureClosingGuard } from './guards/premature-closing-guard';
import { normalizeActions } from './guards/normalize-actions';
import { speechCardAlign } from './guards/speech-card-align';

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
  sessionStore.save(session);
  createLessonLog(id, course.id);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessionStore.get(id);
}

export function endSession(sessionId: string): void {
  const session = sessionStore.get(sessionId);
  if (!session) return;
  finishLessonLog(session.id, session.memory.totalInteractions, session.tokenUsage);
  sessionStore.delete(sessionId);
}

export function setSessionPhase(sessionId: string, phase: PhaseName): void {
  const session = sessionStore.get(sessionId);
  if (!session) return;
  session.currentPhase = phase;
}

export function recordQuizAnswer(
  sessionId: string,
  quizId: string,
  answer: string,
  correct: boolean,
): boolean {
  const session = sessionStore.get(sessionId);
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

export interface DebugSkipWordResult {
  skippedCardId: string | null;
  nextCardId: string | null;
  clearedCardIds: string[];
  totalAttempts: number;
  currentPhase: PhaseName;
}

export function debugSkipCurrentWord(sessionId: string): DebugSkipWordResult | null {
  const session = sessionStore.get(sessionId);
  if (!session) return null;

  const wordCards = session.course.cards.filter((card): card is WordCard => card.kind === 'word');
  const wordCardIds = new Set(wordCards.map((card) => card.id));
  const progress = { ...session.memory.cardProgress };
  const currentWordId = resolveWordCardId(session.course, session.memory.currentCardId);
  const firstUncleared = (excludeId = '') => session.course.teachingHints.newCardIds.find(
    (id) => wordCardIds.has(id) && id !== excludeId && progress[id] !== 'cleared',
  ) || '';
  const skippedCardId = currentWordId && progress[currentWordId] !== 'cleared'
    ? currentWordId
    : firstUncleared();

  if (!skippedCardId) {
    return {
      skippedCardId: null,
      nextCardId: null,
      clearedCardIds: [...session.memory.clearedCardIds],
      totalAttempts: getTotalAttempts(session.memory),
      currentPhase: session.currentPhase,
    };
  }

  const skippedCard = wordCards.find((card) => card.id === skippedCardId);
  progress[skippedCardId] = 'cleared';
  const correctCount = { ...session.memory.cardCorrectCount, [skippedCardId]: 2 };
  const attemptStreak = { ...session.memory.cardAttemptStreak, [skippedCardId]: 0 };
  const clearedCardIds = session.memory.clearedCardIds.includes(skippedCardId)
    ? session.memory.clearedCardIds
    : [...session.memory.clearedCardIds, skippedCardId];
  const wordsLearned = skippedCard?.english && !session.memory.wordsLearned.includes(skippedCard.english)
    ? [...session.memory.wordsLearned, skippedCard.english]
    : session.memory.wordsLearned;
  const nextCardId = firstUncleared(skippedCardId);
  const nextCard = wordCards.find((card) => card.id === nextCardId);
  if (nextCardId && progress[nextCardId] === 'untouched') {
    progress[nextCardId] = 'attempted';
  }

  session.memory = {
    ...session.memory,
    cardProgress: progress,
    cardCorrectCount: correctCount,
    cardAttemptStreak: attemptStreak,
    clearedCardIds,
    wordsLearned,
    currentCardId: nextCardId || skippedCardId,
    currentWord: nextCard?.english || skippedCard?.english || session.memory.currentWord,
  };
  sessionStore.save(session);

  return {
    skippedCardId,
    nextCardId: nextCardId || null,
    clearedCardIds: [...clearedCardIds],
    totalAttempts: getTotalAttempts(session.memory),
    currentPhase: session.currentPhase,
  };
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
  signal?: AbortSignal,
  // The child's literal transcript, used ONLY for R2 literal-hit counting (切卡). For a real
  // utterance this equals userText (default). System turns (lesson start / phase transition /
  // "请老师再说") pass '' so their instruction text — which may contain the target word — is
  // never miscounted as the child saying it.
  rawAsrText: string = userText
): AsyncGenerator<StreamUserEvent> {
  // 1. Session lookup + user message
  const session = sessionStore.get(sessionId);
  if (!session) {
    yield { type: 'error', message: `Session ${sessionId} not found` };
    return;
  }
  session.memory = addUserMessage(session.memory, userText);

  // 2. LLM stream consumption
  const extractor = new StreamingSpeechExtractor();
  let inputTokens = 0;
  let outputTokens = 0;
  let llmLatency = 0;
  let inputBreakdown: PromptInputBreakdown | undefined;
  try {
    const messages = getMessagesForLLM(session.memory);
    const promptInput = buildPromptInput(session.course, session.memory, session.currentPhase, messages);
    inputBreakdown = promptInput.breakdown;
    for await (const ev of streamLLM(promptInput.systemPrompt, messages, signal)) {
      if (ev.done) {
        inputTokens = ev.usage.inputTokens;
        outputTokens = ev.usage.outputTokens;
        llmLatency = ev.latency;
        inputBreakdown = buildPromptInput(
          session.course,
          session.memory,
          session.currentPhase,
          messages,
          inputTokens,
        ).breakdown;
        break;
      }
      extractor.feed(ev.delta);
    }
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    return;
  }

  // 3. Finalize + sanitize
  const result = extractor.finalize();
  result.speech = sanitizeSpeech(result.speech);

  // id-7: unparseable LLM output with no recoverable speech would otherwise be a silent turn
  // (teacher says nothing, no actions). Surface it so the client shows a gentle retry + recovers.
  if (result.malformed && !result.speech.trim()) {
    yield { type: 'error', message: 'LLM output unparseable (malformed JSON, no speech)' };
    return;
  }

  // 4. Run guard pipeline (ORDER SENSITIVE — see guards/index.ts)
  const initialCtx: GuardContext = {
    speech: result.speech, actions: result.actions, stateUpdate: result.state_update,
    memory: session.memory, course: session.course, asrText: rawAsrText, currentPhase: session.currentPhase,
  };
  const finalCtx = runPipeline(initialCtx, [
    closingGuard,           // R4/R6: unlearned-word closing override
    prematureClosingGuard,  // R-B: soft-closing override when cards remain
    normalizeActions,       // R-C: server-authoritative card selection
    speechCardAlign,        // speech/show_card alignment
  ]);

  // 5. Yield speech + actions
  if (finalCtx.speech) yield { type: 'speech-delta', text: finalCtx.speech };
  yield { type: 'speech-end' };
  yield { type: 'actions', actions: finalCtx.actions, state_update: finalCtx.stateUpdate };

  // 6. Commit memory + accounting + log
  commitTurn(session, finalCtx, userText, asrResult, { inputTokens, outputTokens, llmLatency, inputBreakdown }, rawAsrText);

  // 7. Yield progress snapshot + done
  let totalAttempts = 0;
  session.memory.wordPerformance.forEach((p) => { totalAttempts += p.attempts; });
  yield { type: 'progress_snapshot', clearedCardIds: [...session.memory.clearedCardIds], totalAttempts, currentPhase: session.currentPhase };
  yield { type: 'done' };
}

function commitTurn(
  session: Session,
  ctx: GuardContext,
  userText: string,
  asrResult: { latency: number; tokens: number } | undefined,
  llm: { inputTokens: number; outputTokens: number; llmLatency: number; inputBreakdown?: PromptInputBreakdown },
  rawAsrText: string,
): void {
  const beforePerformance = new Map(session.memory.wordPerformance);
  session.memory = commitAssistantStreamResult(
    session.memory, session.course, ctx.speech, ctx.actions, ctx.stateUpdate, rawAsrText
  );
  const assessment = ctx.stateUpdate.attempt_assessment;
  if (assessment && ctx.stateUpdate.current_word) {
    const before = beforePerformance.get(ctx.stateUpdate.current_word);
    const after = session.memory.wordPerformance.get(ctx.stateUpdate.current_word);
    if (after && (!before || after.attempts > before.attempts)) {
      upsertWordPerformance(session.id, ctx.stateUpdate.current_word, assessment.result === 'correct');
    }
  }
  session.tokenUsage.llm.requests += 1;
  session.tokenUsage.llm.inputTokens += llm.inputTokens;
  session.tokenUsage.llm.outputTokens += llm.outputTokens;
  if (asrResult) { session.tokenUsage.asr.requests += 1; session.tokenUsage.asr.tokens += asrResult.tokens; }
  session.tokenUsage.tts.requests += 1;
  session.tokenUsage.tts.characters += ctx.speech.length;
  insertInteraction(session.id, {
    timestamp: new Date(),
    userInput: userText,
    aiResponse: ctx.speech,
    actions: ctx.actions,
    modelCalls: {
      asr: asrResult,
      llm: {
        latency: llm.llmLatency,
        inputTokens: llm.inputTokens,
        outputTokens: llm.outputTokens,
        ...(llm.inputBreakdown ? { inputBreakdown: llm.inputBreakdown } : {}),
      },
      tts: { latency: 0, characters: ctx.speech.length },
    },
  });
}

function getTotalAttempts(memory: LessonMemory): number {
  let totalAttempts = 0;
  memory.wordPerformance.forEach((performance) => {
    totalAttempts += performance.attempts;
  });
  return totalAttempts;
}

function resolveWordCardId(course: Course, cardId: string): string {
  if (!cardId) return '';
  const wordCards = course.cards.filter((card): card is WordCard => card.kind === 'word');
  const wordCardIds = new Set(wordCards.map((card) => card.id));
  if (wordCardIds.has(cardId)) return cardId;
  const sentenceWordId = cardId.startsWith('sentence_') ? cardId.slice('sentence_'.length) : '';
  if (wordCardIds.has(sentenceWordId)) return sentenceWordId;
  const card = course.cards.find((item) => item.id === cardId);
  if (!card?.imageUrl) return '';
  return wordCards.find((wordCard) => wordCard.imageUrl === card.imageUrl)?.id || '';
}

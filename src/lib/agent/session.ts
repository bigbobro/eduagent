import { v4 as uuidv4 } from 'uuid';
import { Course, PhaseName } from '@/types/course';
import { LessonMemory, PromptInputBreakdown, TokenUsage } from '@/types/session';
import { AgentResponse, ToolAction } from '@/types/tools';
import { sessionStore, type Session } from './session-store';
import {
  createMemory,
  addUserMessage,
  getMessagesForLLM,
  commitAssistantStreamResult,
  initializeCardProgress,
  allWordsFinished,
} from './memory';
import { buildPromptInput } from './prompt';
import { streamLLM } from '@/lib/llm';
import { StreamingSpeechExtractor, sanitizeSpeech } from './speech-extractor';
import { createLessonLog, finishLessonLog, touchLessonLog, insertInteraction, upsertWordPerformance, upsertWordRcState } from '@/lib/db/queries';
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
  touchLessonLog(session.id, session.memory.totalInteractions, session.tokenUsage);
  return true;
}

export type StreamUserEvent =
  | { type: 'speech-delta'; text: string }
  | { type: 'speech-end' }
  | { type: 'actions'; actions: ToolAction[]; state_update: AgentResponse['state_update'] }
  // allWordsDone (F3 2026-07-03): cleared + parked-after-retry — drives the client's
  // interactive→reinforcement transition even when a parked word never cleared.
  | { type: 'progress_snapshot'; clearedCardIds: string[]; totalAttempts: number; currentPhase: PhaseName; allWordsDone: boolean }
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
  rawAsrText: string = userText,
  // phaseOpening (R2 2026-07-03): marks system opening/transition turns so speechCardAlign
  // does not rewrite the opening speech into a word-teaching template.
  opts: { phaseOpening?: boolean } = {}
): AsyncGenerator<StreamUserEvent> {
  // 1. Session lookup + user message
  const session = sessionStore.get(sessionId);
  if (!session) {
    yield { type: 'error', message: `Session ${sessionId} not found` };
    return;
  }

  // R4 (2026-07-04, session 6f6e7bec n=42): a real child utterance squeezed in during
  // reinforcement (after the phaseOpening turn, before/between quizzes — quiz components
  // route ASR with routeToChat:false, but a stray push-to-talk press from the still-mounted
  // interactive screen can still land here with routeToChat:true) must not reach the LLM —
  // the LLM has no teaching role once in reinforcement, and ended up repeating a second,
  // semantically duplicate "let's play a game" opening. System/opening turns (rawAsrText ===
  // '', phaseOpening) and quiz-answer turns (recordQuizAnswer never calls this function) are
  // unaffected by this check.
  if (
    session.currentPhase === 'reinforcement'
    && !opts.phaseOpening
    && rawAsrText.trim() !== ''
    && !userText.startsWith('[quiz:')
    && !userText.startsWith('(切换到')
  ) {
    yield* respondWithoutLLM(session, userText, REINFORCEMENT_SQUEEZE_IN_SPEECH, asrResult);
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
    phaseOpening: opts.phaseOpening,
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
  yield {
    type: 'progress_snapshot',
    clearedCardIds: [...session.memory.clearedCardIds],
    totalAttempts,
    currentPhase: session.currentPhase,
    allWordsDone: allWordsFinished(session.memory, session.course),
  };
  yield { type: 'done' };
}

// R4 (2026-07-04): fixed reply for a real utterance squeezed in during reinforcement — see
// the call site in streamUserInput for why the LLM is skipped entirely.
const REINFORCEMENT_SQUEEZE_IN_SPEECH = '我们来玩游戏吧!';

async function* respondWithoutLLM(
  session: Session,
  userText: string,
  speech: string,
  asrResult: { latency: number; tokens: number } | undefined,
): AsyncGenerator<StreamUserEvent> {
  yield { type: 'speech-delta', text: speech };
  yield { type: 'speech-end' };
  yield { type: 'actions', actions: [], state_update: {} };

  // Accounting mirrors commitTurn minus the LLM cost (never called) and any memory/card
  // mutation (nothing was taught this turn — the LLM guard pipeline never ran). userText is
  // deliberately NOT added to session.memory.messages — there is no assistant reply to it in
  // the conversation's sense, so it would otherwise leave a dangling, unanswered turn in the
  // LLM message history.
  session.memory.totalInteractions += 1;
  if (asrResult) { session.tokenUsage.asr.requests += 1; session.tokenUsage.asr.tokens += asrResult.tokens; }
  session.tokenUsage.tts.requests += 1;
  session.tokenUsage.tts.characters += speech.length;
  insertInteraction(session.id, {
    timestamp: new Date(),
    userInput: userText,
    aiResponse: speech,
    actions: [],
    modelCalls: {
      asr: asrResult,
      llm: { latency: 0, inputTokens: 0, outputTokens: 0 },
      tts: { latency: 0, characters: speech.length },
    },
  });
  touchLessonLog(session.id, session.memory.totalInteractions, session.tokenUsage);

  let totalAttempts = 0;
  session.memory.wordPerformance.forEach((p) => { totalAttempts += p.attempts; });
  yield {
    type: 'progress_snapshot',
    clearedCardIds: [...session.memory.clearedCardIds],
    totalAttempts,
    currentPhase: session.currentPhase,
    allWordsDone: allWordsFinished(session.memory, session.course),
  };
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
  // R-C 权威账本落库(2026-07-03 方案 A):commit 前快照,commit 后按差异同步 rc_*。
  const beforeRcCorrect = { ...session.memory.cardCorrectCount };
  const beforeRcProgress = { ...session.memory.cardProgress };
  const beforeRcStreak = { ...session.memory.cardAttemptStreak };
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
  // 任何 R2 命中 / 清卡 / streak 变化(含首个 wrong,让报告可判"已追踪")当轮落库。
  // 键用 card.english 与 word_performance.word(LLM current_word)对齐。
  for (const card of session.course.cards) {
    if (card.kind !== 'word') continue;
    const changed = (session.memory.cardCorrectCount[card.id] || 0) !== (beforeRcCorrect[card.id] || 0)
      || session.memory.cardProgress[card.id] !== beforeRcProgress[card.id]
      || (session.memory.cardAttemptStreak[card.id] || 0) !== (beforeRcStreak[card.id] || 0);
    if (!changed) continue;
    upsertWordRcState(
      session.id,
      card.english,
      session.memory.cardCorrectCount[card.id] || 0,
      session.memory.cardProgress[card.id] === 'cleared',
    );
  }
  session.tokenUsage.llm.requests += 1;
  session.tokenUsage.llm.inputTokens += llm.inputTokens;
  session.tokenUsage.llm.outputTokens += llm.outputTokens;
  if (asrResult) { session.tokenUsage.asr.requests += 1; session.tokenUsage.asr.tokens += asrResult.tokens; }
  session.tokenUsage.tts.requests += 1;
  session.tokenUsage.tts.characters += ctx.speech.length;
  // R6 observability: persist per-turn guard activity (R-C rejects / suppressions /
  // speech rewrites) into model_calls JSON so lesson reports can aggregate it.
  const guards = {
    ...(ctx.rcRejectedCardIds?.length ? { rcRejected: ctx.rcRejectedCardIds } : {}),
    ...(ctx.rcSuppressedCardIds?.length ? { rcSuppressed: ctx.rcSuppressedCardIds } : {}),
    ...(ctx.speechRewrite ? { speechRewrite: ctx.speechRewrite } : {}),
  };
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
      ...(Object.keys(guards).length ? { guards } : {}),
    },
  });
  // Incremental finalization so a tab-close/refresh/crash still leaves a non-NULL end_time
  // AND a non-empty token_usage (R1 2026-07-04 — session.tokenUsage was already updated above).
  touchLessonLog(session.id, session.memory.totalInteractions, session.tokenUsage);
}

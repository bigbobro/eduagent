import { LessonMemory, Message, InterestSignal, WordPerf, LessonPhase, CardProgressState } from '@/types/session';
import { AgentResponse, ToolAction } from '@/types/tools';
import { Course, WordCard } from '@/types/course';

const MAX_HISTORY = 12;

// F3 escape valve (2026-07-03): consecutive failures on one card before it is parked
// (needs_review + skip to next word). Set to Infinity to disable the valve.
export const PARK_STREAK_THRESHOLD = 5;

export function createMemory(): LessonMemory {
  return {
    messages: [],
    currentWord: '',
    currentCardId: '',
    phase: 'opening',
    wordsLearned: [],
    wordsToReview: [],
    clearedCardIds: [],
    cardProgress: {},
    cardAttemptStreak: {},
    cardCorrectCount: {},
    parkedCardIds: [],
    parkRetryCardIds: [],
    interestSignals: [],
    wordPerformance: new Map(),
    totalInteractions: 0,
  };
}

export function initializeCardProgress(memory: LessonMemory, course: Course): LessonMemory {
  const cardProgress = { ...memory.cardProgress };
  for (const card of course.cards) {
    if (!cardProgress[card.id]) cardProgress[card.id] = 'untouched';
  }
  return { ...memory, cardProgress };
}

export function addUserMessage(memory: LessonMemory, content: string): LessonMemory {
  const message: Message = {
    role: 'user',
    content,
    timestamp: new Date(),
  };

  const messages = [...memory.messages, message].slice(-MAX_HISTORY);

  // Detect interest signals
  const signals = [...memory.interestSignals];
  if (content.includes('？') || content.includes('?')) {
    signals.push({
      type: 'question',
      description: `学生提问: "${content}"`,
      timestamp: new Date(),
    });
  }
  if (content.includes('喜欢') || content.includes('想')) {
    signals.push({
      type: 'preference',
      description: `学生表达偏好: "${content}"`,
      timestamp: new Date(),
    });
  }

  return {
    ...memory,
    messages,
    interestSignals: signals.slice(-10),
    totalInteractions: memory.totalInteractions + 1,
  };
}


export function markWordCorrect(memory: LessonMemory, word: string): LessonMemory {
  const wordPerf = new Map(memory.wordPerformance);
  const existing = wordPerf.get(word) || {
    attempts: 0,
    correct: 0,
    lastAttempt: new Date(),
  };
  wordPerf.set(word, {
    attempts: existing.attempts + 1,
    correct: existing.correct + 1,
    lastAttempt: new Date(),
  });

  const wordsLearned = memory.wordsLearned.includes(word)
    ? memory.wordsLearned
    : [...memory.wordsLearned, word];

  return {
    ...memory,
    wordPerformance: wordPerf,
    wordsLearned,
  };
}

export function markWordIncorrect(memory: LessonMemory, word: string): LessonMemory {
  const wordPerf = new Map(memory.wordPerformance);
  const existing = wordPerf.get(word) || {
    attempts: 0,
    correct: 0,
    lastAttempt: new Date(),
  };
  wordPerf.set(word, {
    attempts: existing.attempts + 1,
    correct: existing.correct,
    lastAttempt: new Date(),
  });

  const wordsToReview = memory.wordsToReview.includes(word)
    ? memory.wordsToReview
    : [...memory.wordsToReview, word];

  return {
    ...memory,
    wordPerformance: wordPerf,
    wordsToReview,
  };
}

export function getMessagesForLLM(memory: LessonMemory): { role: string; content: string }[] {
  return memory.messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

// 流式版本:speech 完整(从 SpeechExtractor 拿到的纯字符串)、actions、state_update 一并 commit
export function commitAssistantStreamResult(
  memory: LessonMemory,
  course: Course,
  speech: string,
  actions: AgentResponse['actions'],
  stateUpdate: AgentResponse['state_update'],
  rawAsrText?: string
): LessonMemory {
  const message: Message = {
    role: 'assistant',
    content: speech,
    timestamp: new Date(),
    actions,
  };
  const messages = [...memory.messages, message].slice(-MAX_HISTORY);
  const response: AgentResponse = { speech, actions, state_update: stateUpdate };
  const assessedMemory = applyAttemptAssessment(memory, course, response, rawAsrText);
  // R2 教学目标只能是 word 卡:sentence 兄弟卡允许展示(normalizeAssistantActions 放行
  // sentence_<active>),但若让它改写 currentCardId,下一轮 applyAttemptAssessment 会因
  // kind !== 'word' 跳过 R2 计数,孩子答对也不推进(DeepSeek 实测踩中,MiMo 从不发 sentence 卡)。
  const nextCardId = getLastWordShowCardId(actions, course) || assessedMemory.currentCardId;
  // F3: advancing INTO a parked card starts its single comeback (retry) round.
  // Reset its fail streak so the retry gets a live attempt window; the round ends on
  // the next failure (streak >= 1 with retry mark) or on clearance.
  let parkRetryCardIds = assessedMemory.parkRetryCardIds || [];
  let cardAttemptStreak = assessedMemory.cardAttemptStreak;
  if (
    nextCardId
    && (assessedMemory.parkedCardIds || []).includes(nextCardId)
    && assessedMemory.cardProgress[nextCardId] !== 'cleared'
    && !parkRetryCardIds.includes(nextCardId)
  ) {
    parkRetryCardIds = [...parkRetryCardIds, nextCardId];
    cardAttemptStreak = { ...cardAttemptStreak, [nextCardId]: 0 };
    console.warn('[memory] R-C park retry begins:', nextCardId);
  }
  const actionProgress = applyShowCardProgress(assessedMemory.cardProgress, actions);
  return {
    ...assessedMemory,
    messages,
    cardProgress: actionProgress,
    parkRetryCardIds,
    cardAttemptStreak,
    currentCardId: nextCardId,
    currentWord: stateUpdate.current_word || memory.currentWord,
    phase: resolvePhase(assessedMemory, memory.phase),
    wordsLearned: assessedMemory.wordsLearned,
  };
}

// R-C (2026-05-23): server-authoritative card advance. Replaces R-A celebration-stay
// and R5 whitelist as the canonical mechanism. Modes:
//   (1) no-current: no current word card / not a word card → pick first uncleared word card.
//   (2) in-progress: current word card not yet cleared (count < 2) → force stay on
//       currentCard; reject any show_card to other word cards. LLM speech still flows freely.
//   (2b) parked-advance (F3, 2026-07-03): current card parked by the escape valve
//       (fail streak hit the threshold / retry round failed) → advance to next candidate.
//   (3) just-cleared: current word card cleared THIS turn (count just hit 2) → force
//       advance to next uncleared word card. The "OK 你说对了 → 看下一个动物" moment.
//   (4) post-clear-recovery: cleared from PRIOR turns → push next uncleared (recovery
//       path; normally we advance in mode (3) so this state is rare).
//
// F1 (2026-07-03): when no next candidate exists (every word cleared or parked-after-retry),
// meta.allWordsCleared=true, forceCardId stays on currentCard (screen does not jump), and
// off-whitelist show_cards are suppressed quietly (no reject warn spam).
//
// Sentence cards: only the sentence card matching the active word card is allowed
// (id === `sentence_${activeWordCardId}`).
export type RcMode = 'no-current' | 'in-progress' | 'parked-advance' | 'just-cleared' | 'post-clear-recovery';

// Out-parameter so the guard pipeline (normalize-actions.ts) can expose R-C mode /
// all-cleared / reject counters to speechCardAlign + session metrics without changing
// the long-standing ToolAction[] return shape.
export interface NormalizeActionsMeta {
  mode?: RcMode;
  allWordsCleared?: boolean;
  rejectedCardIds?: string[];
  suppressedCardIds?: string[];
}

export function normalizeAssistantActions(
  memory: LessonMemory,
  course: Course,
  response: AgentResponse,
  rawAsrText?: string,
  meta?: NormalizeActionsMeta,
  // R2 (2026-07-04, session 6f6e7bec n=41): reinforcement's phaseOpening turn is server-driven
  // opening speech, not a word-teaching turn — the reinforcement UI (quiz components) owns
  // card display, not this action list. Forcing a word show_card here just so it "stays
  // authoritative" produced a false-positive speech/card mismatch (opening said "soccer",
  // forced show_card was the unrelated currentCardId "jumping"). skipForceShowCard leaves
  // whatever the LLM emitted (usually nothing) instead of unshifting forceCardId.
  opts?: { skipForceShowCard?: boolean }
): ToolAction[] {
  // Silent: this derivation only needs forceCardId and discards assessedMemory; the
  // authoritative pass (commitAssistantStreamResult) emits the R-C logs once per turn.
  const assessedMemory = applyAttemptAssessment(memory, course, response, rawAsrText, true);
  const wordCardIds = new Set(course.cards.filter((c) => c.kind === 'word').map((c) => c.id));
  // Defensive defaults: hand-rolled partial memories (tests / legacy) may lack the F3 arrays.
  const parkedCardIds = assessedMemory.parkedCardIds || [];
  const parkRetryCardIds = assessedMemory.parkRetryCardIds || [];
  // Two tiers (F3): fresh uncleared-unparked words first; when the fresh queue is
  // exhausted, parked cards get one comeback (retry) round. The retry tier ignores
  // excludeId so a parked current card may retry in place when it is the only
  // candidate left (degenerate last-word case).
  const findFirstUncleared = (excludeId: string = '') => {
    const order = course.teachingHints.newCardIds;
    const fresh = order.find(
      (id) => wordCardIds.has(id) && id !== excludeId
        && assessedMemory.cardProgress[id] !== 'cleared'
        && !parkedCardIds.includes(id),
    );
    if (fresh) return fresh;
    return order.find(
      (id) => wordCardIds.has(id)
        && assessedMemory.cardProgress[id] !== 'cleared'
        && parkedCardIds.includes(id)
        && !parkRetryCardIds.includes(id),
    ) || '';
  };

  const currentCardId = assessedMemory.currentCardId;
  const currentIsWordCard = currentCardId !== '' && wordCardIds.has(currentCardId);
  const currentClearedNow = currentIsWordCard && assessedMemory.cardProgress[currentCardId] === 'cleared';
  const currentClearedBefore = currentIsWordCard && memory.cardProgress[currentCardId] === 'cleared';
  const justClearedThisTurn = currentClearedNow && !currentClearedBefore;
  // F3: parked current card is "failed out" when its streak is at the threshold
  // (fresh park) or has any failure after the retry round started (retry mark resets
  // the streak; one more miss ends the round). An R2 hit resets the streak → stays.
  const currentFailStreak = currentIsWordCard ? (assessedMemory.cardAttemptStreak[currentCardId] || 0) : 0;
  const currentParkedOut = currentIsWordCard
    && parkedCardIds.includes(currentCardId)
    && currentFailStreak >= (parkRetryCardIds.includes(currentCardId) ? 1 : PARK_STREAK_THRESHOLD);

  // Determine the card the UI must show this turn.
  let forceCardId: string;
  let mode: RcMode;
  let allWordsCleared = false;
  if (!currentIsWordCard) {
    mode = 'no-current';
    forceCardId = findFirstUncleared();
    allWordsCleared = forceCardId === '';
  } else if (!currentClearedNow && currentParkedOut) {
    mode = 'parked-advance';
    const next = findFirstUncleared(currentCardId);
    allWordsCleared = next === '';
    forceCardId = next || currentCardId;
  } else if (!currentClearedNow) {
    mode = 'in-progress';
    forceCardId = currentCardId;
  } else {
    mode = justClearedThisTurn ? 'just-cleared' : 'post-clear-recovery';
    const next = findFirstUncleared(currentCardId);
    allWordsCleared = next === '';
    forceCardId = next || currentCardId;
  }
  if (meta) {
    meta.mode = mode;
    meta.allWordsCleared = allWordsCleared;
    meta.rejectedCardIds = [];
    meta.suppressedCardIds = [];
  }

  // diagnostic snapshot — keep tight, one line.
  const clearedList = Object.entries(assessedMemory.cardProgress).filter(([, v]) => v === 'cleared').map(([k]) => k);
  console.log('[normalize] snapshot', JSON.stringify({
    currentCardId,
    forceCardId,
    mode,
    correctCount: assessedMemory.cardCorrectCount,
    cleared: clearedList,
    ...(parkedCardIds.length ? { parked: parkedCardIds, parkRetried: parkRetryCardIds } : {}),
    ...(allWordsCleared ? { allWordsCleared } : {}),
    llmActions: response.actions.map((a) => `${a.tool}:${a.params.card_id}`),
    asrText: rawAsrText,
  }));

  // Filter LLM actions: allow only show_card → forceCardId (or its sentence_* sibling).
  const acceptedSentenceId = forceCardId ? `sentence_${forceCardId}` : '';
  const actions: ToolAction[] = [];
  let hasForceShowCard = false;
  for (const action of response.actions) {
    if (action.tool !== 'show_card') continue;
    const cid = action.params.card_id;
    if (cid === forceCardId) {
      actions.push(action);
      hasForceShowCard = true;
      continue;
    }
    if (acceptedSentenceId && cid === acceptedSentenceId) {
      actions.push(action);
      continue;
    }
    if (allWordsCleared) {
      // F1: terminal state — expected noise (LLM tries sentence_* etc.). Log quietly,
      // count separately; no reject warn spam (n=49 `sentence_soccer` case).
      console.log('[normalize] show_card suppressed (all words cleared/parked)', { suppressed: cid, force: forceCardId });
      meta?.suppressedCardIds?.push(cid);
      continue;
    }
    console.warn('[normalize] show_card rejected by R-C', { rejected: cid, force: forceCardId });
    meta?.rejectedCardIds?.push(cid);
  }
  // Ensure forceCardId is visible (server-authoritative) — unless this is a reinforcement
  // phaseOpening turn (R2 2026-07-04), where forcing a word show_card is pure noise.
  if (forceCardId && !hasForceShowCard && !opts?.skipForceShowCard) {
    actions.unshift({ tool: 'show_card', params: { card_id: forceCardId } });
  }
  return actions;
}

// F1/F3 (2026-07-03): word queue exhausted — every word card is either cleared, or
// parked with its retry round finished. Drives the client's interactive→reinforcement
// transition (progress_snapshot.allWordsDone): parked-after-retry counts as done.
export function allWordsFinished(memory: LessonMemory, course: Course): boolean {
  const wordCardIds = new Set(course.cards.filter((c) => c.kind === 'word').map((c) => c.id));
  const order = course.teachingHints.newCardIds.filter((id) => wordCardIds.has(id));
  if (order.length === 0) return false;
  return order.every((id) => {
    if (memory.cardProgress[id] === 'cleared') return true;
    if (!(memory.parkedCardIds || []).includes(id) || !(memory.parkRetryCardIds || []).includes(id)) return false;
    // Retry round still live on the current card (streak was reset on retry entry and
    // no failure yet) → not finished.
    if (id === memory.currentCardId && (memory.cardAttemptStreak[id] || 0) < 1) return false;
    return true;
  });
}

/** The last show_card that targets a WORD card (sentence siblings are display-only). */
export function getLastWordShowCardId(actions: ToolAction[], course: Course): string {
  const wordCardIds = new Set(course.cards.filter((c) => c.kind === 'word').map((c) => c.id));
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    if (action.tool === 'show_card' && wordCardIds.has(action.params.card_id)) return action.params.card_id;
  }
  return '';
}

function applyShowCardProgress(
  progress: Record<string, CardProgressState>,
  actions: ToolAction[]
): Record<string, CardProgressState> {
  const next = { ...progress };
  for (const action of actions) {
    if (action.tool !== 'show_card') continue;
    const cardId = action.params.card_id;
    if (!cardId) continue;
    if (!next[cardId] || next[cardId] === 'untouched') {
      next[cardId] = 'attempted';
    }
  }
  return next;
}

// R-C (2026-05-23): server-authoritative clearance based on R2 literal ASR hits.
// Rule (user-locked): a word card requires 2 R2 hits (raw ASR contains one of
// the card's canonical ASR targets) to be 'cleared'. Hits do not need
// to be consecutive. Once 'cleared', the card is LOCKED — further hits are ignored.
// LLM's assessment.result is used only for streak / hint signals on non-hit turns.
function applyAttemptAssessment(
  memory: LessonMemory,
  course: Course,
  response: AgentResponse,
  rawAsrText?: string,
  silent: boolean = false,
): LessonMemory {
  // `silent` suppresses R-C logs for the normalizeAssistantActions derivation pass,
  // which discards its result (it only needs forceCardId). The authoritative pass in
  // commitAssistantStreamResult logs. This keeps the read-only guard pipeline intact
  // while emitting each clearance/hit log exactly once per turn.
  const warn: typeof console.warn = silent ? () => {} : console.warn;
  const targetCardId = memory.currentCardId;
  if (!targetCardId) return memory;
  const targetCard = course.cards.find((c) => c.id === targetCardId);
  if (!targetCard || targetCard.kind !== 'word') {
    // Only word cards participate in R2 counting. Sentence cards / no-card turns: pass.
    return memory;
  }

  const targetTokens = getR2MatchTargets(targetCard);
  const asrNormalized = normalizeR2MatchText(rawAsrText || '');
  const r2Hit = targetTokens.some((targetToken) => asrNormalized.includes(targetToken));

  // Path A: R2 hit — server credits the kid regardless of LLM result judgment.
  if (r2Hit) {
    if (memory.cardProgress[targetCardId] === 'cleared') {
      // Lock: cleared cards do not accumulate further hits.
      return memory;
    }
    const correctCount = { ...memory.cardCorrectCount };
    const nextCount = (correctCount[targetCardId] || 0) + 1;
    correctCount[targetCardId] = nextCount;
    const progress = { ...memory.cardProgress };
    const streak = { ...memory.cardAttemptStreak };
    streak[targetCardId] = 0; // reset error streak on a successful hit
    let clearedCardIds = memory.clearedCardIds;
    let wordsLearned = memory.wordsLearned;
    if (nextCount >= 2) {
      progress[targetCardId] = 'cleared';
      clearedCardIds = memory.clearedCardIds.includes(targetCardId)
        ? memory.clearedCardIds
        : [...memory.clearedCardIds, targetCardId];
      if (targetCard.english) {
        wordsLearned = mergeUnique(memory.wordsLearned, [targetCard.english]);
      }
      warn('[memory] R-C cleared (2nd R2 hit):', targetCardId);
    } else {
      progress[targetCardId] = 'attempted';
      warn('[memory] R-C hit', { card: targetCardId, count: nextCount });
    }
    memory = updateWordPerformance(memory, targetCard.english, true);
    return {
      ...memory,
      cardCorrectCount: correctCount,
      cardProgress: progress,
      cardAttemptStreak: streak,
      clearedCardIds,
      wordsLearned,
    };
  }

  // Path B: no R2 hit — use LLM assessment for streak/needs_review only (no clear here).
  const assessment = response.state_update.attempt_assessment;
  if (!assessment || !assessment.card_id) return memory;
  if (assessment.card_id !== targetCardId) {
    warn('[memory] applyAttemptAssessment: assessment.card_id', assessment.card_id, '!= currentCardId', targetCardId, '— ignoring');
    return memory;
  }
  if (memory.cardProgress[targetCardId] === 'cleared') {
    // Already cleared — never downgrade. Whatever LLM says, the card stays cleared.
    return memory;
  }

  const progress = { ...memory.cardProgress };
  const streak = { ...memory.cardAttemptStreak };

  if (assessment.result === 'correct') {
    // LLM said correct but ASR did not contain the target token. Don't downgrade further
    // than current state; this is likely an LLM mis-judgment. Leave streak as-is.
    warn('[memory] R-C: LLM correct but ASR lacks target — no progress credited. asr=', rawAsrText, 'target=', targetTokens.join('|'));
    return memory;
  }
  if (assessment.result === 'close' || assessment.result === 'wrong') {
    const nextStreak = (streak[targetCardId] || 0) + 1;
    streak[targetCardId] = nextStreak;
    // Parked cards stay needs_review even when the retry round resets the streak.
    let parkedCardIds = memory.parkedCardIds || [];
    progress[targetCardId] = nextStreak >= 3 || parkedCardIds.includes(targetCardId) ? 'needs_review' : 'attempted';
    // F3 escape valve: too many consecutive failures → park the card (skip to the
    // next word; parked cards get one comeback round when the fresh queue is done).
    if (nextStreak >= PARK_STREAK_THRESHOLD && !parkedCardIds.includes(targetCardId)) {
      parkedCardIds = [...parkedCardIds, targetCardId];
      warn('[memory] R-C parked (fail streak ' + nextStreak + '):', targetCardId);
    }
    memory = updateWordPerformance(memory, targetCard.english, false);
    return { ...memory, cardProgress: progress, cardAttemptStreak: streak, parkedCardIds };
  }
  // off_topic / unknown — no progress change.
  return memory;
}

// Exported for the asr-confusables coverage guard (src/data/courses/asr-confusables.test.ts),
// so it checks alias coverage with the exact production R2 matching semantics.
export function getR2MatchTargets(card: WordCard): string[] {
  const candidates = [card.english, ...(card.asrAliases || [])];
  return Array.from(new Set(candidates.map(normalizeR2MatchText).filter(Boolean)));
}

export function normalizeR2MatchText(value: string): string {
  return Array.from(value.toLowerCase())
    .filter((char) => /[a-z0-9]/.test(char) || /[\u3400-\u9fff]/.test(char))
    .join('');
}

function resolvePhase(memory: LessonMemory, requested: LessonPhase): LessonPhase {
  if (requested !== 'closing') return requested;
  return hasUntouchedCards(memory) ? memory.phase : requested;
}

function hasUntouchedCards(memory: LessonMemory): boolean {
  return Object.values(memory.cardProgress).some((state) => state === 'untouched');
}

function updateWordPerformance(memory: LessonMemory, word: string | undefined, correct: boolean): LessonMemory {
  if (!word) return memory;
  return correct ? markWordCorrect(memory, word) : markWordIncorrect(memory, word);
}

function mergeUnique(existing: string[], incoming: string[]): string[] {
  const result = [...existing];
  for (const item of incoming) {
    if (item && !result.includes(item)) result.push(item);
  }
  return result;
}

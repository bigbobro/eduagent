import { LessonMemory, Message, InterestSignal, WordPerf, LessonPhase, CardProgressState } from '@/types/session';
import { AgentResponse, ToolAction } from '@/types/tools';
import { Course } from '@/types/course';

const MAX_HISTORY = 12;

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
    interestSignals: [],
    wordPerformance: new Map(),
    silentTurns: 0,
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
    silentTurns: 0,
    totalInteractions: memory.totalInteractions + 1,
  };
}

export function addAssistantMessage(
  memory: LessonMemory,
  course: Course,
  response: AgentResponse,
  rawAsrText?: string
): LessonMemory {
  const message: Message = {
    role: 'assistant',
    content: response.speech,
    timestamp: new Date(),
    actions: response.actions,
  };

  const messages = [...memory.messages, message].slice(-MAX_HISTORY);

  const update = response.state_update;
  const assessedMemory = applyAttemptAssessment(memory, course, response, rawAsrText);
  const nextCardId = getLastShowCardId(response.actions) || assessedMemory.currentCardId;
  const actionProgress = applyShowCardProgress(assessedMemory.cardProgress, response.actions);

  return {
    ...assessedMemory,
    messages,
    cardProgress: actionProgress,
    currentCardId: nextCardId,
    currentWord: update.current_word || memory.currentWord,
    phase: resolvePhase(assessedMemory, (update.phase as LessonPhase) || memory.phase),
    wordsLearned: mergeUnique(assessedMemory.wordsLearned, update.words_learned || []),
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

export function incrementSilentTurns(memory: LessonMemory): LessonMemory {
  return {
    ...memory,
    silentTurns: memory.silentTurns + 1,
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
  return addAssistantMessage(memory, course, { speech, actions, state_update: stateUpdate }, rawAsrText);
}

export function getNextWordCardId(memory: LessonMemory, course: Course): string {
  const wordCardIds = new Set(
    course.cards.filter((c) => c.kind === 'word').map((c) => c.id)
  );
  const currentId = memory.currentCardId;
  return course.teachingHints.newCardIds.find(
    (id) => wordCardIds.has(id)
      && id !== currentId
      && memory.cardProgress[id] !== 'cleared'
  ) || '';
}

// R-C (2026-05-23): server-authoritative card advance. Replaces R-A celebration-stay
// and R5 whitelist as the canonical mechanism. Three modes:
//   (1) No current word card / not a word card → pick first uncleared word card.
//   (2) Current word card not yet cleared (count < 2) → force stay on currentCard;
//       reject any show_card to other word cards. LLM speech still flows freely.
//   (3) Current word card just cleared THIS turn (count just hit 2) → force advance
//       to next uncleared word card. The "OK 你说对了 → 看下一个动物" moment.
//   (4) Current card cleared from PRIOR turns → push next uncleared (recovery path;
//       normally we advance in mode (3) so this state is rare).
//
// Sentence cards: only the sentence card matching the active word card is allowed
// (id === `sentence_${activeWordCardId}`).
export function normalizeAssistantActions(
  memory: LessonMemory,
  course: Course,
  response: AgentResponse,
  rawAsrText?: string
): ToolAction[] {
  const assessedMemory = applyAttemptAssessment(memory, course, response, rawAsrText);
  const wordCardIds = new Set(course.cards.filter((c) => c.kind === 'word').map((c) => c.id));
  const findFirstUncleared = (excludeId: string = '') => course.teachingHints.newCardIds.find(
    (id) => wordCardIds.has(id) && id !== excludeId && assessedMemory.cardProgress[id] !== 'cleared',
  ) || '';

  const currentCardId = assessedMemory.currentCardId;
  const currentIsWordCard = currentCardId !== '' && wordCardIds.has(currentCardId);
  const currentClearedNow = currentIsWordCard && assessedMemory.cardProgress[currentCardId] === 'cleared';
  const currentClearedBefore = currentIsWordCard && memory.cardProgress[currentCardId] === 'cleared';
  const justClearedThisTurn = currentClearedNow && !currentClearedBefore;

  // Determine the card the UI must show this turn.
  let forceCardId: string;
  if (!currentIsWordCard) {
    // Mode (1): no current word context — pick the first uncleared word card.
    forceCardId = findFirstUncleared();
  } else if (!currentClearedNow) {
    // Mode (2): still teaching currentCard (count < 2).
    forceCardId = currentCardId;
  } else if (justClearedThisTurn) {
    // Mode (3): clearance turn — advance to next.
    forceCardId = findFirstUncleared(currentCardId) || currentCardId;
  } else {
    // Mode (4): cleared from a prior turn — recover by advancing.
    forceCardId = findFirstUncleared(currentCardId) || currentCardId;
  }

  // diagnostic snapshot — keep tight, one line.
  const clearedList = Object.entries(assessedMemory.cardProgress).filter(([, v]) => v === 'cleared').map(([k]) => k);
  console.log('[normalize] snapshot', JSON.stringify({
    currentCardId,
    forceCardId,
    mode: !currentIsWordCard ? 'no-current' : !currentClearedNow ? 'in-progress' : justClearedThisTurn ? 'just-cleared' : 'post-clear-recovery',
    correctCount: assessedMemory.cardCorrectCount,
    cleared: clearedList,
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
    console.warn('[normalize] show_card rejected by R-C', { rejected: cid, force: forceCardId });
  }
  // Ensure forceCardId is visible (server-authoritative).
  if (forceCardId && !hasForceShowCard) {
    actions.unshift({ tool: 'show_card', params: { card_id: forceCardId } });
  }
  return actions;
}

function getLastShowCardId(actions: ToolAction[]): string {
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    if (action.tool === 'show_card' && action.params.card_id) return action.params.card_id;
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
// Rule (user-locked): a word card requires 2 R2 hits (raw ASR contains the card's
// English token, lower-cased, punctuation stripped) to be 'cleared'. Hits do not need
// to be consecutive. Once 'cleared', the card is LOCKED — further hits are ignored.
// LLM's assessment.result is used only for streak / hint signals on non-hit turns.
function applyAttemptAssessment(
  memory: LessonMemory,
  course: Course,
  response: AgentResponse,
  rawAsrText?: string,
): LessonMemory {
  const targetCardId = memory.currentCardId;
  if (!targetCardId) return memory;
  const targetCard = course.cards.find((c) => c.id === targetCardId);
  if (!targetCard || targetCard.kind !== 'word') {
    // Only word cards participate in R2 counting. Sentence cards / no-card turns: pass.
    return memory;
  }

  const targetToken = (targetCard.english || '').toLowerCase().replace(/[.,!?;]/g, '').trim();
  const asrNormalized = (rawAsrText || '').toLowerCase().replace(/[.,!?;]/g, '');
  const r2Hit = targetToken.length > 0 && asrNormalized.includes(targetToken);

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
      console.warn('[memory] R-C cleared (2nd R2 hit):', targetCardId);
    } else {
      progress[targetCardId] = 'attempted';
      console.warn('[memory] R-C hit', { card: targetCardId, count: nextCount });
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
    console.warn('[memory] applyAttemptAssessment: assessment.card_id', assessment.card_id, '!= currentCardId', targetCardId, '— ignoring');
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
    console.warn('[memory] R-C: LLM correct but ASR lacks target — no progress credited. asr=', rawAsrText, 'target=', targetToken);
    return memory;
  }
  if (assessment.result === 'close' || assessment.result === 'wrong') {
    const nextStreak = (streak[targetCardId] || 0) + 1;
    streak[targetCardId] = nextStreak;
    progress[targetCardId] = nextStreak >= 3 ? 'needs_review' : 'attempted';
    memory = updateWordPerformance(memory, targetCard.english, false);
    return { ...memory, cardProgress: progress, cardAttemptStreak: streak };
  }
  // off_topic / unknown — no progress change.
  return memory;
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

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
  const assessedMemory = applyAttemptAssessment(memory, response, rawAsrText);
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
  speech: string,
  actions: AgentResponse['actions'],
  stateUpdate: AgentResponse['state_update'],
  rawAsrText?: string
): LessonMemory {
  return addAssistantMessage(memory, { speech, actions, state_update: stateUpdate }, rawAsrText);
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

export function normalizeAssistantActions(
  memory: LessonMemory,
  course: Course,
  response: AgentResponse,
  rawAsrText?: string
): ToolAction[] {
  const assessedMemory = applyAttemptAssessment(memory, response, rawAsrText);
  const activeWordCardId = getActiveWordCardId(assessedMemory, course);
  const nextCardId = getNextWordCardId(assessedMemory, course);
  const currentCardId = assessedMemory.currentCardId;

  // R-A (2026-05-23): "celebration turn" — when the current card was just cleared this
  // very turn (LLM said correct AND R2 literal-verify accepted), the teacher speech for
  // THIS turn was generated around the cleared word ("great, cat! say cat again").
  // Force-advancing the card mid-celebration creates the desync seen in 2026-05-23
  // animals real-test (UI flipped to dog while teacher kept saying cat → child read cat
  // on dog card → 3-turn LLM context lag). Fix: defer the card advance one turn. Allow
  // show_card → just-cleared-currentCard this turn, and skip both the "push next on
  // fallback" and the old R7 auto-advance. Next turn LLM naturally produces the
  // transition ("now next animal!") and we let its show_card → nextCard through.
  const originalCurrentId = memory.currentCardId;
  const justClearedCurrent =
    originalCurrentId !== ''
    && memory.cardProgress[originalCurrentId] !== 'cleared'
    && assessedMemory.cardProgress[originalCurrentId] === 'cleared';

  let rejectedShowCard = false;
  let keptShowCard = false;

  const actions = response.actions.filter((action) => {
    if (action.tool !== 'show_card') return false;
    const isCelebrationStay = justClearedCurrent && action.params.card_id === originalCurrentId;
    if (isCelebrationStay || canShowCard(action.params.card_id, assessedMemory, course, activeWordCardId, nextCardId)) {
      keptShowCard = true;
      return true;
    }
    console.warn('[normalize] show_card rejected', {
      rejectedCardId: action.params.card_id,
      currentCardId,
      nextCardId,
      reason: 'not in {current,next} whitelist or sentence card mismatch',
    });
    rejectedShowCard = true;
    return false;
  });

  if (!keptShowCard && (rejectedShowCard || didClearCurrentCard(memory, response))) {
    // On the celebration turn keep showing the just-cleared card (R-A); otherwise
    // fall back to the next active word card so the UI doesn't stall.
    const pushTarget = justClearedCurrent ? originalCurrentId : activeWordCardId;
    if (pushTarget) {
      console.warn('[normalize] fallback push', {
        pushed: pushTarget,
        reason: justClearedCurrent ? 'celebration_stay' : 'no_kept_show_card_after_filter',
      });
      actions.push({ tool: 'show_card', params: { card_id: pushTarget } });
    }
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

function applyAttemptAssessment(memory: LessonMemory, response: AgentResponse, rawAsrText?: string): LessonMemory {
  const assessment = response.state_update.attempt_assessment;
  if (!assessment || !assessment.card_id) return memory;
  if (assessment.card_id !== memory.currentCardId) {
    console.warn('[memory] applyAttemptAssessment: assessment.card_id', assessment.card_id, '!= currentCardId', memory.currentCardId, '— ignoring');
    return memory;
  }

  const cardId = assessment.card_id;
  const progress = { ...memory.cardProgress };
  const streak = { ...memory.cardAttemptStreak };
  let clearedCardIds = memory.clearedCardIds;
  let wordsLearned = memory.wordsLearned;

  if (assessment.result === 'correct') {
    // R2: ASR literal verify — when LLM says correct, confirm raw ASR actually contains
    // the target English token. If rawAsrText is available but doesn't match, downgrade
    // to attempted so the student must say it correctly one more time.
    const targetToken = (response.state_update.current_word || '').toLowerCase().replace(/[.,!?;]/g, '').trim();
    const asrNormalized = rawAsrText != null
      ? rawAsrText.toLowerCase().replace(/[.,!?;]/g, '')
      : null;

    const literalMatch = asrNormalized == null
      ? true // no rawAsrText available — fall back to trusting LLM judgment
      : targetToken.length > 0 && asrNormalized.includes(targetToken);

    if (literalMatch) {
      progress[cardId] = 'cleared';
      streak[cardId] = 0;
      clearedCardIds = memory.clearedCardIds.includes(cardId)
        ? memory.clearedCardIds
        : [...memory.clearedCardIds, cardId];
      if (response.state_update.current_word) {
        wordsLearned = mergeUnique(memory.wordsLearned, [response.state_update.current_word]);
      }
      memory = updateWordPerformance(memory, response.state_update.current_word, true);
    } else {
      // LLM judged correct but raw ASR doesn't contain the target word literal —
      // downgrade to attempted and keep the streak going.
      console.warn('[memory] applyAttemptAssessment: LLM correct but ASR "' + rawAsrText + '" lacks target "' + targetToken + '" — downgrading to attempted');
      const nextStreak = (streak[cardId] || 0) + 1;
      streak[cardId] = nextStreak;
      progress[cardId] = nextStreak >= 3 ? 'needs_review' : 'attempted';
      memory = updateWordPerformance(memory, response.state_update.current_word, false);
    }
  } else if (assessment.result === 'close' || assessment.result === 'wrong') {
    const nextStreak = (streak[cardId] || 0) + 1;
    streak[cardId] = nextStreak;
    progress[cardId] = nextStreak >= 3 ? 'needs_review' : 'attempted';
    memory = updateWordPerformance(memory, response.state_update.current_word, false);
  } else {
    if (!progress[cardId] || progress[cardId] === 'untouched') progress[cardId] = 'attempted';
  }

  return {
    ...memory,
    cardProgress: progress,
    cardAttemptStreak: streak,
    clearedCardIds,
    wordsLearned,
  };
}

function resolvePhase(memory: LessonMemory, requested: LessonPhase): LessonPhase {
  if (requested !== 'closing') return requested;
  return hasUntouchedCards(memory) ? memory.phase : requested;
}

function hasUntouchedCards(memory: LessonMemory): boolean {
  return Object.values(memory.cardProgress).some((state) => state === 'untouched');
}

function getActiveWordCardId(memory: LessonMemory, course: Course): string {
  const wordCardIds = new Set(course.cards.filter((card) => card.kind === 'word').map((card) => card.id));
  const currentWordCardId = getWordCardIdForCard(course, memory.currentCardId);
  if (currentWordCardId && wordCardIds.has(currentWordCardId) && memory.cardProgress[currentWordCardId] !== 'cleared') {
    return currentWordCardId;
  }
  return course.teachingHints.newCardIds.find((id) => wordCardIds.has(id) && memory.cardProgress[id] !== 'cleared') || '';
}

function canShowCard(
  cardId: string,
  memory: LessonMemory,
  course: Course,
  activeWordCardId: string,
  nextCardId: string
): boolean {
  if (!cardId) return false;
  const card = course.cards.find((item) => item.id === cardId);
  if (!card) return false;
  if (card.kind === 'word') {
    // R5: word card must be in {currentCard, nextCard} whitelist. This prevents LLM from
    // (a) jumping back to already-cleared cards (e.g. cat after dog/bird passed) or
    // (b) skipping ahead non-sequentially out of newCardIds order.
    // currentCard must NOT already be cleared (stale or just-cleared) — when current is
    // cleared, server falls back to activeWordCardId / nextCardId so the UI advances.
    const isCurrent = card.id === memory.currentCardId;
    const isNext = nextCardId !== '' && card.id === nextCardId;
    if (isCurrent && memory.cardProgress[card.id] === 'cleared') return false;
    return isCurrent || isNext;
  }
  // Sentence cards: still require the associated word card to be active and not cleared.
  if (!activeWordCardId) return false;
  return getWordCardIdForCard(course, card.id) === activeWordCardId && memory.cardProgress[activeWordCardId] !== 'cleared';
}

function getWordCardIdForCard(course: Course, cardId: string): string {
  const card = course.cards.find((item) => item.id === cardId);
  if (!card) return '';
  if (card.kind === 'word') return card.id;

  const wordCardIds = new Set(course.cards.filter((item) => item.kind === 'word').map((item) => item.id));
  const sentenceSuffix = card.id.startsWith('sentence_') ? card.id.slice('sentence_'.length) : '';
  if (sentenceSuffix && wordCardIds.has(sentenceSuffix)) return sentenceSuffix;

  return course.cards.find((item) => item.kind === 'word' && item.imageUrl === card.imageUrl)?.id || '';
}

function didClearCurrentCard(memory: LessonMemory, response: AgentResponse): boolean {
  const assessment = response.state_update.attempt_assessment;
  return Boolean(
    assessment
    && assessment.result === 'correct'
    && assessment.card_id === memory.currentCardId
  );
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

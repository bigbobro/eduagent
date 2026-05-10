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
  response: AgentResponse
): LessonMemory {
  const message: Message = {
    role: 'assistant',
    content: response.speech,
    timestamp: new Date(),
    actions: response.actions,
  };

  const messages = [...memory.messages, message].slice(-MAX_HISTORY);

  const update = response.state_update;
  const assessedMemory = applyAttemptAssessment(memory, response);
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
  stateUpdate: AgentResponse['state_update']
): LessonMemory {
  return addAssistantMessage(memory, { speech, actions, state_update: stateUpdate });
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

function applyAttemptAssessment(memory: LessonMemory, response: AgentResponse): LessonMemory {
  const assessment = response.state_update.attempt_assessment;
  if (!assessment || !assessment.card_id || assessment.card_id !== memory.currentCardId) return memory;

  const cardId = assessment.card_id;
  const progress = { ...memory.cardProgress };
  const streak = { ...memory.cardAttemptStreak };
  let clearedCardIds = memory.clearedCardIds;
  let wordsLearned = memory.wordsLearned;

  if (assessment.result === 'correct') {
    progress[cardId] = 'cleared';
    streak[cardId] = 0;
    clearedCardIds = memory.clearedCardIds.includes(cardId)
      ? memory.clearedCardIds
      : [...memory.clearedCardIds, cardId];
    if (response.state_update.current_word) {
      wordsLearned = mergeUnique(memory.wordsLearned, [response.state_update.current_word]);
    }
    memory = updateWordPerformance(memory, response.state_update.current_word, true);
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

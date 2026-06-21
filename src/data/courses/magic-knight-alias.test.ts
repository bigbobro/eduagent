/**
 * Regression: "knight" and "night" are homophones — the ASR reliably outputs "night"/"夜晚", so
 * without an alias the R2 literal match never fires and the knight card can never be cleared.
 * The fix is course-authored data: knight.asrAliases = ['night', '夜晚']. This test proves the
 * R2 counter credits those ASR outputs as a knight hit (and clears on the 2nd).
 */
import { describe, expect, it } from 'vitest';
import { magicCourse } from './magic';
import { normalizeAssistantActions } from '@/lib/agent/memory';
import type { LessonMemory } from '@/types/session';
import type { AgentResponse } from '@/types/tools';

function memoryOnKnight(correctCount: number): LessonMemory {
  return {
    conversationHistory: [],
    wordsLearned: [],
    currentWord: 'knight',
    currentCardId: 'knight',
    cardProgress: { knight: 'attempted' },
    cardCorrectCount: { knight: correctCount },
    cardAttemptStreak: {},
    clearedCardIds: [],
    wordPerformance: new Map(),
  } as unknown as LessonMemory;
}

const response: AgentResponse = {
  speech: '再来一次',
  actions: [{ tool: 'show_card', params: { card_id: 'knight' } }],
  state_update: { current_word: 'knight' },
} as AgentResponse;

describe('magic course: knight accepts the night/夜晚 homophone', () => {
  it('1st ASR "夜晚" counts as an R2 hit, card stays on knight', () => {
    const actions = normalizeAssistantActions(memoryOnKnight(0), magicCourse, response, '夜晚');
    expect(actions.find((a) => a.tool === 'show_card')?.params.card_id).toBe('knight');
  });

  it('2nd ASR "night" clears knight and advances to the next word', () => {
    const actions = normalizeAssistantActions(memoryOnKnight(1), magicCourse, response, 'night.');
    const shown = actions.find((a) => a.tool === 'show_card')?.params.card_id;
    expect(shown).not.toBe('knight'); // advanced — knight cleared on the 2nd homophone hit
  });
});

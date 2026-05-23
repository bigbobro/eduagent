import { describe, expect, it } from 'vitest';
import { animalsCourse } from '@/data/courses/animals';
import { createMemory, initializeCardProgress } from '../memory';
import { normalizeActions } from './normalize-actions';
import { GuardContext } from './index';

describe('normalizeActions wrapper', () => {
  it('returns actions array from normalizeAssistantActions (wrapper shape correct)', () => {
    // Session starts with no current card — normalize should pick first uncleared word card (cat)
    const memory = initializeCardProgress(createMemory(), animalsCourse);
    const ctx: GuardContext = {
      speech: 'Let us look at cat!',
      actions: [{ tool: 'show_card', params: { card_id: 'cat' } }],
      stateUpdate: { current_word: 'cat' },
      memory,
      course: animalsCourse,
      asrText: 'cat',
      currentPhase: 'interactive',
    };
    const result = normalizeActions(ctx);
    // After normalize, actions must be an array (not undefined/null) with show_card entries
    expect(Array.isArray(result.actions)).toBe(true);
    // With cat as first uncleared and the LLM emitting show_card:cat, normalize keeps it
    expect(result.actions.some((a) => a.tool === 'show_card' && a.params.card_id === 'cat')).toBe(true);
  });

  it('passes asrText through to normalizeAssistantActions for R2 hit detection', () => {
    // dog is currentCard with 1 hit; sending ASR "dog" should produce 2nd hit → cleared → advance to bird
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'dog',
      cardProgress: {
        ...initializeCardProgress(createMemory(), animalsCourse).cardProgress,
        cat: 'cleared' as const,
        dog: 'attempted' as const,
      },
      clearedCardIds: ['cat'],
      cardCorrectCount: { cat: 2, dog: 1 },
    };
    const ctx: GuardContext = {
      speech: 'Good job dog!',
      actions: [],
      stateUpdate: { current_word: 'dog' },
      memory,
      course: animalsCourse,
      asrText: 'Dog.',
      currentPhase: 'interactive',
    };
    const result = normalizeActions(ctx);
    // After 2nd R2 hit, dog is cleared, normalize should advance to bird
    expect(result.actions.some((a) => a.tool === 'show_card' && a.params.card_id === 'bird')).toBe(true);
  });
});

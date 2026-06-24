import { describe, expect, it } from 'vitest';
import { animalsCourse } from '@/data/courses/animals';
import { createMemory, initializeCardProgress } from '../memory';
import { speechCardAlign, buildCardPrompt } from './speech-card-align';
import { GuardContext } from './index';

function makeCtx(overrides: Partial<GuardContext> = {}): GuardContext {
  const memory = initializeCardProgress(createMemory(), animalsCourse);
  return {
    speech: '',
    actions: [],
    stateUpdate: {},
    memory,
    course: animalsCourse,
    asrText: undefined,
    currentPhase: 'interactive',
    ...overrides,
  };
}

describe('speechCardAlign', () => {
  it('overrides speech when show_card is bird but speech mentions dog instead', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'dog',
    };
    const ctx = makeCtx({
      speech: '再跟老师说一次，dog！',
      forceCardId: 'bird',
      memory,
    });
    const result = speechCardAlign(ctx);
    const birdCard = animalsCourse.cards.find((c) => c.id === 'bird')!;
    expect(result.speech).toBe(buildCardPrompt(birdCard));
    expect(result.speech).not.toContain('dog');
  });

  it('does NOT override when speech already mentions the forceCardId card', () => {
    const ctx = makeCtx({
      speech: '我们看这只小鸟 bird！',
      forceCardId: 'bird',
    });
    const result = speechCardAlign(ctx);
    expect(result.speech).toBe(ctx.speech);
  });

  it('does NOT override when no forceCardId is set', () => {
    const ctx = makeCtx({
      speech: '很好！',
      forceCardId: undefined,
    });
    const result = speechCardAlign(ctx);
    expect(result.speech).toBe(ctx.speech);
  });

  it('overrides when speech mentions no word card at all but forceCardId points to a specific card', () => {
    // speech is generic, forceCardId is bird — since memory.currentCardId is dog (different), override
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'dog',
    };
    const ctx = makeCtx({
      speech: '做得很好！',
      forceCardId: 'bird',
      memory,
    });
    const result = speechCardAlign(ctx);
    const birdCard = animalsCourse.cards.find((c) => c.id === 'bird')!;
    // speech is generic with no word mention — since movedToDifferentCard is true, should override
    expect(result.speech).toBe(buildCardPrompt(birdCard));
  });
});

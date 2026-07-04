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

  it('R3: in-progress mode rewrites when another word card is mentioned even alongside the current word', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'bird',
    };
    const ctx = makeCtx({
      speech: '我们先停一下 bird,换一个词,看 dog!',
      forceCardId: 'bird',
      rcMode: 'in-progress',
      memory,
    });
    const result = speechCardAlign(ctx);
    const birdCard = animalsCourse.cards.find((c) => c.id === 'bird')!;
    expect(result.speech).toBe(buildCardPrompt(birdCard));
    expect(result.speech).not.toContain('dog');
    expect(result.speechRewrite).toBe('in-progress-leak');
  });

  it('R4: uses the neutral template (no "做得好") when the last attempt was incorrect', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'dog',
    };
    const ctx = makeCtx({
      speech: '再跟老师说一次，dog！',
      forceCardId: 'bird',
      memory,
      stateUpdate: {
        current_word: 'bird',
        attempt_assessment: { card_id: 'bird', result: 'wrong', should_advance: false, evidence: 'missed' },
      },
    });
    const result = speechCardAlign(ctx);
    const birdCard = animalsCourse.cards.find((c) => c.id === 'bird')!;
    expect(result.speech).toBe(buildCardPrompt(birdCard, { tone: 'neutral' }));
    expect(result.speech.startsWith('做得好')).toBe(false);
  });

  it('R2: phaseOpening turns are exempt from rewrite', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'dog',
    };
    const ctx = makeCtx({
      speech: '现在我们来玩游戏!先找一找 dog!',
      forceCardId: 'bird',
      phaseOpening: true,
      memory,
    });
    const result = speechCardAlign(ctx);
    expect(result.speech).toBe(ctx.speech);
  });
});

describe('buildCardPrompt tone', () => {
  it('defaults to the praise opener and switches to a neutral opener on demand', () => {
    const birdCard = animalsCourse.cards.find((c) => c.id === 'bird')!;
    expect(buildCardPrompt(birdCard).startsWith('做得好')).toBe(true);
    const neutral = buildCardPrompt(birdCard, { tone: 'neutral' });
    expect(neutral.startsWith('没关系')).toBe(true);
    expect(neutral).not.toContain('做得好');
    expect(neutral).toContain(birdCard.english);
  });
});

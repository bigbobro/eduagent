import { describe, expect, it } from 'vitest';
import { animalsCourse } from '@/data/courses/animals';
import { createMemory, initializeCardProgress } from '../memory';
import { prematureClosingGuard } from './premature-closing-guard';
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

describe('prematureClosingGuard (R-B)', () => {
  it('overrides speech and pushes next untouched card when soft-closing phrase found with untouched cards', () => {
    // All cards are untouched by default; cat is first in newCardIds
    const ctx = makeCtx({ speech: '今天就到这里,下次再来！' });
    const result = prematureClosingGuard(ctx);
    expect(result.speech).toContain('我们继续来学');
    expect(result.actions).toContainEqual({ tool: 'show_card', params: { card_id: 'cat' } });
  });

  it('does NOT override in reinforcement phase even with untouched cards', () => {
    const ctx = makeCtx({ speech: '下次再来！', currentPhase: 'reinforcement' });
    const result = prematureClosingGuard(ctx);
    expect(result.speech).toBe(ctx.speech);
  });

  it('does NOT override in interactive phase when all cards are cleared', () => {
    const allCleared = Object.fromEntries(
      animalsCourse.cards.filter((c) => c.kind === 'word').map((c) => [c.id, 'cleared' as const])
    );
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      cardProgress: { ...initializeCardProgress(createMemory(), animalsCourse).cardProgress, ...allCleared },
    };
    const ctx = makeCtx({ speech: '下次再来！', memory });
    const result = prematureClosingGuard(ctx);
    expect(result.speech).toBe(ctx.speech);
  });

  it('does NOT override when no soft-closing pattern matches', () => {
    const ctx = makeCtx({ speech: '做得很好！我们来看猫猫 cat！' });
    const result = prematureClosingGuard(ctx);
    expect(result.speech).toBe(ctx.speech);
    expect(result.actions).toEqual([]);
  });

  it('picks the first untouched card as next target', () => {
    // Mark cat as cleared; dog should be next
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      cardProgress: {
        ...initializeCardProgress(createMemory(), animalsCourse).cardProgress,
        cat: 'cleared' as const,
      },
    };
    const ctx = makeCtx({ speech: '下次我们再认识更多！', memory });
    const result = prematureClosingGuard(ctx);
    expect(result.actions).toContainEqual({ tool: 'show_card', params: { card_id: 'dog' } });
  });
});

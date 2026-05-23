import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createMemory, initializeCardProgress } from '../memory';
import { closingGuard } from './closing-guard';
import { GuardContext } from './index';

function makeCtx(overrides: Partial<GuardContext> = {}): GuardContext {
  const memory = initializeCardProgress(createMemory(), foodCourse);
  return {
    speech: '',
    actions: [],
    stateUpdate: {},
    memory,
    course: foodCourse,
    asrText: undefined,
    currentPhase: 'interactive',
    ...overrides,
  };
}

describe('closingGuard (R4/R6)', () => {
  it('overrides speech when LLM mentions an unlearned target word', () => {
    const ctx = makeCtx({
      speech: '今天我们认识了 apple 和 banana，真棒！',
      memory: { ...initializeCardProgress(createMemory(), foodCourse), wordsLearned: [] },
      stateUpdate: { current_word: '' },
    });
    const result = closingGuard(ctx);
    expect(result.speech).toContain('下次再来玩吧');
    expect(result.speech).not.toContain('apple');
    expect(result.speech).not.toContain('banana');
  });

  it('does NOT override when all mentioned words are already learned', () => {
    const ctx = makeCtx({
      speech: '你学了 apple,真棒！',
      memory: { ...initializeCardProgress(createMemory(), foodCourse), wordsLearned: ['apple'] },
      stateUpdate: { current_word: '' },
    });
    const result = closingGuard(ctx);
    expect(result.speech).toBe(ctx.speech);
  });

  it('R6: does NOT override when the unlearned word is the currently-taught word (memory.currentWord)', () => {
    const ctx = makeCtx({
      speech: '跟老师一起说 apple！',
      memory: {
        ...initializeCardProgress(createMemory(), foodCourse),
        wordsLearned: [],
        currentWord: 'apple',
      },
      stateUpdate: { current_word: '' },
    });
    const result = closingGuard(ctx);
    expect(result.speech).toBe(ctx.speech);
  });

  it('R6: does NOT override when the unlearned word matches state_update.current_word', () => {
    const ctx = makeCtx({
      speech: '跟老师一起说 apple！',
      memory: { ...initializeCardProgress(createMemory(), foodCourse), wordsLearned: [], currentWord: '' },
      stateUpdate: { current_word: 'apple' },
    });
    const result = closingGuard(ctx);
    expect(result.speech).toBe(ctx.speech);
  });

  it('R6: overrides when speech contains currentWord AND a different unlearned word', () => {
    const ctx = makeCtx({
      speech: '我们说 apple，还有 banana 等着我们。',
      memory: {
        ...initializeCardProgress(createMemory(), foodCourse),
        wordsLearned: [],
        currentWord: 'apple',
      },
      stateUpdate: { current_word: 'apple' },
    });
    const result = closingGuard(ctx);
    expect(result.speech).toContain('下次再来玩吧');
    expect(result.speech).not.toContain('banana');
  });

  it('includes learned words in override template', () => {
    const ctx = makeCtx({
      speech: '今天学了 apple 和 banana！',
      memory: { ...initializeCardProgress(createMemory(), foodCourse), wordsLearned: ['apple'] },
      stateUpdate: { current_word: '' },
    });
    const result = closingGuard(ctx);
    expect(result.speech).toContain('apple');
    expect(result.speech).toContain('下次再来玩吧');
    expect(result.speech).not.toContain('banana');
  });
});

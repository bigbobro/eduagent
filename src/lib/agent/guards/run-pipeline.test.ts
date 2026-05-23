import { describe, expect, it, vi } from 'vitest';
import { animalsCourse } from '@/data/courses/animals';
import { createMemory, initializeCardProgress } from '../memory';
import { GuardContext, GuardFn, runPipeline } from './index';

function makeBaseCtx(): GuardContext {
  return {
    speech: 'hello',
    actions: [],
    stateUpdate: {},
    memory: initializeCardProgress(createMemory(), animalsCourse),
    course: animalsCourse,
    asrText: undefined,
    currentPhase: 'interactive',
  };
}

describe('runPipeline', () => {
  it('applies guards in sequence and returns final ctx', () => {
    const g1: GuardFn = (ctx) => ({ ...ctx, speech: ctx.speech + ' world' });
    const g2: GuardFn = (ctx) => ({ ...ctx, speech: ctx.speech + '!' });
    const result = runPipeline(makeBaseCtx(), [g1, g2]);
    expect(result.speech).toBe('hello world!');
  });

  it('skips a failing guard and continues pipeline with unchanged ctx', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwingGuard: GuardFn = (_ctx) => { throw new Error('guard failure'); };
    const safeGuard: GuardFn = (ctx) => ({ ...ctx, speech: ctx.speech + ' safe' });

    const result = runPipeline(makeBaseCtx(), [throwingGuard, safeGuard]);

    // ctx passed on unchanged from the throwing guard, then safe guard runs
    expect(result.speech).toBe('hello safe');
    // error was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      '[guard]',
      'throwingGuard',
      'failed:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('returns original ctx when all guards throw', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad1: GuardFn = (_ctx) => { throw new Error('bad1'); };
    const bad2: GuardFn = (_ctx) => { throw new Error('bad2'); };
    const ctx = makeBaseCtx();
    const result = runPipeline(ctx, [bad1, bad2]);
    expect(result.speech).toBe('hello');
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it('returns original ctx unchanged when guards array is empty', () => {
    const ctx = makeBaseCtx();
    const result = runPipeline(ctx, []);
    expect(result).toBe(ctx);
  });
});

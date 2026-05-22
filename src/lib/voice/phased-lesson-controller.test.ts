import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { PhasedLessonController, PhaseName } from './phased-lesson-controller';

function mockV2() {
  const listeners = new Map<string, Set<Function>>();
  let state = 'idle';
  return {
    on(event: string, fn: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off(event: string, fn: Function) {
      listeners.get(event)?.delete(fn);
    },
    emit(event: string, data: any) {
      if (event === 'state') state = data;
      listeners.get(event)?.forEach((fn) => fn(data));
    },
    startLesson: vi.fn(async () => {}),
    endLesson: vi.fn(async () => {}),
    startListening: vi.fn(async () => {}),
    stopListening: vi.fn(async () => {}),
    sendCustomAction: vi.fn(async () => {}),
    getSessionId: vi.fn(() => 'mock-session'),
    getState: vi.fn(() => state),
  };
}

describe('PhasedLessonController phase transitions', () => {
  let v2: ReturnType<typeof mockV2>;
  let ctrl: PhasedLessonController;

  beforeEach(() => {
    v2 = mockV2();
    ctrl = new PhasedLessonController(v2 as any, foodCourse);
  });

  it('starts at phase=intro', async () => {
    await ctrl.startLesson();
    expect(ctrl.getCurrentPhase()).toBe('intro');
  });

  it('intro to interactive when opening TTS finishes even without card actions', async () => {
    await ctrl.startLesson();
    const phaseChanges: PhaseName[] = [];
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    expect(ctrl.getCurrentPhase()).toBe('intro');

    v2.emit('state', 'awaiting');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(phaseChanges).toContain('interactive');
    expect(ctrl.getCurrentPhase()).toBe('interactive');
    expect(v2.sendCustomAction).toHaveBeenCalledWith({ action: 'phase-transition', to: 'interactive' });
  });

  it('interactive to reinforcement when all cards cleared and TTS finished', async () => {
    await ctrl.startLesson();
    (ctrl as any).currentPhase = 'interactive';
    const phaseChanges: PhaseName[] = [];
    const wordCards = foodCourse.cards.filter((card) => card.kind === 'word');
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    v2.emit('progress', {
      clearedCardIds: wordCards.map((card) => card.id),
      totalAttempts: 6,
      currentPhase: 'interactive',
    });
    v2.emit('state', 'awaiting');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(phaseChanges).toContain('reinforcement');
  });

  it('interactive to reinforcement when max attempts reached', async () => {
    await ctrl.startLesson();
    (ctrl as any).currentPhase = 'interactive';
    const phaseChanges: PhaseName[] = [];
    const wordCards = foodCourse.cards.filter((card) => card.kind === 'word');
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    v2.emit('progress', {
      clearedCardIds: ['apple'],
      totalAttempts: 3 * wordCards.length,
      currentPhase: 'interactive',
    });
    v2.emit('state', 'awaiting');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(phaseChanges).toContain('reinforcement');
  });

  it('waits for reinforcement transition speech before showing reinforcement UI', async () => {
    await ctrl.startLesson();
    (ctrl as any).currentPhase = 'interactive';
    let resolveTransition!: () => void;
    v2.sendCustomAction.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveTransition = resolve;
    }));
    const phaseChanges: PhaseName[] = [];
    const wordCards = foodCourse.cards.filter((card) => card.kind === 'word');
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    v2.emit('progress', {
      clearedCardIds: wordCards.map((card) => card.id),
      totalAttempts: 6,
      currentPhase: 'interactive',
    });
    v2.emit('state', 'awaiting');
    await Promise.resolve();

    expect(phaseChanges).not.toContain('reinforcement');

    resolveTransition();
    await vi.waitFor(() => expect(phaseChanges).toContain('reinforcement'));
  });
});

describe('PhasedLessonController intro follow-up fallback', () => {
  let v2: ReturnType<typeof mockV2>;
  let ctrl: PhasedLessonController;

  beforeEach(() => {
    vi.useFakeTimers();
    v2 = mockV2();
    ctrl = new PhasedLessonController(v2 as any, foodCourse);
  });

  afterEach(() => vi.useRealTimers());

  it('unlocks intro hotspots if startup never returns', async () => {
    v2.startLesson.mockImplementationOnce(() => new Promise<void>(() => {}));
    const busyChanges: boolean[] = [];
    ctrl.on('intro-busy-change', (busy: boolean) => busyChanges.push(busy));

    void ctrl.startLesson();
    expect(ctrl.isIntroBusy()).toBe(true);

    vi.advanceTimersByTime(7100);
    expect(ctrl.isIntroBusy()).toBe(false);
    expect(busyChanges).toEqual([true, false]);
  });
});

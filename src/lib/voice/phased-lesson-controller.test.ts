import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import type { ResumeInfo } from './lesson-controller';
import { PhasedLessonController, PhaseName } from './phased-lesson-controller';

function mockV2(resumeInfo: ResumeInfo | null = null) {
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
    startLesson: vi.fn(async (): Promise<boolean | void> => {}),
    endLesson: vi.fn(async () => {}),
    startListening: vi.fn(async () => {}),
    stopListening: vi.fn(async () => {}),
    sendCustomAction: vi.fn(async () => {}),
    getSessionId: vi.fn(() => 'mock-session'),
    getState: vi.fn(() => state),
    // R1 (2026-07-20 session persistence): defaults to "no resume" so existing tests keep
    // exercising the fresh-start intro→interactive path unchanged.
    getResumeInfo: vi.fn(() => resumeInfo),
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

  it('clears intro busy and returns false when the underlying lesson fails to start', async () => {
    v2.startLesson.mockResolvedValueOnce(false);
    const busyChanges: boolean[] = [];
    ctrl.on('intro-busy-change', (busy: boolean) => busyChanges.push(busy));

    await expect(ctrl.startLesson()).resolves.toBe(false);

    expect(ctrl.isIntroBusy()).toBe(false);
    expect(busyChanges).toEqual([true, false]);
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

  it('transitions to reinforcement immediately when the last word clears while already awaiting', async () => {
    await ctrl.startLesson();
    (ctrl as any).currentPhase = 'interactive';
    const phaseChanges: PhaseName[] = [];
    const wordCards = foodCourse.cards.filter((card) => card.kind === 'word');
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    v2.emit('state', 'awaiting');
    v2.emit('progress', {
      clearedCardIds: wordCards.map((card) => card.id),
      totalAttempts: 0,
      currentPhase: 'interactive',
    });

    await vi.waitFor(() => expect(phaseChanges).toContain('reinforcement'));
    expect(v2.sendCustomAction).toHaveBeenCalledWith({ action: 'phase-transition', to: 'reinforcement' });
  });

  it('interactive to reinforcement when snapshot reports allWordsDone with a parked word (F3)', async () => {
    await ctrl.startLesson();
    (ctrl as any).currentPhase = 'interactive';
    const phaseChanges: PhaseName[] = [];
    const wordCards = foodCourse.cards.filter((card) => card.kind === 'word');
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    v2.emit('state', 'awaiting');
    // 逃生阀:一个词 parked 未 cleared,cleared 数不满,但服务端判定队列已完成。
    v2.emit('progress', {
      clearedCardIds: wordCards.slice(1).map((card) => card.id),
      totalAttempts: 0,
      currentPhase: 'interactive',
      allWordsDone: true,
    });

    await vi.waitFor(() => expect(phaseChanges).toContain('reinforcement'));
    expect(v2.sendCustomAction).toHaveBeenCalledWith({ action: 'phase-transition', to: 'reinforcement' });
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

describe('PhasedLessonController resume (2026-07-20 session persistence)', () => {
  it('jumps straight to the resumed phase instead of intro→interactive auto-transition', async () => {
    const resume: ResumeInfo = {
      resumed: true,
      phase: 'interactive',
      clearedCardIds: ['apple'],
      resumeCardId: 'banana',
      passedQuizIds: [],
    };
    const v2 = mockV2(resume);
    const ctrl = new PhasedLessonController(v2 as any, foodCourse);
    const phaseChanges: PhaseName[] = [];
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    await ctrl.startLesson();

    expect(ctrl.getCurrentPhase()).toBe('interactive');
    expect(phaseChanges).toEqual(['interactive']);
    expect(ctrl.getResumeInfo()).toEqual(resume);

    // The default intro auto-transition (onV2State: currentPhase==='intro' → performTransition)
    // must not also fire once TTS finishes — currentPhase is already 'interactive'.
    v2.emit('state', 'awaiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(phaseChanges).toEqual(['interactive']);
    expect(v2.sendCustomAction).not.toHaveBeenCalled();
  });

  it('jumps straight to reinforcement when resumed there', async () => {
    const resume: ResumeInfo = {
      resumed: true,
      phase: 'reinforcement',
      clearedCardIds: foodCourse.cards.filter((c) => c.kind === 'word').map((c) => c.id),
      resumeCardId: '',
      passedQuizIds: ['q1'],
    };
    const v2 = mockV2(resume);
    const ctrl = new PhasedLessonController(v2 as any, foodCourse);

    await ctrl.startLesson();

    expect(ctrl.getCurrentPhase()).toBe('reinforcement');
  });

  it('has no resume info for a fresh (non-resumed) start', async () => {
    const v2 = mockV2(null);
    const ctrl = new PhasedLessonController(v2 as any, foodCourse);

    await ctrl.startLesson();

    expect(ctrl.getCurrentPhase()).toBe('intro');
    expect(ctrl.getResumeInfo()).toBeNull();
  });

  it('clears resume info on endLesson', async () => {
    const resume: ResumeInfo = {
      resumed: true,
      phase: 'interactive',
      clearedCardIds: [],
      resumeCardId: 'apple',
      passedQuizIds: [],
    };
    const v2 = mockV2(resume);
    const ctrl = new PhasedLessonController(v2 as any, foodCourse);
    await ctrl.startLesson();
    expect(ctrl.getResumeInfo()).not.toBeNull();

    await ctrl.endLesson();

    expect(ctrl.getResumeInfo()).toBeNull();
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

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

  it('serializes intro hotspot requests until playback returns to awaiting', async () => {
    await ctrl.startLesson();
    v2.emit('state', 'awaiting');
    const busyChanges: boolean[] = [];
    const activeCardChanges: Array<string | null> = [];
    ctrl.on('intro-busy-change', (busy: boolean) => busyChanges.push(busy));
    ctrl.on('intro-active-card-change', (cardId: string | null) => activeCardChanges.push(cardId));

    let resolveAction!: () => void;
    v2.sendCustomAction.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveAction = resolve; }),
    );

    const firstRequest = ctrl.requestIntroCard('apple');
    expect(ctrl.isIntroBusy()).toBe(true);
    expect(ctrl.getIntroActiveCardId()).toBe('apple');
    expect(v2.sendCustomAction).toHaveBeenCalledTimes(1);

    await ctrl.requestIntroCard('banana');
    expect(v2.sendCustomAction).toHaveBeenCalledTimes(1);

    v2.emit('state', 'speaking');
    resolveAction();
    await firstRequest;
    expect(ctrl.isIntroBusy()).toBe(true);

    v2.emit('state', 'awaiting');
    expect(ctrl.isIntroBusy()).toBe(false);
    expect(ctrl.getIntroActiveCardId()).toBeNull();

    await ctrl.requestIntroCard('banana');
    expect(v2.sendCustomAction).toHaveBeenCalledTimes(2);
    expect(busyChanges).toContain(true);
    expect(busyChanges).toContain(false);
    expect(activeCardChanges).toContain('apple');
    expect(activeCardChanges).toContain(null);
  });

  it('intro to interactive when all cards introduced and TTS finished', async () => {
    await ctrl.startLesson();
    const phaseChanges: PhaseName[] = [];
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    for (const card of foodCourse.cards) {
      v2.emit('actions', [{ tool: 'show_card', params: { card_id: card.id } }]);
    }
    expect(ctrl.getIntroActiveCardId()).toBe('rice');
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
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    v2.emit('progress', {
      clearedCardIds: foodCourse.cards.map((card) => card.id),
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
    ctrl.on('phase-change', (phase: PhaseName) => phaseChanges.push(phase));

    v2.emit('progress', {
      clearedCardIds: ['apple'],
      totalAttempts: 3 * foodCourse.cards.length,
      currentPhase: 'interactive',
    });
    v2.emit('state', 'awaiting');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(phaseChanges).toContain('reinforcement');
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

  it('intro idle with missing cards sends follow-up message', async () => {
    await ctrl.startLesson();
    for (const card of foodCourse.cards.slice(0, 3)) {
      v2.emit('actions', [{ tool: 'show_card', params: { card_id: card.id } }]);
    }
    v2.emit('state', 'awaiting');
    vi.advanceTimersByTime(3500);

    expect(v2.sendCustomAction).toHaveBeenCalledWith({
      action: 'message',
      text: expect.stringContaining('继续'),
    });
  });

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

  it('clears startup unlock once intro is awaiting', async () => {
    v2.startLesson.mockImplementationOnce(() => new Promise<void>(() => {}));
    void ctrl.startLesson();
    v2.emit('state', 'awaiting');

    let resolveAction!: () => void;
    v2.sendCustomAction.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveAction = resolve; }),
    );
    const request = ctrl.requestIntroCard('apple');
    expect(ctrl.isIntroBusy()).toBe(true);

    vi.advanceTimersByTime(7100);
    expect(ctrl.isIntroBusy()).toBe(true);

    resolveAction();
    await request;
  });

  it('third intro idle forces interactive', async () => {
    await ctrl.startLesson();
    for (let i = 0; i < 3; i++) {
      v2.emit('state', 'speaking');
      v2.emit('state', 'awaiting');
      vi.advanceTimersByTime(3500);
    }
    const calls = (v2.sendCustomAction as any).mock.calls.map((call: any[]) => call[0]);

    expect(calls.filter((call: any) => call.action === 'message')).toHaveLength(2);
    expect(calls.find((call: any) => call.action === 'phase-transition' && call.to === 'interactive')).toBeDefined();
  });
});

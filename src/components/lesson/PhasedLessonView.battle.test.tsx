import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { PhasedLessonView } from './PhasedLessonView';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const starts: Array<[string, object | undefined]> = []; let live: any;
vi.mock('@/lib/voice/realtime-classroom', () => ({ RealtimeClassroom: class {
  interaction = 'conversation'; listeners = new Map<string, Set<(data: any) => void>>();
  handlers = { get: (event: string) => (data: any) => this.listeners.get(event)?.forEach((fn) => fn(data)) };
  constructor() { live = this; }
  on(event: string, fn: (data: any) => void) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event)!.add(fn); }
  off(event: string, fn: (data: any) => void) { this.listeners.get(event)?.delete(fn); }
  getState() { return 'awaiting'; } getResumeInfo() { return null; }
  async startLesson(learnerId: string, options?: object) {
    starts.push([learnerId, options]);
    this.handlers.get('progress')?.({ clearedCardIds: [], totalAttempts: 0, currentPhase: 'interactive', collectedCardIds: ['milk'] });
    this.handlers.get('phase-change')?.('interactive');
    return true;
  }
  async endLesson() {} presented() {} async setPaused() {} async repeatCard() {}
} }));
const values = new Map<string, string>();
beforeEach(() => {
  starts.length = 0; values.clear(); values.set('eduagent.classroomMode', 'realtime');
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());
async function start() {
  const view = render(<PhasedLessonView course={foodCourse} learnerId="kid" />);
  await waitFor(() => expect(screen.getByRole('radio', { name: /Realtime/ }).getAttribute('aria-checked')).toBe('true'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '我们开始吧' })); });
  return view;
}

describe('word battle in the Realtime classroom', () => {
  const emit = (revision: number, cardId: string, mastered = true) => act(() => live.handlers.get('answer-result')?.({ cardId, via: 'voice', result: 'correct', mastered, revision }));
  const wrapUp = () => act(() => live.handlers.get('sitting-wrap-up')?.(undefined));
  it('teaches with the normal card first and turns the closing recall game into the battle', async () => {
    const { container } = await start();
    expect(starts).toEqual([['kid', { game: true, speaker: true }]]);
    await waitFor(() => expect(container.querySelector('.p2-stage')).toBeTruthy());
    expect(container.querySelector('.bt-stage')).toBeNull();
    expect(screen.queryByRole('button', { name: '字幕' })).toBeNull(); expect(container.querySelector('.p2-subs-closed')).toBeNull();
    emit(1, 'apple', false); // learning: nothing on screen changes into a game
    expect(container.querySelector('.bt-stage')).toBeNull();
    wrapUp();
    const stage = container.querySelector<HTMLElement>('.bt-stage')!;
    expect(stage).toBeTruthy(); expect(container.querySelector('.p2-stage')).toBeNull();
    expect(stage.dataset.battleCollected).toBe('1'); // milk: owned, not practised today
    expect(container.querySelector('.p2-subs-closed .p2-log')).toBeTruthy(); // still mounted, so it keeps collecting lines
    fireEvent.click(screen.getByRole('button', { name: '字幕' }));
    expect(container.querySelector('.p2-subs-closed')).toBeNull();
  });
  it('shows the collection, today\'s team and the escaped monster when the sitting ends, and remembers that monster', async () => {
    const { container } = await start();
    await waitFor(() => expect(container.querySelector('.p2-stage')).toBeTruthy());
    emit(1, 'apple', false); emit(2, 'banana', false);
    wrapUp();
    emit(3, 'apple'); emit(4, 'banana'); // two unprompted recalls tame the first monster
    act(() => { live.handlers.get('progress')?.({ clearedCardIds: ['apple', 'banana'], totalAttempts: 4, currentPhase: 'interactive', collectedCardIds: ['apple', 'banana', 'milk'] }); live.handlers.get('sitting-ended')?.(undefined); });
    expect(screen.getByText('今天先学到这里')).toBeTruthy();
    expect(screen.getByText('今天收服了 1 只')).toBeTruthy();
    expect(container.querySelectorAll('.bt-summary-grid [data-collected]')).toHaveLength(3);
    expect(values.has('eduagent.wordBattle.nextKind')).toBe(true);
  });
  it('leaves the classroom exactly as before when the switch is off', async () => {
    values.set('eduagent.wordBattle', 'off');
    const { container } = await start();
    expect(starts).toEqual([['kid', { speaker: true }]]);
    await waitFor(() => expect(container.querySelector('.p2-stage')).toBeTruthy());
    wrapUp(); // the server never sends it with the game off; even so, nothing changes
    expect(container.querySelector('.bt-stage')).toBeNull();
    expect(screen.queryByRole('button', { name: '字幕' })).toBeNull();
    expect(container.querySelector('.p2-subs-closed')).toBeNull();
  });
});

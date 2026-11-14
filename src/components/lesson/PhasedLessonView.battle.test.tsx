import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import type { AnswerResult } from '@/lib/voice/classroom';
import { takeEscapedMonster } from '@/lib/word-battle-pref';
import { BATTLE_END_DELAY_MS, PhasedLessonView } from './PhasedLessonView';

vi.mock('./battle/sfx', () => ({ playBattleSfx: vi.fn(), preloadBattleSfx: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const starts: Array<[string, object | undefined]> = []; let live: any;
vi.mock('@/lib/voice/realtime-classroom', () => ({ RealtimeClassroom: class {
  interaction = 'conversation'; listeners = new Map<string, Set<(data: any) => void>>();
  handlers = { get: (event: string) => (data: any) => this.listeners.get(event)?.forEach((fn) => fn(data)) };
  constructor() { live = this; }
  emit(event: string, data?: any) { this.handlers.get(event)?.(data); }
  on(event: string, fn: (data: any) => void) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event)!.add(fn); }
  off(event: string, fn: (data: any) => void) { this.listeners.get(event)?.delete(fn); }
  getState() { return 'awaiting'; } getResumeInfo() { return null; }
  async startLesson(learnerId: string, options?: object) {
    starts.push([learnerId, options]);
    this.handlers.get('progress')?.({ clearedCardIds: [], totalAttempts: 0, currentPhase: 'interactive', collectedCardIds: ['milk'] });
    this.handlers.get('phase-change')?.('interactive');
    return true;
  }
  endLesson = vi.fn(async () => {}); presented() {} async setPaused() {} async repeatCard() {}
} }));
const values = new Map<string, string>();
beforeEach(() => {
  starts.length = 0; values.clear(); values.set('eduagent.classroomMode', 'realtime'); values.set('eduagent.wordBattle.nextKind', '0');
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function start() {
  const view = render(<PhasedLessonView course={foodCourse} learnerId="kid" />);
  await waitFor(() => expect(screen.getByRole('radio', { name: /Realtime/ }).getAttribute('aria-checked')).toBe('true'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '我们开始吧' })); });
  return { ...view, c: live, stage: () => view.container.querySelector<HTMLElement>('.bt-stage') };
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
    vi.useFakeTimers();
    act(() => { live.handlers.get('progress')?.({ clearedCardIds: ['apple', 'banana'], totalAttempts: 4, currentPhase: 'interactive', collectedCardIds: ['apple', 'banana', 'milk'] }); live.handlers.get('sitting-ended')?.(undefined); });
    act(() => vi.advanceTimersByTime(BATTLE_END_DELAY_MS));
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

const answer = (cardId: string, revision: number, mastered = false): AnswerResult => ({ cardId, revision, mastered, via: 'voice', result: 'correct' });
function progress(c: any, collectedCardIds: string[]) {
  c.emit('progress', { clearedCardIds: collectedCardIds, totalAttempts: collectedCardIds.length, currentPhase: 'interactive', collectedCardIds });
}

describe('sitting battle boundaries', () => {
  it('takes stolen/from at the first battle card and keeps pre-battle answers out of combat', async () => {
    const { c, stage, container } = await start();
    act(() => { progress(c, ['apple', 'milk']); c.emit('answer-result', answer('apple', 1)); });
    expect(stage()).toBeNull();
    // This try happened after the time check, before show_card. It is practice, not a spell.
    act(() => c.emit('answer-result', answer('milk', 2, true)));
    act(() => { c.emit('actions', [{ tool: 'show_card', params: { card_id: 'milk' } }]); c.emit('sitting-wrap-up'); });
    expect(stage()?.dataset).toMatchObject({ battleHp: '3', battleCollected: '0', battleTeam: '0' });
    expect(container.querySelector('.p2-word')?.textContent).toBe('milk');
    expect(container.querySelector('.p2-word')?.className).toContain('bt-secret');
    act(() => c.emit('answer-result', answer('milk', 3)));
    expect(stage()?.dataset).toMatchObject({ battleHp: '2', battleCollected: '1' });
    expect(container.querySelector('.p2-word')?.className).toContain('bt-known');
  });
  it.each(['before', 'after'] as const)('includes the last hit arriving %s sitting-ended and leaves time to animate it', async (when) => {
    const { c, stage, container } = await start();
    act(() => c.emit('sitting-wrap-up'));
    act(() => c.emit('answer-result', answer('apple', 1, true))); // 3 -> 1 hp
    vi.useFakeTimers();
    const finalHit = () => { progress(c, ['apple', 'milk']); c.emit('answer-result', answer('milk', 2, true)); };
    // In the before case React has not committed the last hit when sitting-ended arrives.
    act(() => { if (when === 'before') finalHit(); c.emit('sitting-ended'); });
    if (when === 'after') { act(() => vi.advanceTimersByTime(100)); act(finalHit); }
    expect(stage()?.dataset).toMatchObject({ battleHp: '4', battleTeam: '1', battleCollected: '2' });
    expect(container.querySelector('.bt-spell')).toBeTruthy();
    expect(screen.queryByText('今天先学到这里')).toBeNull();
    act(() => vi.advanceTimersByTime(BATTLE_END_DELAY_MS - (when === 'after' ? 100 : 0) - 1));
    expect(stage()).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(stage()).toBeNull();
    expect(screen.getByText('今天先学到这里')).toBeTruthy();
    expect(screen.getByText('今天收服了 1 只')).toBeTruthy();
    expect(screen.getByRole('region', { name: '单词大战成果' }).getAttribute('data-battle-summary')).toBe('2');
    expect(takeEscapedMonster()).toBe(1); // next monster, not the one just tamed
    expect(c.endLesson).not.toHaveBeenCalled(); // UI delay does not own the call lifecycle
  });
  it('ends immediately without a battle or battle summary if no battle card was shown', async () => {
    const { c, stage } = await start();
    vi.useFakeTimers(); act(() => c.emit('sitting-ended'));
    expect(stage()).toBeNull(); expect(screen.getByText('今天先学到这里')).toBeTruthy();
    expect(screen.queryByRole('region', { name: '单词大战成果' })).toBeNull();
  });
  it('cancels the delayed snapshot when the lesson unmounts', async () => {
    const { c, unmount } = await start();
    act(() => c.emit('sitting-wrap-up'));
    vi.useFakeTimers(); act(() => c.emit('sitting-ended')); unmount();
    act(() => vi.advanceTimersByTime(BATTLE_END_DELAY_MS));
    expect(takeEscapedMonster()).toBeNull();
  });
});

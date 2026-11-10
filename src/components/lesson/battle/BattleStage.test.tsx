import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import type { AnswerResult } from '@/lib/voice/classroom';
import { isWordBattleOn, rememberEscapedMonster, setWordBattleOn, takeEscapedMonster } from '@/lib/word-battle-pref';
import { LessonMandalaV2 } from '../LessonMandalaV2';
import { BattleSummary } from './BattleSummary';

function controller(interaction: 'conversation' | 'push-to-talk'): any {
  const handlers = new Map<string, (payload: any) => void>();
  return { handlers, interaction, on: vi.fn((event: string, handler: (payload: any) => void) => handlers.set(event, handler)), off: vi.fn((event: string) => handlers.delete(event)),
    startListening: vi.fn(), stopListening: vi.fn(), repeatCard: vi.fn(async () => {}), presented: vi.fn(), setPaused: vi.fn(async () => {}), getState: () => 'awaiting' };
}
const answer = (cardId: string, revision: number, extra: Partial<AnswerResult> = {}): AnswerResult => ({ cardId, via: 'voice', result: 'correct', mastered: false, revision, ...extra });
const stage = (container: HTMLElement) => container.querySelector<HTMLElement>('.bt-stage')!;
afterEach(() => vi.unstubAllGlobals());

describe('word battle scene', () => {
  it('replaces the lesson card layout only in the conversation classroom with the battle on', () => {
    const on = render(<LessonMandalaV2 course={foodCourse} controller={controller('conversation')} battle />);
    expect(stage(on.container)).toBeTruthy(); expect(on.container.querySelector('.p2-stage')).toBeNull();
    on.unmount();
    const off = render(<LessonMandalaV2 course={foodCourse} controller={controller('conversation')} />);
    expect(stage(off.container)).toBeNull(); expect(off.container.querySelector('.p2-stage')).toBeTruthy();
    off.unmount();
    const legacy = render(<LessonMandalaV2 course={foodCourse} controller={controller('push-to-talk')} battle />);
    expect(stage(legacy.container)).toBeNull(); expect(screen.getByRole('button', { name: '按住空格说话' })).toBeTruthy();
  });
  it('hides the English until the child wins the word, and keeps the rest of the card', () => {
    const c = controller('conversation');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={c} battle initialCardId="banana" />);
    const card = container.querySelector('[data-picture-card-size="hero"]')!;
    expect(card.querySelector('.p2-word')?.textContent).toBe('banana'); // in the DOM for tooling, not shown
    expect(card.querySelector('.p2-word')?.className).toContain('bt-secret');
    expect(screen.getByRole('img', { name: '用英语说出来' })).toBeTruthy();
    expect(card.querySelector('.bt-parts')).toBeNull();
    expect(card.textContent).toContain('香蕉');
    expect(screen.getByRole('button', { name: '老师再讲一遍' })).toBeTruthy();
    expect(c.presented).toHaveBeenCalledWith({ kind: 'card', id: 'banana' });
    expect(screen.getByRole('status', { name: '对话状态' })).toBeTruthy();
    act(() => c.handlers.get('answer-result')?.(answer('banana', 1, { result: 'close' })));
    expect(card.querySelector('.p2-word')?.className).toContain('bt-secret'); // a near miss reveals nothing
    act(() => c.handlers.get('answer-result')?.(answer('banana', 2)));
    expect(card.querySelector('.p2-word')?.className).toContain('bt-known');
    expect(screen.queryByRole('img', { name: '用英语说出来' })).toBeNull();
    expect(card.querySelectorAll('.bt-parts span')).toHaveLength(foodCourse.cards.find((x) => x.id === 'banana')!.drillParts.length);
  });
  it('fights with the words learned first: the monster snatches today\'s cards and recall wins them back', () => {
    const c = controller('conversation');
    const view = render(<LessonMandalaV2 course={foodCourse} controller={c} initialCollectedCardIds={['milk', 'water']} />);
    const emit = (a: AnswerResult) => act(() => c.handlers.get('answer-result')?.(a));
    // Learning: the normal card, no battle. Today the child practises apple, milk and egg.
    emit(answer('apple', 1)); emit(answer('milk', 2)); emit(answer('egg', 3, { result: 'close' }));
    expect(stage(view.container)).toBeNull(); expect(view.container.querySelector('.p2-stage')).toBeTruthy();
    // The closing recall game starts.
    view.rerender(<LessonMandalaV2 course={foodCourse} controller={c} initialCollectedCardIds={['milk', 'water']} battle />);
    const data = () => ({ ...stage(view.container).dataset });
    // water was not practised today and stays; milk was owned and practised, so the monster holds it.
    expect(data()).toMatchObject({ battleMonster: '0', battleHp: '3', battleTeam: '0', battleCollected: '1' });
    emit(answer('milk', 4)); // said after a hint: a normal hit, and an owned card comes back on any hit
    expect(data()).toMatchObject({ battleHp: '2', battleCollected: '2' });
    emit(answer('milk', 4)); // replayed revision
    emit(answer('egg', 5, { result: 'close' })); // graze
    emit(answer('egg', 6, { result: 'wrong' }));
    emit(answer('milk', 7, { via: 'choice', quizId: 'q2' })); // practice answers belong to a later level
    expect(data()).toMatchObject({ battleHp: '2', battleCollected: '2' });
    emit(answer('apple', 8)); // never owned and said only after a hint: hits, not collected yet
    expect(data()).toMatchObject({ battleHp: '1', battleCollected: '2' });
    emit(answer('apple', 9, { mastered: true })); // recalled unprompted: a crit, collected, and the monster is tamed
    expect(data()).toMatchObject({ battleMonster: '1', battleHp: '4', battleTeam: '1', battleCollected: '3' });
    expect(view.container.querySelectorAll('.bt-slot[data-collected]')).toHaveLength(3);
  });
  it('does not add a card to the collection from a progress update alone', () => {
    const c = controller('conversation');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={c} battle />);
    act(() => c.handlers.get('progress')?.({ clearedCardIds: ['apple'], totalAttempts: 1, currentPhase: 'interactive', collectedCardIds: ['apple'] }));
    expect(stage(container).dataset.battleCollected).toBe('0'); // the answer that follows animates it in
  });
});

describe('battle summary', () => {
  const words = foodCourse.cards.filter((card) => card.kind === 'word');
  it('shows the collection, today\'s team and the monster to catch next time', () => {
    render(<BattleSummary course={foodCourse} collectedCardIds={['apple', 'milk']} team={[{ kind: 0, gold: false }]} escaped={{ kind: 4, gold: false, hp: 2, maxHp: 4 }} />);
    expect(screen.getByText(`收藏册 2 / ${words.length}`)).toBeTruthy();
    expect(screen.getByText('今天收服了 1 只')).toBeTruthy();
    expect(screen.getByText(/小狐狸跑掉了/)).toBeTruthy();
  });
  it('celebrates a full collection without a monster to chase', () => {
    render(<BattleSummary course={foodCourse} collectedCardIds={words.map((w) => w.id)} escaped={{ kind: 1, gold: false, hp: 1, maxHp: 3 }} />);
    expect(screen.getByText(new RegExp(`${words.length} 张卡全部救回`))).toBeTruthy();
    expect(screen.queryByText(/跑掉了/)).toBeNull();
  });
});

describe('word battle preference', () => {
  it('is on unless switched off, and the escaped monster is remembered once', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
    expect(isWordBattleOn()).toBe(true);
    setWordBattleOn(false); expect(isWordBattleOn()).toBe(false);
    setWordBattleOn(true); expect(isWordBattleOn()).toBe(true);
    expect(takeEscapedMonster()).toBeNull();
    rememberEscapedMonster(3);
    expect(takeEscapedMonster()).toBe(3); expect(takeEscapedMonster()).toBeNull();
  });
});

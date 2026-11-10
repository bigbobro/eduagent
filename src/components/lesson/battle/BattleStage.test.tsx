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
  it('keeps every teaching element on the spell card and still reports the rendered card', () => {
    const c = controller('conversation');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={c} battle initialCardId="banana" />);
    const card = container.querySelector('[data-picture-card-size="hero"]')!;
    expect(card.querySelector('.p2-word')?.textContent).toBe('banana');
    expect(card.textContent).toContain('香蕉');
    expect(card.querySelectorAll('.bt-parts span')).toHaveLength(foodCourse.cards.find((x) => x.id === 'banana')!.drillParts.length);
    expect(screen.getByRole('button', { name: '老师再讲一遍' })).toBeTruthy();
    expect(c.presented).toHaveBeenCalledWith({ kind: 'card', id: 'banana' });
    expect(screen.getByRole('status', { name: '对话状态' })).toBeTruthy();
  });
  it('turns committed answers into hits, crits and collected cards exactly once', () => {
    const c = controller('conversation');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={c} battle initialCollectedCardIds={['milk']} />);
    const data = () => ({ ...stage(container).dataset });
    expect(data()).toMatchObject({ battleMonster: '0', battleHp: '3', battleTeam: '0', battleCollected: '1' });
    const emit = (a: AnswerResult) => act(() => c.handlers.get('answer-result')?.(a));
    emit(answer('apple', 1));
    expect(data()).toMatchObject({ battleHp: '2', battleCollected: '2' });
    emit(answer('apple', 1)); // replayed revision
    emit(answer('apple', 2, { result: 'close' })); // graze
    emit(answer('apple', 3, { result: 'wrong' }));
    emit(answer('milk', 4, { via: 'choice', quizId: 'q2' })); // practice answers belong to a later level
    expect(data()).toMatchObject({ battleHp: '2', battleCollected: '2' });
    emit(answer('milk', 5)); // already collected at mount: hits, does not collect again
    expect(data()).toMatchObject({ battleHp: '1', battleCollected: '2' });
    emit(answer('egg', 6, { mastered: true })); // crit tames the monster, the next one has 4 hearts
    expect(data()).toMatchObject({ battleMonster: '1', battleHp: '4', battleTeam: '1', battleCollected: '3' });
    expect(container.querySelectorAll('.bt-slot[data-collected]')).toHaveLength(3);
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

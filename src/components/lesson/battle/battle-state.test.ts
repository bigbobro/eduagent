import { describe, expect, it } from 'vitest';
import type { AnswerResult } from '@/lib/voice/classroom';
import { foodCourse } from '@/data/courses/food';
import { applyAnswer, initBattle, type BattleState } from './battle-state';

const rng = (start = 0, golds: boolean[] = []) => ({ startKind: () => start, gold: () => golds.shift() ?? false });

let rev = 0;
const ans = (cardId: string, over: Partial<AnswerResult> = {}): AnswerResult => ({
  cardId, via: 'voice', result: 'correct', mastered: false, revision: ++rev, ...over,
});

function play(state: BattleState, answers: AnswerResult[], r = rng()) {
  let s = state;
  const all = [];
  for (const a of answers) {
    const out = applyAnswer(s, a, foodCourse, r);
    s = out.state;
    all.push(out.effects);
  }
  return { state: s, effects: all };
}

describe('initBattle', () => {
  it('builds the first monster from the rng and copies collected ids', () => {
    const ids = ['apple'];
    const s = initBattle(ids, rng(2, [true]));
    expect(s).toEqual({
      collected: ['apple'], monster: { kind: 2, gold: true, hp: 3, maxHp: 3 },
      index: 0, startKind: 2, team: [], lastRevision: -1,
    });
    expect(s.collected).not.toBe(ids);
  });
});

describe('outcomes', () => {
  it('correct is a normal hit', () => {
    const s = initBattle([], rng());
    const out = applyAnswer(s, ans('apple'), foodCourse, rng());
    expect(out.effects[0]).toEqual({ type: 'hit', cardId: 'apple', crit: false, damage: 1 });
    expect(out.state.monster.hp).toBe(2);
  });

  it('mastered is a crit', () => {
    const s = initBattle([], rng());
    const out = applyAnswer(s, ans('apple', { mastered: true }), foodCourse, rng());
    expect(out.effects[0]).toEqual({ type: 'hit', cardId: 'apple', crit: true, damage: 2 });
    expect(out.state.monster.hp).toBe(1);
  });

  it('mastered with close still crits', () => {
    const s = initBattle([], rng());
    const out = applyAnswer(s, ans('apple', { mastered: true, result: 'close' }), foodCourse, rng());
    expect(out.effects[0]).toMatchObject({ type: 'hit', crit: true, damage: 2 });
  });

  it('close grazes: no hp change, nothing collected', () => {
    const s = initBattle([], rng());
    const a = ans('apple', { result: 'close' });
    const out = applyAnswer(s, a, foodCourse, rng());
    expect(out.effects).toEqual([{ type: 'graze', cardId: 'apple' }]);
    expect(out.state.monster.hp).toBe(3);
    expect(out.state.collected).toEqual([]);
    expect(out.state.lastRevision).toBe(a.revision);
  });

  it.each(['wrong', 'off_topic', 'silence'] as const)('%s has no effect but advances the revision', (result) => {
    const s = initBattle([], rng());
    const a = ans('apple', { result });
    const out = applyAnswer(s, a, foodCourse, rng());
    expect(out.effects).toEqual([]);
    expect(out.state.monster.hp).toBe(3);
    expect(out.state.collected).toEqual([]);
    expect(out.state.lastRevision).toBe(a.revision);
  });
});

describe('collection', () => {
  it('collects a word once', () => {
    const { state, effects } = play(initBattle([], rng()), [ans('apple'), ans('apple')]);
    expect(effects[0].map((e) => e.type)).toEqual(['hit', 'collect']);
    expect(effects[1].map((e) => e.type)).toEqual(['hit']);
    expect(state.collected).toEqual(['apple']);
  });

  it('does not re-collect a word from the initial collection', () => {
    const out = applyAnswer(initBattle(['milk'], rng()), ans('milk'), foodCourse, rng());
    expect(out.effects.map((e) => e.type)).toEqual(['hit']);
    expect(out.state.collected).toEqual(['milk']);
  });

  it('keeps insertion order', () => {
    const { state } = play(initBattle(['egg'], rng()), [ans('apple'), ans('banana')]);
    expect(state.collected).toEqual(['egg', 'apple', 'banana']);
  });

  it('sentence cards hit but are never collected', () => {
    const out = applyAnswer(initBattle([], rng()), ans('sentence_apple'), foodCourse, rng());
    expect(out.effects.map((e) => e.type)).toEqual(['hit']);
    expect(out.state.monster.hp).toBe(2);
    expect(out.state.collected).toEqual([]);
  });
});

describe('monsters', () => {
  const hit = (n: number) => Array.from({ length: n }, () => ans('apple'));

  it('hp goes 3, 4, 5, 5 and kinds cycle from startKind', () => {
    const r = rng(2);
    let s = initBattle([], r);
    const seen = [{ kind: s.monster.kind, hp: s.monster.maxHp }];
    for (const n of [3, 4, 5]) {
      s = play(s, hit(n), r).state;
      seen.push({ kind: s.monster.kind, hp: s.monster.maxHp });
    }
    expect(seen).toEqual([{ kind: 2, hp: 3 }, { kind: 0, hp: 4 }, { kind: 1, hp: 5 }, { kind: 2, hp: 5 }]);
    expect(s.index).toBe(3);
  });

  it('taming grows the team, emits tame then enter, and discards overkill', () => {
    const r = rng(1, [false, false]);
    const s0 = play(initBattle([], r), hit(2), r).state; // 1 hp left
    const out = applyAnswer(s0, ans('apple', { mastered: true }), foodCourse, r);
    expect(out.effects.map((e) => e.type)).toEqual(['hit', 'tame', 'enter']);
    expect(out.state.team).toEqual([{ kind: 1, gold: false }]);
    expect(out.state.monster).toEqual({ kind: 2, gold: false, hp: 4, maxHp: 4 });
  });

  it('gold comes from the rng per entering monster and carries into the team', () => {
    const r = rng(0, [true, false, true]); // first, second, third monster
    const s = initBattle([], r);
    expect(s.monster.gold).toBe(true);
    const a = play(s, hit(3), r).state;
    expect(a.monster.gold).toBe(false);
    const b = play(a, hit(4), r).state;
    expect(b.monster.gold).toBe(true);
    expect(b.team).toEqual([{ kind: 0, gold: true }, { kind: 1, gold: false }]);
  });

  it('orders hit, collect, tame, enter for one answer', () => {
    const r = rng(0, [false, true]);
    const s0 = play(initBattle([], r), [ans('milk'), ans('sentence_milk')], r).state; // hp 1, milk collected
    const out = applyAnswer(s0, ans('egg'), foodCourse, r);
    expect(out.effects).toEqual([
      { type: 'hit', cardId: 'egg', crit: false, damage: 1 },
      { type: 'collect', cardId: 'egg' },
      { type: 'tame', monster: { kind: 0, gold: false } },
      { type: 'enter', monster: { kind: 1, gold: true, hp: 4, maxHp: 4 } },
    ]);
  });
});

describe('ignored answers', () => {
  const s = () => initBattle([], rng());

  it('duplicate revision', () => {
    const a = ans('apple');
    const first = applyAnswer(s(), a, foodCourse, rng());
    const again = applyAnswer(first.state, a, foodCourse, rng());
    expect(again.state).toBe(first.state);
    expect(again.effects).toEqual([]);
  });

  it('lower revision', () => {
    const first = applyAnswer(s(), ans('apple', { revision: 10 }), foodCourse, rng());
    const out = applyAnswer(first.state, ans('banana', { revision: 5 }), foodCourse, rng());
    expect(out.state).toBe(first.state);
    expect(out.effects).toEqual([]);
  });

  it.each([
    ['choice', { via: 'choice' as const }],
    ['quizId', { quizId: 'q1' }],
    ['unknown card', { cardId: 'nope' }],
  ])('%s', (_name, over) => {
    const st = s();
    const out = applyAnswer(st, ans('apple', over), foodCourse, rng());
    expect(out.state).toBe(st);
    expect(out.effects).toEqual([]);
    expect(st.lastRevision).toBe(-1);
  });
});

describe('purity', () => {
  it('does not mutate the input state', () => {
    const st = initBattle(['egg'], rng(1, [true]));
    const before = structuredClone(st);
    const r = rng(0, [false]);
    for (const a of [ans('apple'), ans('apple', { mastered: true }), ans('apple', { mastered: true })]) {
      applyAnswer(st, a, foodCourse, r);
    }
    const nearDead = { ...st, monster: { ...st.monster, hp: 1 } };
    const beforeNear = structuredClone(nearDead);
    applyAnswer(nearDead, ans('banana'), foodCourse, r);
    expect(st).toEqual(before);
    expect(nearDead).toEqual(beforeNear);
  });
});

import type { AnswerResult } from '@/lib/voice/classroom';
import type { Course } from '@/types/course';

export const MONSTER_KINDS = 3;
export const MONSTER_HP = [3, 4, 5]; // 1st, 2nd, 3rd monster of a sitting; every later one uses the last value

export interface Monster { kind: number; gold: boolean; hp: number; maxHp: number }
export interface Teammate { kind: number; gold: boolean }
export interface BattleState {
  collected: string[];      // word card ids shown in the collection, in the order they were added
  monster: Monster;         // the monster currently on stage
  index: number;            // 0-based count of monsters that have entered before this one
  startKind: number;        // kind of the first monster; later kinds cycle from it
  team: Teammate[];         // tamed monsters, oldest first
  lastRevision: number;     // highest answer revision already applied (-1 at start)
}
export type BattleEffect =
  | { type: 'hit'; cardId: string; crit: boolean; damage: number }
  | { type: 'graze'; cardId: string }
  | { type: 'collect'; cardId: string }
  | { type: 'tame'; monster: Teammate }
  | { type: 'enter'; monster: Monster };

/** Injected randomness. startKind() returns an integer 0..MONSTER_KINDS-1; gold() is called once per monster that enters. */
export interface BattleRng { startKind(): number; gold(): boolean }

export function initBattle(collectedCardIds: string[], rng: BattleRng): BattleState {
  const startKind = rng.startKind();
  return {
    collected: [...collectedCardIds],
    monster: { kind: startKind, gold: rng.gold(), hp: MONSTER_HP[0], maxHp: MONSTER_HP[0] },
    index: 0,
    startKind,
    team: [],
    lastRevision: -1,
  };
}

export function applyAnswer(
  state: BattleState,
  answer: AnswerResult,
  course: Course,
  rng: BattleRng,
): { state: BattleState; effects: BattleEffect[] } {
  const card = course.cards.find((c) => c.id === answer.cardId);
  if (answer.revision <= state.lastRevision || answer.via !== 'voice' || answer.quizId || !card) {
    return { state, effects: [] };
  }

  const cardId = card.id;
  const next: BattleState = { ...state, lastRevision: answer.revision };
  if (!answer.mastered && answer.result === 'close') {
    return { state: next, effects: [{ type: 'graze', cardId }] };
  }
  if (!answer.mastered && answer.result !== 'correct') return { state: next, effects: [] };

  const crit = answer.mastered;
  const damage = crit ? 2 : 1;
  const effects: BattleEffect[] = [{ type: 'hit', cardId, crit, damage }];

  if (card.kind === 'word' && !state.collected.includes(cardId)) {
    next.collected = [...state.collected, cardId];
    effects.push({ type: 'collect', cardId });
  }

  const hp = Math.max(0, state.monster.hp - damage);
  if (hp > 0) {
    next.monster = { ...state.monster, hp };
    return { state: next, effects };
  }

  const tamed: Teammate = { kind: state.monster.kind, gold: state.monster.gold };
  next.team = [...state.team, tamed];
  effects.push({ type: 'tame', monster: tamed });

  const index = state.index + 1;
  const maxHp = MONSTER_HP[Math.min(index, MONSTER_HP.length - 1)];
  const entering: Monster = { kind: (state.startKind + index) % MONSTER_KINDS, gold: rng.gold(), hp: maxHp, maxHp };
  next.index = index;
  next.monster = entering;
  effects.push({ type: 'enter', monster: entering });
  return { state: next, effects };
}

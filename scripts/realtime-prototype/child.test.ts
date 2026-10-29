import { expect, it } from 'vitest';
import { applyModelDecision } from './child';

it('advances to another goal without falsely marking the current goal mastered', () => {
  const state = { goals: ['cat', 'dog'], mastered: new Set<string>(), skipped: new Set<string>() };
  expect(applyModelDecision(state, { card_id: 'cat', result: 'close', mastered: false, next_action: 'advance', heard: 'cat', evidence: 'move on for now' })).toBe('dog');
  expect(Array.from(state.mastered)).toEqual([]);
  expect(Array.from(state.skipped)).toEqual([]);
});

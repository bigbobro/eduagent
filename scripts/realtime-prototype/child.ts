import type { Assessment } from './session';

/** State of the synthetic child driver; never a production teaching policy. */
export interface SyntheticChildState {
  goals: string[];
  mastered: Set<string>;
  skipped: Set<string>;
}

export function applyModelDecision(state: SyntheticChildState, assessment: Assessment): string | undefined {
  if (assessment.mastered) state.mastered.add(assessment.card_id);
  if (assessment.next_action === 'skip') state.skipped.add(assessment.card_id);
  const move = assessment.mastered || assessment.next_action === 'advance' || assessment.next_action === 'skip';
  return move
    ? state.goals.find((goal) => goal !== assessment.card_id && !state.mastered.has(goal) && !state.skipped.has(goal))
    : assessment.card_id;
}

import { normalizeAssistantActions } from '../memory';
import { GuardFn } from './index';

/**
 * R-C normalize wrapper.
 *
 * Thin GuardFn wrapper around normalizeAssistantActions (which remains in memory.ts
 * because it is tightly coupled to applyAttemptAssessment and memory state).
 *
 * This guard replaces the inline normalizeAssistantActions call in streamUserInput
 * and makes the pipeline step explicit.
 */
export const normalizeActions: GuardFn = (ctx) => {
  const { speech, actions, stateUpdate, memory, course, asrText } = ctx;
  const normalizedActions = normalizeAssistantActions(
    memory,
    course,
    { speech, actions, state_update: stateUpdate },
    asrText,
  );
  return { ...ctx, actions: normalizedActions };
};

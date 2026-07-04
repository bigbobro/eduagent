import { getLastWordShowCardId, normalizeAssistantActions, NormalizeActionsMeta } from '../memory';
import { GuardFn } from './index';

/**
 * R-C normalize wrapper.
 *
 * Thin GuardFn wrapper around normalizeAssistantActions (which remains in memory.ts
 * because it is tightly coupled to applyAttemptAssessment and memory state).
 *
 * Besides replacing the inline normalizeAssistantActions call in streamUserInput,
 * this guard exposes the word card it selected as ctx.forceCardId, so speechCardAlign
 * can consume it directly instead of re-deriving the card from the action list.
 * It also surfaces the R-C derivation meta (mode / allWordsCleared / reject counters)
 * for speechCardAlign and the session-level R6 metrics.
 */
export const normalizeActions: GuardFn = (ctx) => {
  const { speech, actions, stateUpdate, memory, course, asrText } = ctx;
  const meta: NormalizeActionsMeta = {};
  // R2 (2026-07-04, n=41): reinforcement's phaseOpening turn must not get a forced word
  // show_card — interactive's phaseOpening (e.g. the n=2 soccer intro) is unaffected, this
  // is scoped strictly to currentPhase === 'reinforcement'.
  const skipForceShowCard = ctx.phaseOpening === true && ctx.currentPhase === 'reinforcement';
  const normalizedActions = normalizeAssistantActions(
    memory,
    course,
    { speech, actions, state_update: stateUpdate },
    asrText,
    meta,
    { skipForceShowCard },
  );
  return {
    ...ctx,
    actions: normalizedActions,
    forceCardId: getLastWordShowCardId(normalizedActions, course),
    rcMode: meta.mode,
    allWordsCleared: meta.allWordsCleared,
    rcRejectedCardIds: meta.rejectedCardIds,
    rcSuppressedCardIds: meta.suppressedCardIds,
  };
};

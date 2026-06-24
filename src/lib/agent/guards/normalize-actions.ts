import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { normalizeAssistantActions } from '../memory';
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
 */
export const normalizeActions: GuardFn = (ctx) => {
  const { speech, actions, stateUpdate, memory, course, asrText } = ctx;
  const normalizedActions = normalizeAssistantActions(
    memory,
    course,
    { speech, actions, state_update: stateUpdate },
    asrText,
  );
  return { ...ctx, actions: normalizedActions, forceCardId: wordShowCardId(normalizedActions, course) };
};

/** The word card normalizeAssistantActions made visible this turn (it always emits one). */
function wordShowCardId(actions: ToolAction[], course: Course): string {
  const wordCardIds = new Set(course.cards.filter((c) => c.kind === 'word').map((c) => c.id));
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    const cardId = action.tool === 'show_card' ? action.params.card_id : '';
    if (wordCardIds.has(cardId)) return cardId;
  }
  return '';
}

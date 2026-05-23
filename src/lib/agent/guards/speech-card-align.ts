import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { GuardFn } from './index';

/**
 * Align speech with the normalized show_card action.
 *
 * If the normalized actions point to a word card (forceCardId) but the speech
 * does NOT mention that card while mentioning a different word card, rewrite
 * the speech to introduce the forceCardId card. This prevents the "show_card:bird
 * while TTS says dog" race.
 *
 * NOTE: This guard reads ctx.actions AFTER normalizeActions has run. The order
 * closingGuard → prematureClosingGuard → normalizeActions → speechCardAlign is
 * mandatory (see guards/index.ts runPipeline comment).
 */
export const speechCardAlign: GuardFn = (ctx) => {
  const { speech, actions, course, memory } = ctx;
  const primaryCardId = getLastWordShowCardId(actions, course);
  if (!primaryCardId) return ctx;

  const primaryCard = course.cards.find((card) => card.id === primaryCardId && card.kind === 'word');
  if (!primaryCard) return ctx;

  const mentionsPrimary = speechMentionsCard(speech, primaryCard);
  const mentionedOtherWord = course.cards
    .filter((card) => card.kind === 'word' && card.id !== primaryCardId)
    .some((card) => speechMentionsCard(speech, card));
  const movedToDifferentCard = Boolean(memory.currentCardId && memory.currentCardId !== primaryCardId);

  if (!mentionsPrimary && (mentionedOtherWord || movedToDifferentCard)) {
    console.warn('[session] speech/show_card mismatch — overriding speech', {
      currentCardId: memory.currentCardId,
      showCardId: primaryCardId,
      speech: speech.slice(0, 120),
    });
    return { ...ctx, speech: buildCardPrompt(primaryCard) };
  }
  return ctx;
};

function getLastWordShowCardId(actions: ToolAction[], course: Course): string {
  const wordCardIds = new Set(course.cards.filter((card) => card.kind === 'word').map((card) => card.id));
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    const cardId = action.tool === 'show_card' ? action.params.card_id : '';
    if (wordCardIds.has(cardId)) return cardId;
  }
  return '';
}

function speechMentionsCard(speech: string, card: Course['cards'][number]): boolean {
  const english = card.english.trim();
  const chinese = card.chinese.trim();
  return Boolean(
    (english && new RegExp(`\\b${escapeRegExp(english)}\\b`, 'i').test(speech))
    || (chinese && speech.includes(chinese))
  );
}

export function buildCardPrompt(card: Course['cards'][number]): string {
  return `做得好!我们看这张卡,这是 ${card.chinese} ${card.english}. 跟老师一起说:${card.english}!`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

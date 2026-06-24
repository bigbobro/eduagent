import { Course } from '@/types/course';
import { GuardFn } from './index';

/**
 * Align speech with the card normalizeActions selected (ctx.forceCardId).
 *
 * If the selected word card (forceCardId) is NOT mentioned by the speech while a
 * different word card is, rewrite the speech to introduce the forceCardId card.
 * This prevents the "show_card:bird while TTS says dog" race.
 *
 * Reads ctx.forceCardId, which normalizeActions writes — so it must run after
 * normalizeActions (see guards/index.ts runPipeline comment).
 */
export const speechCardAlign: GuardFn = (ctx) => {
  const { speech, course, memory, forceCardId } = ctx;
  if (!forceCardId) return ctx;

  const primaryCard = course.cards.find((card) => card.id === forceCardId && card.kind === 'word');
  if (!primaryCard) return ctx;

  const mentionsPrimary = speechMentionsCard(speech, primaryCard);
  const mentionedOtherWord = course.cards
    .filter((card) => card.kind === 'word' && card.id !== forceCardId)
    .some((card) => speechMentionsCard(speech, card));
  const movedToDifferentCard = Boolean(memory.currentCardId && memory.currentCardId !== forceCardId);

  if (!mentionsPrimary && (mentionedOtherWord || movedToDifferentCard)) {
    console.warn('[session] speech/show_card mismatch — overriding speech', {
      currentCardId: memory.currentCardId,
      showCardId: forceCardId,
      speech: speech.slice(0, 120),
    });
    return { ...ctx, speech: buildCardPrompt(primaryCard) };
  }
  return ctx;
};

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

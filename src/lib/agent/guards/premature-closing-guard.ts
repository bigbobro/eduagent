import { GuardFn } from './index';

const SOFT_CLOSING_PATTERNS = [
  /下次再来/, /下次再/, /下回见/, /下回再/, /再见小/, /再见小朋友/,
  /今天就到这里/, /今天到这里/, /我们改天/, /改天再/, /明天再/,
  /下次我们再(去)?认识/, /下次再认识/, /我们下次/,
];

/**
 * R-B (2026-05-23): premature-closing guard.
 *
 * When the LLM emits soft-closing phrases ("下次再来" / "今天到这里" / etc.) while
 * word cards still have untouched ones, override with a continuation prompt.
 *
 * The R4/R6 unlearned-word guard only catches enumeration of unlearned words; this
 * catches the "let's wrap up after 2 words" pattern. Only fires in interactive phase
 * — reinforcement/done are legitimate closing windows.
 */
export const prematureClosingGuard: GuardFn = (ctx) => {
  const { speech, course, memory, currentPhase } = ctx;
  if (currentPhase !== 'interactive') return ctx;

  const wordCardIds = course.cards.filter((c) => c.kind === 'word').map((c) => c.id);
  const untouchedExists = wordCardIds.some((id) => memory.cardProgress[id] !== 'cleared');
  if (!untouchedExists) return ctx;

  const matchedPattern = SOFT_CLOSING_PATTERNS.find((re) => re.test(speech));
  if (!matchedPattern) return ctx;

  const untouchedNext = wordCardIds.find((id) => memory.cardProgress[id] !== 'cleared') || '';
  const nextCard = untouchedNext
    ? course.cards.find((c) => c.id === untouchedNext)
    : undefined;
  console.warn('[session] premature-closing guard: matched', matchedPattern.source, '— overriding; nextTarget=', untouchedNext);
  const nextLabel = nextCard ? `${nextCard.chinese} ${nextCard.english}` : '下一个';
  return {
    ...ctx,
    speech: `做得很棒!我们继续来学 ${nextLabel}!`,
    actions: untouchedNext ? [{ tool: 'show_card', params: { card_id: untouchedNext } }] : [],
  };
};

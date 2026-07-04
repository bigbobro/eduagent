import { Course } from '@/types/course';
import { GuardContext, GuardFn } from './index';

// F1 (2026-07-03): deterministic speech for the all-words-cleared tail of interactive.
export const ALL_CLEARED_CELEBRATION = '太棒了!所有单词都完成了!接下来我们玩个游戏!';
export const ALL_CLEARED_WAIT_PRAISE = '说得真棒!我们马上要玩游戏啦!';
export const ALL_CLEARED_WAIT_NEUTRAL = '没关系,我们马上要玩游戏啦,加油!';

/**
 * Align speech with the card normalizeActions selected (ctx.forceCardId).
 *
 * Rewrite conditions (2026-07-03, session 1b096ae7 fixes):
 * - phaseOpening turns are exempt — opening speech legitimately mentions other words (R2).
 * - allWordsCleared + interactive (F1): never rewrite into a word-teaching template
 *   (the n=50/n=51 parrot bug). Clearance turn keeps LLM speech unless it leaks new
 *   teaching content; squeezed-in turns before the phase transition get a fixed bridge.
 * - in-progress mode (R3): mentioning ANY other word card is a violation even when the
 *   current word is also mentioned ("先停一下 skating,换 volleyball" leaked at n=31).
 * - legacy: forceCardId not mentioned while another word card is / card moved.
 *
 * Reads ctx.forceCardId / rcMode / allWordsCleared, which normalizeActions writes — so
 * it must run after normalizeActions (see guards/index.ts runPipeline comment).
 */
export const speechCardAlign: GuardFn = (ctx) => {
  const { speech, course, memory, forceCardId } = ctx;
  if (ctx.phaseOpening) return ctx;

  if (ctx.allWordsCleared && ctx.currentPhase === 'interactive') {
    if (ctx.rcMode === 'just-cleared') {
      // Last word's clearance turn: keep the LLM celebration unless it starts teaching
      // new content (sentence-card english / "学一个短句" phrasing — n=49 leak).
      if (speechLeaksNewTeaching(speech, course)) {
        console.warn('[session] all-cleared speech leaked new teaching — overriding', {
          speech: speech.slice(0, 120),
        });
        return { ...ctx, speech: ALL_CLEARED_CELEBRATION, speechRewrite: 'all-cleared-celebration' };
      }
      return ctx;
    }
    // Squeezed-in student turn before the phase transition lands (n=50): fixed short
    // bridge — never "回到已过关词的教学". Tone follows the child's last result (R4).
    const bridge = assessmentIncorrect(ctx) ? ALL_CLEARED_WAIT_NEUTRAL : ALL_CLEARED_WAIT_PRAISE;
    if (speech === bridge) return ctx;
    console.warn('[session] all-cleared wait turn — overriding speech', {
      rcMode: ctx.rcMode,
      speech: speech.slice(0, 120),
    });
    return { ...ctx, speech: bridge, speechRewrite: 'all-cleared-wait' };
  }

  if (!forceCardId) return ctx;
  const primaryCard = course.cards.find((card) => card.id === forceCardId && card.kind === 'word');
  if (!primaryCard) return ctx;

  // F3: the park decision is server-side — the LLM does not know the card was parked,
  // so its speech this turn still teaches the old word. Deterministic switch speech
  // with a soft hand-off ("先放一放,待会再回来") so the child gets a transition, not a
  // silent card jump. Degenerate retry-in-place (forceCardId === currentCardId) falls
  // through to the generic path — a "switch" template would be wrong there.
  if (ctx.rcMode === 'parked-advance' && memory.currentCardId && memory.currentCardId !== forceCardId) {
    const parkedCard = course.cards.find(
      (card) => card.id === memory.currentCardId && card.kind === 'word',
    );
    const target = buildParkedSwitchPrompt(parkedCard, primaryCard);
    if (speech === target) return ctx;
    console.warn('[session] parked-advance switch — overriding speech', {
      parkedCardId: memory.currentCardId,
      showCardId: forceCardId,
      speech: speech.slice(0, 120),
    });
    return { ...ctx, speech: target, speechRewrite: 'parked-advance-switch' };
  }

  const mentionsPrimary = speechMentionsCard(speech, primaryCard);
  const mentionedOtherWord = course.cards
    .filter((card) => card.kind === 'word' && card.id !== forceCardId)
    .some((card) => speechMentionsCard(speech, card));
  const movedToDifferentCard = Boolean(memory.currentCardId && memory.currentCardId !== forceCardId);
  // R3: in-progress + interactive — any other word-card mention means the LLM is
  // announcing a card switch the server will not perform (n=31 "换 volleyball").
  const inProgressLeak = ctx.rcMode === 'in-progress' && ctx.currentPhase === 'interactive' && mentionedOtherWord;

  if (inProgressLeak || (!mentionsPrimary && (mentionedOtherWord || movedToDifferentCard))) {
    console.warn('[session] speech/show_card mismatch — overriding speech', {
      currentCardId: memory.currentCardId,
      showCardId: forceCardId,
      rcMode: ctx.rcMode,
      speech: speech.slice(0, 120),
    });
    return {
      ...ctx,
      speech: buildCardPrompt(primaryCard, { tone: assessmentIncorrect(ctx) ? 'neutral' : 'praise' }),
      speechRewrite: inProgressLeak ? 'in-progress-leak' : 'card-align',
    };
  }
  return ctx;
};

// R4: no unconditional praise — the rewrite template opener follows the child's result.
function assessmentIncorrect(ctx: GuardContext): boolean {
  const result = ctx.stateUpdate?.attempt_assessment?.result;
  return result === 'close' || result === 'wrong' || result === 'off_topic';
}

// F1 leak detector: sentence-card english mention or new-teaching phrasing.
function speechLeaksNewTeaching(speech: string, course: Course): boolean {
  const sentenceLeak = course.cards.some((card) => {
    if (card.kind !== 'sentence') return false;
    const english = card.english.trim().replace(/[.!?。!?]+$/, '');
    return english !== '' && speech.toLowerCase().includes(english.toLowerCase());
  });
  if (sentenceLeak) return true;
  return /短句|新的?句子|(来|再|要)学|学一个|跟(老师|我)(说|读)/.test(speech);
}

function speechMentionsCard(speech: string, card: Course['cards'][number]): boolean {
  const english = card.english.trim();
  const chinese = card.chinese.trim();
  return Boolean(
    (english && new RegExp(`\\b${escapeRegExp(english)}\\b`, 'i').test(speech))
    || (chinese && speech.includes(chinese))
  );
}

// F3: park-switch turn speech — soft hand-off away from the parked card into the next one.
export function buildParkedSwitchPrompt(
  parkedCard: Course['cards'][number] | undefined,
  nextCard: Course['cards'][number],
): string {
  const softPark = parkedCard
    ? `${parkedCard.chinese}我们先放一放,待会再回来试!`
    : '这个词我们先放一放,待会再回来试!';
  return `没关系,${softPark}现在看这张卡:${nextCard.chinese} ${nextCard.english}!跟老师一起说:${nextCard.english}!`;
}

export function buildCardPrompt(
  card: Course['cards'][number],
  opts: { tone: 'praise' | 'neutral' } = { tone: 'praise' },
): string {
  // R4: neutral opener after an incorrect attempt — never "做得好!" when the child was wrong.
  if (opts.tone === 'neutral') {
    return `没关系,看这张卡!这是 ${card.chinese} ${card.english}. 跟老师一起说:${card.english}!`;
  }
  return `做得好!我们看这张卡,这是 ${card.chinese} ${card.english}. 跟老师一起说:${card.english}!`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

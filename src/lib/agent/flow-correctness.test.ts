/**
 * 流程正确性回归 (2026-07-03, session 1b096ae7 sports 真人课):
 * - n=31: in-progress 换词宣告泄漏("先停一下 skating,换 volleyball")必须被确定性改写。
 * - n=49: 最后一个词过关轮不得教句子(sentence_soccer 拒卡告警不再出现)。
 * - n=50: 转场前挤入的学生轮不得回到已过关词的教学模板。
 * - n=51: reinforcement 开场白(phaseOpening)不被 speechCardAlign 改写。
 * - F3 逃生阀: 连续 5 失败 park + 推进 / 队列尾回头 retry / retry 失败不阻塞转场 / 命中清零 streak。
 * 全部使用 sports 课程真实数据(fake transport,不依赖豆包/LLM)。
 */
import { describe, expect, it, vi } from 'vitest';
import { sportsCourse } from '@/data/courses/sports';
import { LessonMemory, CardProgressState } from '@/types/session';
import { AgentResponse } from '@/types/tools';
import {
  createMemory,
  initializeCardProgress,
  commitAssistantStreamResult,
  normalizeAssistantActions,
  allWordsFinished,
  NormalizeActionsMeta,
  PARK_STREAK_THRESHOLD,
} from './memory';
import { GuardContext, runPipeline } from './guards/index';
import { normalizeActions } from './guards/normalize-actions';
import {
  speechCardAlign,
  buildCardPrompt,
  buildParkedSwitchPrompt,
  ALL_CLEARED_CELEBRATION,
  ALL_CLEARED_WAIT_PRAISE,
} from './guards/speech-card-align';

const WORD_ORDER = sportsCourse.teachingHints.newCardIds; // soccer … skating, volleyball, badminton
const skatingCard = sportsCourse.cards.find((c) => c.id === 'skating')!;

function sportsMemory(overrides: Partial<LessonMemory> = {}): LessonMemory {
  return { ...initializeCardProgress(createMemory(), sportsCourse), ...overrides };
}

function progressWithCleared(clearedIds: string[], extra: Record<string, CardProgressState> = {}): Record<string, CardProgressState> {
  const progress = { ...initializeCardProgress(createMemory(), sportsCourse).cardProgress };
  for (const id of clearedIds) progress[id] = 'cleared';
  return { ...progress, ...extra };
}

function runGuards(ctx: GuardContext): GuardContext {
  // 生产 pipeline 里 normalizeActions 必须先于 speechCardAlign(见 guards/index.ts)。
  return runPipeline(ctx, [normalizeActions, speechCardAlign]);
}

const wrongAttempt = (cardId: string): AgentResponse['state_update'] => ({
  current_word: cardId,
  attempt_assessment: { card_id: cardId, result: 'wrong', should_advance: false, evidence: 'mismatch' },
});
const correctAttempt = (cardId: string): AgentResponse['state_update'] => ({
  current_word: cardId,
  attempt_assessment: { card_id: cardId, result: 'correct', should_advance: true, evidence: 'heard it' },
});

describe('n=31 regression: in-progress 换词宣告必须被确定性改写 (R3)', () => {
  it('rewrites "先停一下 skating,换 volleyball" even though the current word is mentioned', () => {
    const cleared = WORD_ORDER.slice(0, 9); // soccer..dancing
    const memory = sportsMemory({
      currentCardId: 'skating',
      cardProgress: progressWithCleared(cleared, { skating: 'attempted' }),
      clearedCardIds: cleared,
      cardAttemptStreak: { skating: 2 },
    });
    const ctx: GuardContext = {
      speech: '好,我们先停一下 skating,换一个词!看这张卡片:volleyball!',
      actions: [{ tool: 'show_card', params: { card_id: 'volleyball' } }],
      stateUpdate: wrongAttempt('skating'),
      memory,
      course: sportsCourse,
      asrText: 'Stating.',
      currentPhase: 'interactive',
    };

    const result = runGuards(ctx);

    // 画面死守 skating(R-C mode 2),volleyball 拒卡并计入埋点。
    expect(result.actions).toEqual([{ tool: 'show_card', params: { card_id: 'skating' } }]);
    expect(result.rcMode).toBe('in-progress');
    expect(result.rcRejectedCardIds).toContain('volleyball');
    // 话术被改写为留在当前词;孩子答错 → 中性开头,不说"做得好"。
    expect(result.speech).toBe(buildCardPrompt(skatingCard, { tone: 'neutral' }));
    expect(result.speech).not.toContain('volleyball');
    expect(result.speech.startsWith('做得好')).toBe(false);
    expect(result.speechRewrite).toBe('in-progress-leak');
  });
});

describe('n=49 regression: 最后一个词过关轮收尾,不教句子 (R1)', () => {
  function lastWordClearingCtx(): GuardContext {
    const cleared = WORD_ORDER.filter((id) => id !== 'badminton');
    const memory = sportsMemory({
      currentCardId: 'badminton',
      cardProgress: progressWithCleared(cleared, { badminton: 'attempted' }),
      clearedCardIds: cleared,
      cardCorrectCount: { badminton: 1 },
    });
    return {
      speech: '哇!badminton 说得真好!接下来我们学一个短句:I can play soccer. 跟我说一遍!',
      actions: [
        { tool: 'show_card', params: { card_id: 'badminton' } },
        { tool: 'show_card', params: { card_id: 'sentence_soccer' } },
      ],
      stateUpdate: correctAttempt('badminton'),
      memory,
      course: sportsCourse,
      asrText: 'Badminton.',
      currentPhase: 'interactive',
    };
  }

  it('suppresses sentence_soccer without an R-C reject warn, and stays on badminton', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const result = runGuards(lastWordClearingCtx());
    const rejectWarns = warnSpy.mock.calls.filter((args) => String(args[0]).includes('rejected by R-C'));
    warnSpy.mockRestore();

    expect(rejectWarns).toHaveLength(0); // n=49 的拒卡告警刷屏不再出现
    expect(result.actions).toEqual([{ tool: 'show_card', params: { card_id: 'badminton' } }]);
    expect(result.rcMode).toBe('just-cleared');
    expect(result.allWordsCleared).toBe(true);
    expect(result.rcSuppressedCardIds).toContain('sentence_soccer'); // R6 埋点仍可见
  });

  it('rewrites the sentence-teaching leak into the closing celebration', () => {
    const result = runGuards(lastWordClearingCtx());
    expect(result.speech).toBe(ALL_CLEARED_CELEBRATION);
    expect(result.speech).not.toContain('I can play soccer');
    expect(result.speechRewrite).toBe('all-cleared-celebration');
  });

  it('keeps a clean LLM celebration speech untouched (no leak → no rewrite)', () => {
    const ctx = lastWordClearingCtx();
    ctx.speech = '哇,badminton 也通过啦!今天的单词全部完成,你真厉害!';
    const result = runGuards(ctx);
    expect(result.speech).toBe(ctx.speech);
  });
});

describe('n=50 regression: 转场前挤入的学生轮不回退教学 (R1)', () => {
  it('answers a squeezed-in student turn with the fixed bridge, not the badminton template', () => {
    const memory = sportsMemory({
      currentCardId: 'badminton',
      cardProgress: progressWithCleared(WORD_ORDER),
      clearedCardIds: [...WORD_ORDER],
      cardCorrectCount: { badminton: 2 },
    });
    const ctx: GuardContext = {
      // LLM 已跑偏:回到已过关词的教学话术(真实 n=50 就是这句复读)。
      speech: '做得好!我们看这张卡,这是 羽毛球 badminton. 跟老师一起说:badminton!',
      actions: [{ tool: 'show_card', params: { card_id: 'badminton' } }],
      stateUpdate: correctAttempt('badminton'),
      memory,
      course: sportsCourse,
      asrText: 'I can play soccer.',
      currentPhase: 'interactive',
    };

    const result = runGuards(ctx);

    expect(result.rcMode).toBe('post-clear-recovery');
    expect(result.allWordsCleared).toBe(true);
    expect(result.speech).toBe(ALL_CLEARED_WAIT_PRAISE);
    expect(result.speech).not.toContain('badminton');
    expect(result.speechRewrite).toBe('all-cleared-wait');

    // 该轮 commit 不产生任何进度回退/新计数(badminton 已 cleared 锁定)。
    const next = commitAssistantStreamResult(
      memory, sportsCourse, result.speech, result.actions, ctx.stateUpdate, ctx.asrText,
    );
    expect(next.currentCardId).toBe('badminton');
    expect(next.cardProgress).toEqual(memory.cardProgress);
    expect(next.cardCorrectCount.badminton).toBe(2);
  });
});

describe('n=51 regression: phase-opening 豁免 (R2)', () => {
  it('does not rewrite the reinforcement opening even though it mentions other words', () => {
    const memory = sportsMemory({
      currentCardId: 'badminton',
      cardProgress: progressWithCleared(WORD_ORDER),
      clearedCardIds: [...WORD_ORDER],
    });
    const opening = '接下来我们玩个游戏!找一找,Where is soccer?';
    const ctx: GuardContext = {
      speech: opening,
      actions: [],
      stateUpdate: {},
      memory,
      course: sportsCourse,
      asrText: '', // system turn
      currentPhase: 'reinforcement',
      phaseOpening: true,
    };

    const result = runGuards(ctx);

    expect(result.speech).toBe(opening);
    expect(result.speechRewrite).toBeUndefined();
  });
});

describe('F3 逃生阀 (R5)', () => {
  it(`parks the card after ${PARK_STREAK_THRESHOLD} consecutive failures and advances to the next word`, () => {
    const cleared = WORD_ORDER.slice(0, 9);
    let memory = sportsMemory({
      currentCardId: 'skating',
      cardProgress: progressWithCleared(cleared, { skating: 'attempted' }),
      clearedCardIds: cleared,
    });
    for (let i = 0; i < PARK_STREAK_THRESHOLD - 1; i++) {
      memory = commitAssistantStreamResult(
        memory, sportsCourse, '再试一次', [{ tool: 'show_card', params: { card_id: 'skating' } }],
        wrongAttempt('skating'), 'Stating.',
      );
    }
    expect(memory.parkedCardIds).toEqual([]);
    expect(memory.cardAttemptStreak.skating).toBe(PARK_STREAK_THRESHOLD - 1);

    // 第 5 次失败的那一轮:normalize 直接推进到 volleyball,不再死守 skating。
    const response: AgentResponse = {
      speech: '再来一次!',
      actions: [{ tool: 'show_card', params: { card_id: 'skating' } }],
      state_update: wrongAttempt('skating'),
    };
    const meta: NormalizeActionsMeta = {};
    const actions = normalizeAssistantActions(memory, sportsCourse, response, 'Stating.', meta);
    expect(meta.mode).toBe('parked-advance');
    expect(actions).toEqual([{ tool: 'show_card', params: { card_id: 'volleyball' } }]);

    // commit 后:skating parked + needs_review,currentCardId 已切到 volleyball。
    memory = commitAssistantStreamResult(memory, sportsCourse, '换一张卡', actions, response.state_update, 'Stating.');
    expect(memory.parkedCardIds).toContain('skating');
    expect(memory.cardProgress.skating).toBe('needs_review');
    expect(memory.currentCardId).toBe('volleyball');
    expect(allWordsFinished(memory, sportsCourse)).toBe(false);
  });

  it('park 切换轮话术带柔性交代:先放一放 + 引出新卡,不静默跳卡', () => {
    const cleared = WORD_ORDER.slice(0, 9);
    const memory = sportsMemory({
      currentCardId: 'skating',
      cardProgress: progressWithCleared(cleared, { skating: 'attempted' }),
      clearedCardIds: cleared,
      cardAttemptStreak: { skating: PARK_STREAK_THRESHOLD },
      parkedCardIds: ['skating'],
    });
    const ctx: GuardContext = {
      // LLM 不知道 park 已发生,话术仍在教 skating。
      speech: '没关系,我们再来一次:sk——at——ing!',
      actions: [{ tool: 'show_card', params: { card_id: 'skating' } }],
      stateUpdate: wrongAttempt('skating'),
      memory,
      course: sportsCourse,
      asrText: 'Stating.',
      currentPhase: 'interactive',
    };

    const result = runGuards(ctx);

    expect(result.rcMode).toBe('parked-advance');
    expect(result.actions).toEqual([{ tool: 'show_card', params: { card_id: 'volleyball' } }]);
    const volleyballCard = sportsCourse.cards.find((c) => c.id === 'volleyball')!;
    expect(result.speech).toBe(buildParkedSwitchPrompt(skatingCard, volleyballCard));
    // 旧词有交代("先放一放"),新卡有引出,不以"做得好"开头。
    expect(result.speech).toContain('先放一放');
    expect(result.speech).toContain('volleyball');
    expect(result.speech.startsWith('做得好')).toBe(false);
    expect(result.speechRewrite).toBe('parked-advance-switch');
  });

  it('comes back to the parked word after the queue is exhausted (retry round)', () => {
    const cleared = WORD_ORDER.filter((id) => id !== 'skating' && id !== 'badminton');
    let memory = sportsMemory({
      currentCardId: 'badminton',
      cardProgress: progressWithCleared(cleared, { skating: 'needs_review', badminton: 'attempted' }),
      clearedCardIds: cleared,
      cardCorrectCount: { badminton: 1 },
      cardAttemptStreak: { skating: PARK_STREAK_THRESHOLD },
      parkedCardIds: ['skating'],
    });

    // badminton 第 2 次命中过关 → 下一张不是终态,而是回头 retry skating。
    const response: AgentResponse = {
      speech: '好棒!badminton 通过!',
      actions: [{ tool: 'show_card', params: { card_id: 'badminton' } }],
      state_update: correctAttempt('badminton'),
    };
    const meta: NormalizeActionsMeta = {};
    const actions = normalizeAssistantActions(memory, sportsCourse, response, 'Badminton.', meta);
    expect(meta.mode).toBe('just-cleared');
    expect(meta.allWordsCleared).toBe(false);
    expect(actions[actions.length - 1]).toEqual({ tool: 'show_card', params: { card_id: 'skating' } });

    memory = commitAssistantStreamResult(memory, sportsCourse, '我们回头再试试 skating!', actions, response.state_update, 'Badminton.');
    expect(memory.currentCardId).toBe('skating');
    expect(memory.parkRetryCardIds).toContain('skating');
    expect(memory.cardAttemptStreak.skating).toBe(0); // retry 轮有新的尝试窗口
    expect(allWordsFinished(memory, sportsCourse)).toBe(false); // retry 进行中,不 arm 转场
  });

  it('a failed retry does not block the phase transition (parked-after-retry counts as done)', () => {
    const cleared = WORD_ORDER.filter((id) => id !== 'skating');
    let memory = sportsMemory({
      currentCardId: 'skating',
      cardProgress: progressWithCleared(cleared, { skating: 'needs_review' }),
      clearedCardIds: cleared,
      parkedCardIds: ['skating'],
      parkRetryCardIds: ['skating'],
      cardAttemptStreak: { skating: 0 },
    });

    // retry 轮再失败一次 → 队列终态。
    memory = commitAssistantStreamResult(
      memory, sportsCourse, '没关系', [{ tool: 'show_card', params: { card_id: 'skating' } }],
      wrongAttempt('skating'), 'Stating.',
    );
    expect(memory.cardAttemptStreak.skating).toBe(1);
    expect(allWordsFinished(memory, sportsCourse)).toBe(true);

    // 之后的轮次进入 all-cleared 终态:画面停在 skating,不再无限卡死。
    const meta: NormalizeActionsMeta = {};
    const actions = normalizeAssistantActions(memory, sportsCourse, {
      speech: '加油!',
      actions: [],
      state_update: {},
    }, '', meta);
    expect(meta.allWordsCleared).toBe(true);
    expect(actions).toEqual([{ tool: 'show_card', params: { card_id: 'skating' } }]);
  });

  it('a successful retry clears the parked card normally (2 hits)', () => {
    const cleared = WORD_ORDER.filter((id) => id !== 'skating');
    let memory = sportsMemory({
      currentCardId: 'skating',
      cardProgress: progressWithCleared(cleared, { skating: 'needs_review' }),
      clearedCardIds: cleared,
      parkedCardIds: ['skating'],
      parkRetryCardIds: ['skating'],
      cardAttemptStreak: { skating: 0 },
    });
    for (let i = 0; i < 2; i++) {
      memory = commitAssistantStreamResult(
        memory, sportsCourse, '很好!', [{ tool: 'show_card', params: { card_id: 'skating' } }],
        correctAttempt('skating'), 'Skating.',
      );
    }
    expect(memory.cardProgress.skating).toBe('cleared');
    expect(allWordsFinished(memory, sportsCourse)).toBe(true);
  });

  it('an R2 hit resets the fail streak — no park after a mid-run success', () => {
    const cleared = WORD_ORDER.slice(0, 9);
    let memory = sportsMemory({
      currentCardId: 'skating',
      cardProgress: progressWithCleared(cleared, { skating: 'attempted' }),
      clearedCardIds: cleared,
      cardAttemptStreak: { skating: PARK_STREAK_THRESHOLD - 1 },
    });
    memory = commitAssistantStreamResult(
      memory, sportsCourse, '对啦!', [{ tool: 'show_card', params: { card_id: 'skating' } }],
      correctAttempt('skating'), 'Skating.',
    );
    expect(memory.cardAttemptStreak.skating).toBe(0);
    expect(memory.parkedCardIds).toEqual([]);
    // 命中后再失败,从 0 重新累计,不会立刻 park。
    memory = commitAssistantStreamResult(
      memory, sportsCourse, '再试一次', [{ tool: 'show_card', params: { card_id: 'skating' } }],
      wrongAttempt('skating'), 'Stating.',
    );
    expect(memory.parkedCardIds).toEqual([]);
    expect(memory.currentCardId).toBe('skating');
  });
});

describe('红线背书: sentence 卡不得改写 currentCardId (2026-07-02 保护)', () => {
  it('sports: trailing sentence_soccer show_card does not hijack currentCardId', () => {
    let memory = sportsMemory({ currentCardId: 'soccer' });
    memory = commitAssistantStreamResult(
      memory,
      sportsCourse,
      'This is soccer! I can play soccer.',
      [
        { tool: 'show_card', params: { card_id: 'soccer' } },
        { tool: 'show_card', params: { card_id: 'sentence_soccer' } },
      ],
      { current_word: 'soccer' },
      'Soccer.',
    );
    expect(memory.currentCardId).toBe('soccer'); // 不能变成 sentence_soccer
    expect(memory.cardCorrectCount.soccer).toBe(1); // R2 计数继续
  });
});

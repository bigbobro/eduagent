/**
 * Regression: clicking "请老师再说" (a teacher-initiated system turn) must NOT advance the word.
 *
 * The repeat message text names the current card (e.g. "apple"). Before the fix, session.ts fed
 * userText in as the child's raw ASR transcript, so the R2 literal-hit counter saw "apple",
 * credited a hit, and a card sitting at count=1 jumped to 'cleared' → skipped to the next word.
 * The fix threads rawAsrText separately; system turns pass '' so they never count an R2 hit.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, endSession, streamUserInput } from './session';
import type { StreamEvent } from '@/lib/mimo/llm';

vi.mock('@/lib/mimo/llm', () => ({ streamLLM: vi.fn() }));
import { streamLLM } from '@/lib/mimo/llm';
const mockStreamLLM = vi.mocked(streamLLM);

async function* llm(speech: string, actions: any[] = [], stateUpdate: any = {}): AsyncGenerator<StreamEvent> {
  const json = JSON.stringify({ speech, actions, state_update: stateUpdate });
  yield { delta: json, done: false } as StreamEvent;
  yield { done: true, fullText: json, usage: { inputTokens: 50, outputTokens: 20 }, latency: 100 } as StreamEvent;
}

const REPEAT_TEXT =
  '(孩子刚刚没听清,请重新介绍当前卡片 apple: apple / 苹果) 必须先 show_card 当前卡片,不要切换到其它卡。';

function seedAppleAtCountOne() {
  const session = createSession(foodCourse);
  session.memory.currentCardId = 'apple';
  session.memory.currentWord = 'apple';
  session.memory.cardProgress = { ...session.memory.cardProgress, apple: 'attempted' };
  session.memory.cardCorrectCount = { ...session.memory.cardCorrectCount, apple: 1 };
  return session;
}

describe('请老师再说 does not skip the word', () => {
  beforeEach(() => vi.clearAllMocks());

  it('system repeat turn (rawAsrText="") keeps the card and does NOT clear/advance', async () => {
    const session = seedAppleAtCountOne();
    mockStreamLLM.mockReturnValue(llm('我们再看看 apple', [{ tool: 'show_card', params: { card_id: 'apple' } }], { current_word: 'apple' }));

    let shownCard = '';
    // Same call route.ts makes for a `system: true` message: 5th arg rawAsrText = ''.
    for await (const ev of streamUserInput(session.id, REPEAT_TEXT, undefined, undefined, '')) {
      if (ev.type === 'actions') {
        const sc = ev.actions.find((a) => a.tool === 'show_card');
        if (sc) shownCard = sc.params.card_id as string;
      }
    }

    expect(shownCard).toBe('apple');
    expect(session.memory.cardProgress.apple).not.toBe('cleared');
    expect(session.memory.cardCorrectCount.apple).toBe(1);
    expect(session.memory.currentCardId).toBe('apple');
    endSession(session.id);
  });

  it('real child utterance (default rawAsrText) still counts the R2 hit and advances', async () => {
    const session = seedAppleAtCountOne();
    mockStreamLLM.mockReturnValue(llm('Apple! 真棒', [{ tool: 'show_card', params: { card_id: 'apple' } }], { current_word: 'apple' }));

    let shownCard = '';
    // Real utterance: rawAsrText defaults to userText ('apple') → R2 hit → 2nd hit clears + advances.
    for await (const ev of streamUserInput(session.id, 'apple')) {
      if (ev.type === 'actions') {
        const sc = ev.actions.find((a) => a.tool === 'show_card');
        if (sc) shownCard = sc.params.card_id as string;
      }
    }

    expect(session.memory.cardProgress.apple).toBe('cleared');
    expect(shownCard).toBe('banana');
    endSession(session.id);
  });
});

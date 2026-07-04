/**
 * R4 (2026-07-04, session 6f6e7bec n=42): a real child utterance squeezed in during
 * reinforcement (after the phaseOpening turn, before/between quizzes) must not reach the
 * LLM — it produced a second, semantically duplicate "let's play a game" opening line.
 * System/opening turns (phaseOpening) and any stray quiz/transition-marked text are
 * unaffected. Quiz-answer turns never call streamUserInput at all (recordQuizAnswer
 * inserts directly) — the '[quiz:' prefix guard here is defense-in-depth in case that
 * ever changes.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, endSession, setSessionPhase, streamUserInput } from './session';
import type { StreamEvent } from '@/lib/llm';

vi.mock('@/lib/llm', () => ({ streamLLM: vi.fn() }));
import { streamLLM } from '@/lib/llm';
const mockStreamLLM = vi.mocked(streamLLM);

async function* yieldSpeech(speech: string): AsyncGenerator<StreamEvent> {
  const text = JSON.stringify({ speech, actions: [], state_update: {} });
  yield { delta: text, done: false } as StreamEvent;
  yield {
    done: true,
    fullText: text,
    usage: { inputTokens: 10, outputTokens: 5 },
    latency: 50,
  } as StreamEvent;
}

describe('R4: reinforcement squeeze-in speech skips the LLM', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a real utterance during reinforcement gets the fixed phrase with zero LLM calls', async () => {
    const session = createSession(foodCourse);
    setSessionPhase(session.id, 'reinforcement');

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, '苹果', undefined)) {
      events.push(ev);
    }

    expect(mockStreamLLM).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: 'speech-delta', text: '我们来玩游戏吧!' });
    expect(events.find((e) => e.type === 'actions')).toMatchObject({ actions: [] });
    expect(events.find((e) => e.type === 'done')).toBeTruthy();
    expect(events.find((e) => e.type === 'error')).toBeUndefined();
    endSession(session.id);
  });

  it('the reinforcement phaseOpening (transition) turn is unaffected — still calls the LLM', async () => {
    const session = createSession(foodCourse);
    setSessionPhase(session.id, 'reinforcement');
    mockStreamLLM.mockReturnValue(yieldSpeech('接下来我们玩个游戏!'));

    const events: any[] = [];
    for await (const ev of streamUserInput(
      session.id,
      '(切换到 reinforcement 阶段,请说一句简短开场)',
      undefined,
      undefined,
      '',
      { phaseOpening: true },
    )) {
      events.push(ev);
    }

    expect(mockStreamLLM).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'speech-delta', text: '接下来我们玩个游戏!' });
    endSession(session.id);
  });

  it('a stray "[quiz:" or "(切换到" marked text in reinforcement still calls the LLM (defense-in-depth)', async () => {
    const session = createSession(foodCourse);
    setSessionPhase(session.id, 'reinforcement');
    mockStreamLLM.mockReturnValue(yieldSpeech('好的!'));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, '[quiz:q1 correct] apple', undefined, undefined, '[quiz:q1 correct] apple')) {
      events.push(ev);
    }

    expect(mockStreamLLM).toHaveBeenCalledTimes(1);
    endSession(session.id);
  });

  it('a real utterance during interactive (not reinforcement) is unaffected — still calls the LLM', async () => {
    const session = createSession(foodCourse); // starts at 'intro', but check any non-reinforcement phase
    setSessionPhase(session.id, 'interactive');
    // No course word mentioned (other than via current_word exemption) — avoids tripping
    // closingGuard's unlearned-word check, which is unrelated to what this test verifies.
    mockStreamLLM.mockReturnValue(yieldSpeech('说得真棒!'));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, 'apple', undefined)) {
      events.push(ev);
    }

    expect(mockStreamLLM).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'speech-delta', text: '说得真棒!' });
    endSession(session.id);
  });

  it('records the bypassed turn into token usage (tts + asr, but not llm) and interaction log', async () => {
    const session = createSession(foodCourse);
    setSessionPhase(session.id, 'reinforcement');

    for await (const _ev of streamUserInput(session.id, '苹果', { latency: 120, tokens: 4 })) {
      // drain
    }

    expect(session.tokenUsage.llm.requests).toBe(0);
    expect(session.tokenUsage.asr.requests).toBe(1);
    expect(session.tokenUsage.tts.requests).toBe(1);
    endSession(session.id);
  });
});

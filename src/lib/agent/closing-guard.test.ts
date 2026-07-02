/**
 * R4: closing guard — server-side override of LLM speech that mentions unlearned target words.
 *
 * We test the guard by mocking streamLLM to return a specific JSON response that
 * includes unlearned words, then asserting that the final SSE actions event carries
 * the overridden safe speech.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { animalsCourse } from '@/data/courses/animals';
import { foodCourse } from '@/data/courses/food';
import { createSession, endSession, streamUserInput } from './session';
import type { StreamEvent } from '@/lib/llm';

// Override streamLLM with a controllable mock
vi.mock('@/lib/llm', () => ({
  streamLLM: vi.fn(),
}));

import { streamLLM } from '@/lib/llm';
const mockStreamLLM = vi.mocked(streamLLM);

async function* asyncMakeStreamEvents(speech: string, actions: any[] = [], stateUpdate: any = {}): AsyncGenerator<StreamEvent> {
  const json = JSON.stringify({ speech, actions, state_update: stateUpdate });
  const chunkSize = 8;
  for (let i = 0; i < json.length; i += chunkSize) {
    yield { delta: json.slice(i, i + chunkSize), done: false } as StreamEvent;
  }
  yield {
    done: true,
    fullText: json,
    usage: { inputTokens: 50, outputTokens: 20 },
    latency: 100,
  } as StreamEvent;
}

describe('R4: closing guard in streamUserInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT override speech when all mentioned target words have been learned', async () => {
    const session = createSession(foodCourse);
    // Mark apple as learned
    session.memory.wordsLearned = ['apple'];
    // LLM speech only mentions apple (which is learned)
    mockStreamLLM.mockReturnValue(asyncMakeStreamEvents(
      '今天你练了 apple,说得很棒！',
      [],
      { current_word: 'apple', phase: 'learning' }
    ));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, 'apple')) {
      events.push(ev);
    }

    const actionsEv = events.find((e) => e.type === 'actions');
    // Check that the session memory speech is unchanged (no override)
    const lastInteraction = session.memory.messages[session.memory.messages.length - 1];
    expect(lastInteraction.content).toContain('apple');
    expect(lastInteraction.content).not.toContain('下次再来玩吧');
    endSession(session.id);
  });

  it('overrides speech with safe template when LLM mentions unlearned target words', async () => {
    const session = createSession(foodCourse);
    // No words learned this session
    session.memory.wordsLearned = [];
    // LLM hallucinates — claims we learned apple, banana, milk (none are in wordsLearned)
    mockStreamLLM.mockReturnValue(asyncMakeStreamEvents(
      '今天我们在魔法小院认识了好多食物，有 apple、banana 和 milk！你说得很棒！',
      [],
      { current_word: '', phase: 'closing' }
    ));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, '(结束)')) {
      events.push(ev);
    }

    // The committed speech in memory should be the safe template
    const lastInteraction = session.memory.messages[session.memory.messages.length - 1];
    expect(lastInteraction.content).toContain('下次再来玩吧');
    expect(lastInteraction.content).not.toContain('apple');
    expect(lastInteraction.content).not.toContain('banana');
    endSession(session.id);
  });

  it('R6 AC3/AC9: does NOT override when speech mentions currentWord being taught (not yet learned)', async () => {
    const session = createSession(foodCourse);
    // We are currently teaching apple; apple is not yet in wordsLearned
    session.memory.wordsLearned = [];
    session.memory.currentWord = 'apple';
    session.memory.currentCardId = 'apple';
    // LLM speech mentions apple (the active teaching word) — should NOT trigger override
    mockStreamLLM.mockReturnValue(asyncMakeStreamEvents(
      '我们一起说 apple,跟我读 apple。',
      [{ tool: 'show_card', params: { card_id: 'apple' } }],
      { current_word: 'apple', phase: 'learning' }
    ));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, 'apple')) {
      events.push(ev);
    }

    const lastInteraction = session.memory.messages[session.memory.messages.length - 1];
    // speech should still contain apple (not replaced)
    expect(lastInteraction.content).toContain('apple');
    expect(lastInteraction.content).not.toContain('下次再来玩吧');
    endSession(session.id);
  });

  it('R6 AC10: overrides when speech mentions currentWord AND a different unlearned word', async () => {
    const session = createSession(foodCourse);
    session.memory.wordsLearned = [];
    session.memory.currentWord = 'apple';
    session.memory.currentCardId = 'apple';
    // LLM mentions apple (current, exempt) AND banana (unlearned, not current) → still override
    mockStreamLLM.mockReturnValue(asyncMakeStreamEvents(
      '我们说 apple,还有 banana 等着我们。',
      [],
      { current_word: 'apple', phase: 'closing' }
    ));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, '(结束)')) {
      events.push(ev);
    }

    const lastInteraction = session.memory.messages[session.memory.messages.length - 1];
    expect(lastInteraction.content).toContain('下次再来玩吧');
    expect(lastInteraction.content).not.toContain('banana');
    endSession(session.id);
  });

  it('overrides speech when LLM mentions only some unlearned words', async () => {
    const session = createSession(foodCourse);
    // apple is learned, but banana is not
    session.memory.wordsLearned = ['apple'];
    mockStreamLLM.mockReturnValue(asyncMakeStreamEvents(
      '你学了 apple 和 banana，真厉害！',
      [],
      { current_word: 'apple', phase: 'closing' }
    ));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, '(结束)')) {
      events.push(ev);
    }

    const lastInteraction = session.memory.messages[session.memory.messages.length - 1];
    // banana is unlearned so the whole speech should be replaced
    expect(lastInteraction.content).toContain('下次再来玩吧');
    expect(lastInteraction.content).toContain('apple');   // learned word appears in template
    expect(lastInteraction.content).not.toContain('banana');
    endSession(session.id);
  });

  it('does not stream the unsafe speech before server-side guards run', async () => {
    const session = createSession(foodCourse);
    session.memory.wordsLearned = [];
    mockStreamLLM.mockReturnValue(asyncMakeStreamEvents(
      '今天我们学了 apple 和 banana，下次再来玩吧！',
      [],
      { current_word: 'apple', phase: 'closing' }
    ));

    const speech = [];
    for await (const ev of streamUserInput(session.id, '(结束)')) {
      if (ev.type === 'speech-delta') speech.push(ev.text);
    }

    const spoken = speech.join('');
    expect(spoken).toContain('下次再来玩吧');
    expect(spoken).not.toContain('banana');
    endSession(session.id);
  });

  it('overrides speech when normalized show_card advances to a different word card', async () => {
    const session = createSession(animalsCourse);
    session.currentPhase = 'interactive';
    session.memory.currentCardId = 'dog';
    session.memory.currentWord = 'dog';
    session.memory.cardProgress.cat = 'cleared';
    session.memory.cardProgress.dog = 'attempted';
    session.memory.clearedCardIds = ['cat'];
    session.memory.cardCorrectCount = { cat: 2, dog: 1 };
    session.memory.wordsLearned = ['cat'];
    mockStreamLLM.mockReturnValue(asyncMakeStreamEvents(
      '做得好！Dog！你读得真好听！再跟老师说一次，dog！',
      [],
      { current_word: 'dog', phase: 'learning' }
    ));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, 'Dog.')) {
      events.push(ev);
    }

    const spoken = events.filter((ev) => ev.type === 'speech-delta').map((ev) => ev.text).join('');
    const actions = events.find((ev) => ev.type === 'actions')?.actions;
    expect(actions).toContainEqual({ tool: 'show_card', params: { card_id: 'bird' } });
    expect(spoken).toContain('bird');
    expect(spoken).not.toContain('再跟老师说一次，dog');
    expect(session.memory.currentCardId).toBe('bird');
    endSession(session.id);
  });
});

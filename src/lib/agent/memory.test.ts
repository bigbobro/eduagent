import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import {
  createMemory,
  getMessagesForLLM,
  initializeCardProgress,
  commitAssistantStreamResult,
  markWordCorrect,
  markWordIncorrect,
  normalizeAssistantActions,
} from './memory';

describe('word performance updates', () => {
  it('tracks correct and incorrect attempts without double-counting assistant turns', () => {
    let memory = createMemory();

    memory = markWordIncorrect(memory, 'airplane');
    memory = markWordIncorrect(memory, 'airplane');
    memory = markWordCorrect(memory, 'airplane');

    expect(memory.wordPerformance.get('airplane')).toMatchObject({
      attempts: 3,
      correct: 1,
    });
    expect(memory.wordsLearned).toContain('airplane');
    expect(memory.wordsToReview).toContain('airplane');
  });
});

describe('card progress updates', () => {
  it('initializes every course card as untouched', () => {
    const memory = initializeCardProgress(createMemory(), foodCourse);

    expect(memory.cardProgress.apple).toBe('untouched');
    expect(memory.cardProgress.rice).toBe('untouched');
  });

  it('uses show_card as the current card source of truth and marks attempted', () => {
    const memory = initializeCardProgress(createMemory(), foodCourse);

    const next = commitAssistantStreamResult(
      memory,
      'Look, apple!',
      [{ tool: 'show_card', params: { card_id: 'apple' } }],
      { current_word: 'apple', phase: 'learning' }
    );

    expect(next.currentCardId).toBe('apple');
    expect(next.cardProgress.apple).toBe('attempted');
  });

  it('marks the current card cleared from a correct assessment', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };

    const next = commitAssistantStreamResult(memory, 'Great!', [], {
      current_word: 'apple',
      phase: 'learning',
      attempt_assessment: {
        card_id: 'apple',
        result: 'correct',
        should_advance: true,
        evidence: 'ASR was close enough to apple',
      },
    });

    expect(next.cardProgress.apple).toBe('cleared');
    expect(next.clearedCardIds).toContain('apple');
    expect(next.wordsLearned).toContain('apple');
  });

  it('applies assessment to the previous current card before syncing a new show_card action', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };

    const next = commitAssistantStreamResult(
      memory,
      'Great, now look at milk.',
      [{ tool: 'show_card', params: { card_id: 'milk' } }],
      {
        current_word: 'apple',
        phase: 'learning',
        attempt_assessment: {
          card_id: 'apple',
          result: 'correct',
          should_advance: true,
          evidence: 'The student said apple.',
        },
      }
    );

    expect(next.cardProgress.apple).toBe('cleared');
    expect(next.currentCardId).toBe('milk');
    expect(next.cardProgress.milk).toBe('attempted');
  });

  it('normalizes a cleared-card show_card to the next active word', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'egg',
      cardProgress: {
        ...initializeCardProgress(createMemory(), foodCourse).cardProgress,
        apple: 'cleared' as const,
        banana: 'cleared' as const,
        bread: 'cleared' as const,
        milk: 'cleared' as const,
        egg: 'cleared' as const,
      },
      clearedCardIds: ['apple', 'banana', 'bread', 'milk', 'egg'],
    };

    const actions = normalizeAssistantActions(memory, foodCourse, {
      speech: 'Let us say egg again.',
      actions: [{ tool: 'show_card', params: { card_id: 'egg' } }],
      state_update: { current_word: 'egg', phase: 'learning' },
    });

    expect(actions).toEqual([{ tool: 'show_card', params: { card_id: 'rice' } }]);
  });

  it('falls forward when a correct assessment repeats the just-cleared card', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'egg',
      cardProgress: {
        ...initializeCardProgress(createMemory(), foodCourse).cardProgress,
        apple: 'cleared' as const,
        banana: 'cleared' as const,
        bread: 'cleared' as const,
        milk: 'cleared' as const,
      },
      clearedCardIds: ['apple', 'banana', 'bread', 'milk'],
    };

    const actions = normalizeAssistantActions(memory, foodCourse, {
      speech: 'Good egg. Next one.',
      actions: [{ tool: 'show_card', params: { card_id: 'egg' } }],
      state_update: {
        current_word: 'egg',
        phase: 'learning',
        attempt_assessment: {
          card_id: 'egg',
          result: 'correct',
          should_advance: true,
          evidence: 'The student said egg.',
        },
      },
    });
    const next = commitAssistantStreamResult(memory, 'Good egg. Next one.', actions, {
      current_word: 'egg',
      phase: 'learning',
      attempt_assessment: {
        card_id: 'egg',
        result: 'correct',
        should_advance: true,
        evidence: 'The student said egg.',
      },
    });

    expect(actions).toEqual([{ tool: 'show_card', params: { card_id: 'rice' } }]);
    expect(next.cardProgress.egg).toBe('cleared');
    expect(next.currentCardId).toBe('rice');
  });


  it('keeps close and wrong attempts uncleared, then marks needs_review on the third miss', () => {
    let memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };
    const assessment = {
      card_id: 'apple',
      result: 'wrong' as const,
      should_advance: false,
      evidence: 'ASR did not match',
    };

    memory = commitAssistantStreamResult(memory, 'Try slowly.', [], {
      current_word: 'apple',
      phase: 'learning',
      attempt_assessment: assessment,
    });
    memory = commitAssistantStreamResult(memory, 'One more slow try.', [], {
      current_word: 'apple',
      phase: 'learning',
      attempt_assessment: assessment,
    });
    memory = commitAssistantStreamResult(memory, 'We will come back later.', [], {
      current_word: 'apple',
      phase: 'learning',
      attempt_assessment: assessment,
    });

    expect(memory.cardProgress.apple).toBe('needs_review');
    expect(memory.clearedCardIds).not.toContain('apple');
  });

  it('does not clear or advance progress for off-topic input', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };

    const next = commitAssistantStreamResult(memory, 'Let us come back to apple.', [], {
      current_word: 'apple',
      phase: 'learning',
      attempt_assessment: {
        card_id: 'apple',
        result: 'off_topic',
        should_advance: false,
        evidence: 'The student talked about another topic.',
      },
    });

    expect(next.cardProgress.apple).toBe('attempted');
    expect(next.clearedCardIds).not.toContain('apple');
  });


  it('rejects premature closing while untouched cards remain', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      phase: 'learning' as const,
      currentCardId: 'apple',
    };

    const next = commitAssistantStreamResult(memory, 'Today is done.', [], {
      phase: 'closing',
    });

    expect(next.phase).toBe('learning');
  });
});

describe('LLM history window', () => {
  it('keeps only the most recent 12 messages for LLM context', () => {
    const memory = {
      ...createMemory(),
      messages: Array.from({ length: 14 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `message-${index}`,
        timestamp: new Date(),
      })),
    };

    const messages = getMessagesForLLM(memory);

    expect(messages).toHaveLength(12);
    expect(messages[0].content).toBe('message-2');
    expect(messages[11].content).toBe('message-13');
  });
});

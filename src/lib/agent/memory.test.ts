import { describe, expect, it } from 'vitest';
import { transportationCourse } from '@/data/courses/transportation';
import { timeNumbersCourse } from '@/data/courses/timeNumbers';
import {
  createMemory,
  getMessagesForLLM,
  initializeCardProgress,
  commitAssistantStreamResult,
  markWordCorrect,
  markWordIncorrect,
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
    const memory = initializeCardProgress(createMemory(), timeNumbersCourse);

    expect(memory.cardProgress.hour).toBe('untouched');
    expect(memory.cardProgress.sentence_thousand_hundred).toBe('untouched');
  });

  it('uses show_card as the current card source of truth and marks attempted', () => {
    const memory = initializeCardProgress(createMemory(), transportationCourse);

    const next = commitAssistantStreamResult(
      memory,
      'Look, airplane!',
      [{ tool: 'show_card', params: { card_id: 'airplane' } }],
      { current_word: 'airplane', phase: 'learning' }
    );

    expect(next.currentCardId).toBe('airplane');
    expect(next.cardProgress.airplane).toBe('attempted');
  });

  it('marks the current card cleared from a correct assessment', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), transportationCourse),
      currentCardId: 'airplane',
    };

    const next = commitAssistantStreamResult(memory, 'Great!', [], {
      current_word: 'airplane',
      phase: 'learning',
      attempt_assessment: {
        card_id: 'airplane',
        result: 'correct',
        should_advance: true,
        evidence: 'ASR was close enough to airplane',
      },
    });

    expect(next.cardProgress.airplane).toBe('cleared');
    expect(next.clearedCardIds).toContain('airplane');
    expect(next.wordsLearned).toContain('airplane');
  });

  it('applies assessment to the previous current card before syncing a new show_card action', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), transportationCourse),
      currentCardId: 'airplane',
    };

    const next = commitAssistantStreamResult(
      memory,
      'Great, now look at train.',
      [{ tool: 'show_card', params: { card_id: 'train' } }],
      {
        current_word: 'airplane',
        phase: 'learning',
        attempt_assessment: {
          card_id: 'airplane',
          result: 'correct',
          should_advance: true,
          evidence: 'The student said airplane.',
        },
      }
    );

    expect(next.cardProgress.airplane).toBe('cleared');
    expect(next.currentCardId).toBe('train');
    expect(next.cardProgress.train).toBe('attempted');
  });


  it('keeps close and wrong attempts uncleared, then marks needs_review on the third miss', () => {
    let memory = {
      ...initializeCardProgress(createMemory(), transportationCourse),
      currentCardId: 'airplane',
    };
    const assessment = {
      card_id: 'airplane',
      result: 'wrong' as const,
      should_advance: false,
      evidence: 'ASR did not match',
    };

    memory = commitAssistantStreamResult(memory, 'Try slowly.', [], {
      current_word: 'airplane',
      phase: 'learning',
      attempt_assessment: assessment,
    });
    memory = commitAssistantStreamResult(memory, 'One more slow try.', [], {
      current_word: 'airplane',
      phase: 'learning',
      attempt_assessment: assessment,
    });
    memory = commitAssistantStreamResult(memory, 'We will come back later.', [], {
      current_word: 'airplane',
      phase: 'learning',
      attempt_assessment: assessment,
    });

    expect(memory.cardProgress.airplane).toBe('needs_review');
    expect(memory.clearedCardIds).not.toContain('airplane');
  });

  it('does not clear or advance progress for off-topic input', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), transportationCourse),
      currentCardId: 'airplane',
    };

    const next = commitAssistantStreamResult(memory, 'Let us come back to airplane.', [], {
      current_word: 'airplane',
      phase: 'learning',
      attempt_assessment: {
        card_id: 'airplane',
        result: 'off_topic',
        should_advance: false,
        evidence: 'The student talked about another topic.',
      },
    });

    expect(next.cardProgress.airplane).toBe('attempted');
    expect(next.clearedCardIds).not.toContain('airplane');
  });


  it('rejects premature closing while untouched cards remain', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), transportationCourse),
      phase: 'learning' as const,
      currentCardId: 'airplane',
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

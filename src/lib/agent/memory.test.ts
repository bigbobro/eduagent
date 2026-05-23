import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import {
  createMemory,
  getMessagesForLLM,
  getNextWordCardId,
  initializeCardProgress,
  commitAssistantStreamResult,
  markWordCorrect,
  markWordIncorrect,
  normalizeAssistantActions,
} from './memory';
import { allCourses } from '@/data/courses/index';

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

  it('R-A: stays on just-cleared card for celebration turn even if LLM repeats it', () => {
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

    // R-A (2026-05-23): celebration turn keeps showing the just-cleared card so the
    // teacher speech ("good egg!") stays aligned with the visual. Cursor still advances
    // to rice via commitAssistantStreamResult so next turn LLM gets the new context.
    expect(actions).toEqual([{ tool: 'show_card', params: { card_id: 'egg' } }]);
    expect(next.cardProgress.egg).toBe('cleared');
    expect(next.currentCardId).toBe('egg');
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

describe('R2: ASR literal verify in applyAttemptAssessment', () => {
  it('clears card when LLM says correct AND raw ASR contains the target word', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };

    const next = commitAssistantStreamResult(memory, 'Great job!', [], {
      current_word: 'apple',
      phase: 'learning',
      attempt_assessment: {
        card_id: 'apple',
        result: 'correct',
        should_advance: true,
        evidence: 'heard apple',
      },
    }, 'Apple.');

    expect(next.cardProgress.apple).toBe('cleared');
    expect(next.clearedCardIds).toContain('apple');
    expect(next.wordsLearned).toContain('apple');
  });

  it('downgrades to attempted when LLM says correct but raw ASR lacks the target word', () => {
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
        evidence: 'LLM thinks it sounds like apple',
      },
    }, 'Kite.');  // ASR "Kite." does not contain "apple"

    expect(next.cardProgress.apple).toBe('attempted');
    expect(next.clearedCardIds).not.toContain('apple');
    expect(next.wordsLearned).not.toContain('apple');
  });

  it('falls back to LLM judgment (clears) when rawAsrText is undefined', () => {
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
        evidence: 'heard apple',
      },
    }, undefined);  // no rawAsrText — should trust LLM

    expect(next.cardProgress.apple).toBe('cleared');
    expect(next.clearedCardIds).toContain('apple');
  });

  it('ASR matching is case-insensitive and ignores punctuation', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'rice',
    };

    // Raw ASR: "Rice." — contains "rice" after strip
    const next = commitAssistantStreamResult(memory, 'Nice!', [], {
      current_word: 'rice',
      phase: 'learning',
      attempt_assessment: {
        card_id: 'rice',
        result: 'correct',
        should_advance: true,
        evidence: 'heard rice',
      },
    }, 'Rice.');

    expect(next.cardProgress.rice).toBe('cleared');
  });

  it('still marks needs_review after 3 consecutive wrong/close assessments', () => {
    let memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };

    // Downgrade path also increments streak
    for (let i = 0; i < 3; i++) {
      memory = commitAssistantStreamResult(memory, 'Try again.', [], {
        current_word: 'apple',
        phase: 'learning',
        attempt_assessment: {
          card_id: 'apple',
          result: 'correct',
          should_advance: true,
          evidence: 'LLM thinks correct but ASR is wrong',
        },
      }, 'Kite.');
    }

    expect(memory.cardProgress.apple).toBe('needs_review');
    expect(memory.clearedCardIds).not.toContain('apple');
  });
});

describe('R5: canShowCard whitelist {currentCard, nextCard}', () => {
  it('rejects non-sequential jump to a far-away untouched card', () => {
    // R5 supersedes R3: under R5, only currentCard or nextCard is allowed.
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'cat',  // currently on first card; next is dog
    };

    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'ok, frog time',
      actions: [{ tool: 'show_card', params: { card_id: 'frog' } }],
      state_update: { current_word: 'cat', phase: 'learning' },
    });

    // frog is not current or next — rejected
    expect(actions.every((a) => a.params.card_id !== 'frog')).toBe(true);
  });

  it('rejects show_card for an attempted word card that is not current or next', () => {
    // milk is far down the order; current is apple; next is banana
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
      cardProgress: {
        ...initializeCardProgress(createMemory(), foodCourse).cardProgress,
        milk: 'attempted' as const,
      },
    };

    const actions = normalizeAssistantActions(memory, foodCourse, {
      speech: 'Let us try milk again.',
      actions: [{ tool: 'show_card', params: { card_id: 'milk' } }],
      state_update: { current_word: 'apple', phase: 'learning' },
    });

    expect(actions.every((a) => a.params.card_id !== 'milk')).toBe(true);
  });

  it('accepts show_card for the nextCard (currentCard=apple, nextCard=banana)', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };

    const actions = normalizeAssistantActions(memory, foodCourse, {
      speech: 'Now look at banana.',
      actions: [{ tool: 'show_card', params: { card_id: 'banana' } }],
      state_update: { current_word: 'apple', phase: 'learning' },
    });

    expect(actions.some((a) => a.params.card_id === 'banana')).toBe(true);
  });

  it('still rejects show_card for an already cleared word card', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
      cardProgress: {
        ...initializeCardProgress(createMemory(), foodCourse).cardProgress,
        banana: 'cleared' as const,
      },
      clearedCardIds: ['banana'],
    };

    const actions = normalizeAssistantActions(memory, foodCourse, {
      speech: 'Let us revisit banana.',
      actions: [{ tool: 'show_card', params: { card_id: 'banana' } }],
      state_update: { current_word: 'apple', phase: 'learning' },
    });

    // banana is cleared — should be rejected, replaced by next active card
    expect(actions.every((a) => a.params.card_id !== 'banana')).toBe(true);
  });

  it('AC2: rejects show_card cat when cat is cleared and currentCard is dog', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'dog',
      cardProgress: {
        ...initializeCardProgress(createMemory(), animalsCourse).cardProgress,
        cat: 'cleared' as const,
      },
      clearedCardIds: ['cat'],
    };

    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'Back to cat.',
      actions: [{ tool: 'show_card', params: { card_id: 'cat' } }],
      state_update: { current_word: 'dog', phase: 'learning' },
    });

    expect(actions.every((a) => a.params.card_id !== 'cat')).toBe(true);
    // Fallback: should push activeWordCardId (dog) since cat was rejected
    expect(actions.some((a) => a.params.card_id === 'dog')).toBe(true);
  });
});

describe('getNextWordCardId helper', () => {
  it('returns first non-cleared word card after current in newCardIds order', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'cat',
      cardProgress: {
        ...initializeCardProgress(createMemory(), animalsCourse).cardProgress,
        cat: 'cleared' as const,
      },
    };

    // dynamic import to avoid extra top-level import edit
    
    expect(getNextWordCardId(memory, animalsCourse)).toBe('dog');
  });

  it('skips already cleared cards', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'cat',
      cardProgress: {
        ...initializeCardProgress(createMemory(), animalsCourse).cardProgress,
        cat: 'cleared' as const,
        dog: 'cleared' as const,
      },
    };

    
    expect(getNextWordCardId(memory, animalsCourse)).toBe('bird');
  });

  it('returns "" when all word cards are cleared', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const allCleared: Record<string, 'cleared'> = {};
    animalsCourse.cards
      .filter((c) => c.kind === 'word')
      .forEach((c) => { allCleared[c.id] = 'cleared'; });
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'frog',
      cardProgress: { ...initializeCardProgress(createMemory(), animalsCourse).cardProgress, ...allCleared },
    };

    
    expect(getNextWordCardId(memory, animalsCourse)).toBe('');
  });
});

describe('R-A: celebration-turn card stay (replaces R7 auto-advance)', () => {
  it('R-A AC5: stays on just-cleared current card when LLM emits no show_card (celebration)', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'cat',
    };

    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'Great cat!',
      actions: [],
      state_update: {
        current_word: 'cat',
        phase: 'learning',
        attempt_assessment: {
          card_id: 'cat',
          result: 'correct',
          should_advance: true,
          evidence: 'student said cat',
        },
      },
    }, 'Cat.');

    // R-A: must push cat (celebration stay), not dog (was R7 auto-advance)
    expect(actions.some((a) => a.tool === 'show_card' && a.params.card_id === 'cat')).toBe(true);
    expect(actions.every((a) => !(a.tool === 'show_card' && a.params.card_id === 'dog'))).toBe(true);
  });

  it('AC6: respects LLM explicit advance to nextCard (no celebration stay override)', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'cat',
    };

    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'Great cat! Now dog.',
      actions: [{ tool: 'show_card', params: { card_id: 'dog' } }],
      state_update: {
        current_word: 'cat',
        phase: 'learning',
        attempt_assessment: {
          card_id: 'cat',
          result: 'correct',
          should_advance: true,
          evidence: 'student said cat',
        },
      },
    }, 'Cat.');

    const dogPushes = actions.filter((a) => a.tool === 'show_card' && a.params.card_id === 'dog');
    expect(dogPushes).toHaveLength(1);
  });

  it('R-A AC7: turtle correct + LLM silent → server keeps turtle for celebration (no auto-jump to lion)', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    // Simulate state where cat,dog,bird,fish,rabbit cleared; current is turtle
    const cleared = ['cat', 'dog', 'bird', 'fish', 'rabbit'];
    const cardProgress = { ...initializeCardProgress(createMemory(), animalsCourse).cardProgress };
    cleared.forEach((id) => { cardProgress[id] = 'cleared'; });
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'turtle',
      cardProgress,
      clearedCardIds: cleared,
    };

    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'Great turtle!',
      actions: [],
      state_update: {
        current_word: 'turtle',
        phase: 'learning',
        attempt_assessment: {
          card_id: 'turtle',
          result: 'correct',
          should_advance: true,
          evidence: 'student said turtle',
        },
      },
    }, 'Turtle.');

    expect(actions.some((a) => a.tool === 'show_card' && a.params.card_id === 'turtle')).toBe(true);
    expect(actions.every((a) => !(a.tool === 'show_card' && a.params.card_id === 'lion'))).toBe(true);
  });

  it('AC8 scenario: cat cleared, currentCard=dog, LLM emits show_card cat → no cat, contains dog', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'dog',
      cardProgress: {
        ...initializeCardProgress(createMemory(), animalsCourse).cardProgress,
        cat: 'cleared' as const,
      },
      clearedCardIds: ['cat'],
    };

    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'Back to cat.',
      actions: [{ tool: 'show_card', params: { card_id: 'cat' } }],
      state_update: { current_word: 'dog', phase: 'learning' },
    });

    expect(actions.every((a) => a.params.card_id !== 'cat')).toBe(true);
    expect(actions.some((a) => a.params.card_id === 'dog')).toBe(true);
  });

  it('R7 negative: does NOT auto-advance when LLM correct but ASR literal mismatch (R2 downgrade)', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'cat',
    };

    // LLM judged correct but raw ASR says "Kite" (does not contain "cat") → R2 downgrades
    // to attempted; R7 must NOT push dog because cat was not actually cleared.
    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'Good!',
      actions: [],
      state_update: {
        current_word: 'cat',
        phase: 'learning',
        attempt_assessment: {
          card_id: 'cat',
          result: 'correct',
          should_advance: true,
          evidence: 'misjudged kite as cat',
        },
      },
    }, 'Kite.');

    expect(actions.every((a) => !(a.tool === 'show_card' && a.params.card_id === 'dog'))).toBe(true);
  });

  it('R-A safe when last card cleared (nextCardId empty): celebration stays on last card', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const wordCardIds = animalsCourse.cards.filter((c) => c.kind === 'word').map((c) => c.id);
    const cardProgress = { ...initializeCardProgress(createMemory(), animalsCourse).cardProgress };
    wordCardIds.forEach((id) => { if (id !== 'frog') cardProgress[id] = 'cleared'; });
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'frog',
      cardProgress,
      clearedCardIds: wordCardIds.filter((id) => id !== 'frog'),
    };

    // last card frog clears → nextCardId = '' → no push, no crash
    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'Great frog!',
      actions: [],
      state_update: {
        current_word: 'frog',
        phase: 'learning',
        attempt_assessment: {
          card_id: 'frog',
          result: 'correct',
          should_advance: true,
          evidence: 'student said frog',
        },
      },
    }, 'Frog.');

    // R-A: celebration stay pushes show_card → frog (the just-cleared last card).
    // No crash, no jump to an empty nextCardId.
    const showCards = actions.filter((a) => a.tool === 'show_card');
    expect(showCards).toHaveLength(1);
    expect(showCards[0].params.card_id).toBe('frog');
  });

  it('AC1: rejects show_card to currentCard when it is itself cleared (stale state)', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    // Edge case: currentCardId still points at cat but cat has already been marked cleared
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'cat',
      cardProgress: {
        ...initializeCardProgress(createMemory(), animalsCourse).cardProgress,
        cat: 'cleared' as const,
      },
      clearedCardIds: ['cat'],
    };

    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'Cat again!',
      actions: [{ tool: 'show_card', params: { card_id: 'cat' } }],
      state_update: { current_word: 'cat', phase: 'learning' },
    });

    expect(actions.every((a) => a.params.card_id !== 'cat')).toBe(true);
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

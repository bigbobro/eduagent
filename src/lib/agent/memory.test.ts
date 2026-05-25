import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { treatsCourse } from '@/data/courses/treats';
import {
  createMemory,
  getMessagesForLLM,
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
      foodCourse,
      'Look, apple!',
      [{ tool: 'show_card', params: { card_id: 'apple' } }],
      { current_word: 'apple' }
    );

    expect(next.currentCardId).toBe('apple');
    expect(next.cardProgress.apple).toBe('attempted');
  });

  it('R-C: a single R2 hit increments count but does not clear (needs 2)', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };

    const next = commitAssistantStreamResult(memory, foodCourse, 'Great!', [], {
      current_word: 'apple',
      attempt_assessment: {
        card_id: 'apple',
        result: 'correct',
        should_advance: true,
        evidence: 'heard apple',
      },
    }, 'Apple.');

    expect(next.cardProgress.apple).toBe('attempted');
    expect(next.cardCorrectCount.apple).toBe(1);
    expect(next.clearedCardIds).not.toContain('apple');
  });

  it('R-C: two R2 hits clear the card and lock further counting', () => {
    let memory: any = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };
    const assessment = (result: 'correct' | 'close' = 'correct') => ({
      current_word: 'apple',
      attempt_assessment: { card_id: 'apple', result, should_advance: true, evidence: 'heard apple' },
    });

    memory = commitAssistantStreamResult(memory, foodCourse, 'first try', [], assessment(), 'Apple.');
    expect(memory.cardCorrectCount.apple).toBe(1);
    expect(memory.cardProgress.apple).toBe('attempted');

    memory = commitAssistantStreamResult(memory, foodCourse, 'second try', [], assessment(), 'Apple.');
    expect(memory.cardCorrectCount.apple).toBe(2);
    expect(memory.cardProgress.apple).toBe('cleared');
    expect(memory.clearedCardIds).toContain('apple');
    expect(memory.wordsLearned).toContain('apple');

    // Lock: a 3rd hit should not increment further.
    memory = commitAssistantStreamResult(memory, foodCourse, 'extra try', [], assessment(), 'Apple.');
    expect(memory.cardCorrectCount.apple).toBe(2);
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
      state_update: { current_word: 'egg' },
    });

    expect(actions).toEqual([{ tool: 'show_card', params: { card_id: 'rice' } }]);
  });

  it('R-C: stays on current card while count < 2 even if LLM hits R2 once', () => {
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
      speech: 'Good egg.',
      actions: [{ tool: 'show_card', params: { card_id: 'egg' } }],
      state_update: {
        current_word: 'egg',
        attempt_assessment: { card_id: 'egg', result: 'correct', should_advance: true, evidence: 'said egg' },
      },
    }, 'Egg.');

    // R-C: only 1 R2 hit — count=1, not cleared. UI stays on egg.
    expect(actions).toEqual([{ tool: 'show_card', params: { card_id: 'egg' } }]);
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

    memory = commitAssistantStreamResult(memory, foodCourse, 'Try slowly.', [], {
      current_word: 'apple',
      attempt_assessment: assessment,
    });
    memory = commitAssistantStreamResult(memory, foodCourse, 'One more slow try.', [], {
      current_word: 'apple',
      attempt_assessment: assessment,
    });
    memory = commitAssistantStreamResult(memory, foodCourse, 'We will come back later.', [], {
      current_word: 'apple',
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

    const next = commitAssistantStreamResult(memory, foodCourse, 'Let us come back to apple.', [], {
      current_word: 'apple',
      attempt_assessment: {
        card_id: 'apple',
        result: 'off_topic',
        should_advance: false,
        evidence: 'The student talked about another topic.',
      },
    });

    // R-C: off_topic produces no state change. apple was untouched, stays untouched.
    expect(next.cardProgress.apple).toBe('untouched');
    expect(next.cardCorrectCount.apple || 0).toBe(0);
    expect(next.clearedCardIds).not.toContain('apple');
  });


  it('phase is not changed by state_update (phase controlled by session, not LLM)', () => {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      phase: 'learning' as const,
      currentCardId: 'apple',
    };

    const next = commitAssistantStreamResult(memory, foodCourse, 'Today is done.', [], {});

    expect(next.phase).toBe('learning');
  });
});

describe('R-C: server-authoritative R2 count + 2-hit clearance', () => {
  const mkAssessment = (result: 'correct' | 'close' | 'wrong' | 'off_topic', word = 'apple') => ({
    current_word: word,
    attempt_assessment: { card_id: word, result, should_advance: true, evidence: 'evidence' },
  });

  it('R2 hit increments count, second R2 hit clears + locks', () => {
    let memory: any = { ...initializeCardProgress(createMemory(), foodCourse), currentCardId: 'apple' };
    memory = commitAssistantStreamResult(memory, foodCourse, 'a', [], mkAssessment('correct'), 'Apple.');
    expect(memory.cardCorrectCount.apple).toBe(1);
    expect(memory.cardProgress.apple).toBe('attempted');

    memory = commitAssistantStreamResult(memory, foodCourse, 'b', [], mkAssessment('correct'), 'Apple.');
    expect(memory.cardCorrectCount.apple).toBe(2);
    expect(memory.cardProgress.apple).toBe('cleared');
    expect(memory.wordsLearned).toContain('apple');

    // Lock — further hits ignored.
    memory = commitAssistantStreamResult(memory, foodCourse, 'c', [], mkAssessment('correct'), 'Apple.');
    expect(memory.cardCorrectCount.apple).toBe(2);
    expect(memory.cardProgress.apple).toBe('cleared');
  });

  it('R2 hit counts regardless of LLM judgment (server-authoritative)', () => {
    // LLM says 'close' but raw ASR has 'apple' — still a hit per R-C.
    let memory: any = { ...initializeCardProgress(createMemory(), foodCourse), currentCardId: 'apple' };
    memory = commitAssistantStreamResult(memory, foodCourse, 'a', [], mkAssessment('close'), 'Apple.');
    expect(memory.cardCorrectCount.apple).toBe(1);
    memory = commitAssistantStreamResult(memory, foodCourse, 'b', [], mkAssessment('close'), 'Apple.');
    expect(memory.cardProgress.apple).toBe('cleared');
  });

  it('R2 mismatch + LLM correct → no progress credited (no false clear, no downgrade of untouched)', () => {
    const memory = { ...initializeCardProgress(createMemory(), foodCourse), currentCardId: 'apple' };
    const next = commitAssistantStreamResult(memory, foodCourse, 'a', [], mkAssessment('correct'), 'Kite.');
    expect(next.cardProgress.apple).toBe('untouched');
    expect(next.cardCorrectCount.apple || 0).toBe(0);
  });

  it('cleared cards are locked: R2 mismatch on cleared keeps cleared', () => {
    let memory: any = { ...initializeCardProgress(createMemory(), foodCourse), currentCardId: 'apple' };
    memory = commitAssistantStreamResult(memory, foodCourse, 'a', [], mkAssessment('correct'), 'Apple.');
    memory = commitAssistantStreamResult(memory, foodCourse, 'b', [], mkAssessment('correct'), 'Apple.');
    expect(memory.cardProgress.apple).toBe('cleared');
    // Now a turn where current_word has advanced to 'dog' but assessment.card_id='apple',
    // ASR='Cat.' — old bug would un-clear cat. R-C keeps cleared lock.
    memory = commitAssistantStreamResult(memory, foodCourse, 'c', [], {
      current_word: 'banana',
      attempt_assessment: { card_id: 'apple', result: 'correct', should_advance: true, evidence: '' },
    }, 'Banana.');  // ASR doesn't contain 'apple'
    expect(memory.cardProgress.apple).toBe('cleared');
  });

  it('ASR matching is case-insensitive and ignores punctuation', () => {
    let memory: any = { ...initializeCardProgress(createMemory(), foodCourse), currentCardId: 'rice' };
    memory = commitAssistantStreamResult(memory, foodCourse, 'a', [], mkAssessment('correct', 'rice'), 'RICE!');
    memory = commitAssistantStreamResult(memory, foodCourse, 'b', [], mkAssessment('correct', 'rice'), 'rice.');
    expect(memory.cardProgress.rice).toBe('cleared');
  });

  it('ASR matching ignores separators for compound words such as ice cream', () => {
    let memory: any = { ...initializeCardProgress(createMemory(), treatsCourse), currentCardId: 'icecream' };
    const assessment = {
      current_word: 'ice cream',
      attempt_assessment: {
        card_id: 'icecream',
        result: 'correct' as const,
        should_advance: true,
        evidence: 'heard ice cream',
      },
    };

    memory = commitAssistantStreamResult(memory, treatsCourse, 'a', [], assessment, 'Ice cream.');
    expect(memory.cardCorrectCount.icecream).toBe(1);
    expect(memory.cardProgress.icecream).toBe('attempted');

    memory = commitAssistantStreamResult(memory, treatsCourse, 'b', [], assessment, 'ice-cream!');
    expect(memory.cardCorrectCount.icecream).toBe(2);
    expect(memory.cardProgress.icecream).toBe('cleared');
    expect(memory.wordsLearned).toContain('ice cream');
  });

  it('ASR matching accepts explicit course aliases such as pie -> 派', () => {
    let memory: any = { ...initializeCardProgress(createMemory(), treatsCourse), currentCardId: 'pie' };
    const assessment = {
      current_word: 'pie',
      attempt_assessment: {
        card_id: 'pie',
        result: 'correct' as const,
        should_advance: true,
        evidence: 'heard pie',
      },
    };

    memory = commitAssistantStreamResult(memory, treatsCourse, 'a', [], assessment, '派。');
    memory = commitAssistantStreamResult(memory, treatsCourse, 'b', [], assessment, '派!');

    expect(memory.cardCorrectCount.pie).toBe(2);
    expect(memory.cardProgress.pie).toBe('cleared');
    expect(memory.wordsLearned).toContain('pie');
  });

  it('ASR matching does not treat every Chinese translation as a hit by default', () => {
    const memory = { ...initializeCardProgress(createMemory(), treatsCourse), currentCardId: 'cake' };

    const next = commitAssistantStreamResult(memory, treatsCourse, 'a', [], {
      current_word: 'cake',
      attempt_assessment: {
        card_id: 'cake',
        result: 'correct',
        should_advance: true,
        evidence: 'LLM over-accepted Chinese translation',
      },
    }, '蛋糕。');

    expect(next.cardProgress.cake).toBe('untouched');
    expect(next.cardCorrectCount.cake || 0).toBe(0);
  });

  it('R-C advances from icecream to lollipop when the second hit is spoken as ice cream', () => {
    const clearedBeforeIcecream = [
      'cake',
      'cookie',
      'chocolate',
      'honey',
      'candy',
      'pudding',
      'pie',
      'jelly',
      'donut',
      'muffin',
    ];
    const cardProgress = { ...initializeCardProgress(createMemory(), treatsCourse).cardProgress };
    for (const id of clearedBeforeIcecream) {
      cardProgress[id] = 'cleared';
    }
    const memory = {
      ...initializeCardProgress(createMemory(), treatsCourse),
      currentCardId: 'icecream',
      cardProgress,
      clearedCardIds: clearedBeforeIcecream,
      cardCorrectCount: { icecream: 1 },
    };

    const actions = normalizeAssistantActions(memory, treatsCourse, {
      speech: 'Great ice cream. Now lollipop.',
      actions: [{ tool: 'show_card', params: { card_id: 'icecream' } }],
      state_update: {
        current_word: 'ice cream',
        attempt_assessment: {
          card_id: 'icecream',
          result: 'correct',
          should_advance: true,
          evidence: 'heard ice cream',
        },
      },
    }, 'Ice cream.');

    expect(actions).toEqual([{ tool: 'show_card', params: { card_id: 'lollipop' } }]);
  });

  it('streak still marks needs_review on 3 close/wrong with no R2 hits', () => {
    let memory: any = { ...initializeCardProgress(createMemory(), foodCourse), currentCardId: 'apple' };
    for (let i = 0; i < 3; i++) {
      memory = commitAssistantStreamResult(memory, foodCourse, 'try again', [], mkAssessment('wrong'), 'Kite.');
    }
    expect(memory.cardProgress.apple).toBe('needs_review');
    expect(memory.cardCorrectCount.apple || 0).toBe(0);
  });

  it('a successful R2 hit resets the error streak', () => {
    let memory: any = { ...initializeCardProgress(createMemory(), foodCourse), currentCardId: 'apple' };
    memory = commitAssistantStreamResult(memory, foodCourse, '1', [], mkAssessment('wrong'), 'Kite.');
    memory = commitAssistantStreamResult(memory, foodCourse, '2', [], mkAssessment('wrong'), 'Kite.');
    expect(memory.cardAttemptStreak.apple).toBe(2);
    memory = commitAssistantStreamResult(memory, foodCourse, '3', [], mkAssessment('correct'), 'Apple.');
    expect(memory.cardAttemptStreak.apple).toBe(0);
    expect(memory.cardCorrectCount.apple).toBe(1);
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
      state_update: { current_word: 'cat' },
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
      state_update: { current_word: 'apple' },
    });

    expect(actions.every((a) => a.params.card_id !== 'milk')).toBe(true);
  });

  it('R-C: rejects show_card to nextCard while currentCard not yet 2-cleared', () => {
    // Under R-C, server enforces stay-on-current until count >= 2.
    // R5 used to allow any show_card → nextCard; R-C tightens this.
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      currentCardId: 'apple',
    };

    const actions = normalizeAssistantActions(memory, foodCourse, {
      speech: 'Now look at banana.',
      actions: [{ tool: 'show_card', params: { card_id: 'banana' } }],
      state_update: { current_word: 'apple' },
    });

    // apple hasn't been hit twice — server forces stay on apple, banana is rejected.
    expect(actions.every((a) => a.params.card_id !== 'banana')).toBe(true);
    expect(actions.some((a) => a.params.card_id === 'apple')).toBe(true);
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
      state_update: { current_word: 'apple' },
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
      state_update: { current_word: 'dog' },
    });

    expect(actions.every((a) => a.params.card_id !== 'cat')).toBe(true);
    // Fallback: should push activeWordCardId (dog) since cat was rejected
    expect(actions.some((a) => a.params.card_id === 'dog')).toBe(true);
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

  it('R-C: 1st R2 hit stays on current, LLM advance attempt rejected', () => {
    const animalsCourse = allCourses.find((c) => c.id === 'animals')!;
    const memory = {
      ...initializeCardProgress(createMemory(), animalsCourse),
      currentCardId: 'cat',
    };

    // 1st R2 hit on cat — count=1, not cleared. LLM's premature show_card → dog is rejected.
    const actions = normalizeAssistantActions(memory, animalsCourse, {
      speech: 'Great cat! Now dog.',
      actions: [{ tool: 'show_card', params: { card_id: 'dog' } }],
      state_update: {
        current_word: 'cat',
        attempt_assessment: { card_id: 'cat', result: 'correct', should_advance: true, evidence: 'said cat' },
      },
    }, 'Cat.');

    expect(actions.every((a) => a.params.card_id !== 'dog')).toBe(true);
    expect(actions.some((a) => a.params.card_id === 'cat')).toBe(true);
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
      state_update: { current_word: 'dog' },
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
      state_update: { current_word: 'cat' },
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

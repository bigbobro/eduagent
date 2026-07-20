import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createMemory, initializeCardProgress, markWordCorrect, markWordIncorrect } from './memory';
import { deserializeProgress, isCourseComplete, isResumableProgress, resolveResumeCardId, serializeProgress } from './course-progress';
import type { PhaseName } from '@/types/course';
import type { CourseProgressRow } from '@/lib/db/queries';

describe('serializeProgress / deserializeProgress round trip', () => {
  it('round-trips an empty (fresh) memory losslessly', () => {
    const memory = initializeCardProgress(createMemory(), foodCourse);

    const snapshot = serializeProgress(memory);
    const restored = deserializeProgress(createMemory(), snapshot);

    expect(restored.currentWord).toBe(memory.currentWord);
    expect(restored.currentCardId).toBe(memory.currentCardId);
    expect(restored.phase).toBe(memory.phase);
    expect(restored.wordsLearned).toEqual(memory.wordsLearned);
    expect(restored.wordsToReview).toEqual(memory.wordsToReview);
    expect(restored.clearedCardIds).toEqual(memory.clearedCardIds);
    expect(restored.cardProgress).toEqual(memory.cardProgress);
    expect(restored.cardAttemptStreak).toEqual(memory.cardAttemptStreak);
    expect(restored.cardCorrectCount).toEqual(memory.cardCorrectCount);
    expect(restored.parkedCardIds).toEqual(memory.parkedCardIds);
    expect(restored.parkRetryCardIds).toEqual(memory.parkRetryCardIds);
    expect(restored.wordPerformance.size).toBe(0);
    expect(restored.totalInteractions).toBe(memory.totalInteractions);
    expect(restored.passedQuizIds).toEqual([]);
  });

  it('round-trips a populated memory including Map wordPerformance, Date, and passedQuizIds', () => {
    let memory = initializeCardProgress(createMemory(), foodCourse);
    memory = { ...memory, currentCardId: 'apple', currentWord: 'apple' };
    memory = markWordCorrect(memory, 'apple');
    memory = markWordCorrect(memory, 'apple');
    memory = markWordIncorrect(memory, 'banana');
    memory = {
      ...memory,
      clearedCardIds: ['apple'],
      cardProgress: { ...memory.cardProgress, apple: 'cleared', banana: 'attempted' },
      cardCorrectCount: { apple: 2 },
      cardAttemptStreak: { banana: 1 },
      parkedCardIds: ['carrot'],
      parkRetryCardIds: [],
      passedQuizIds: ['q1', 'q2'],
      totalInteractions: 7,
    };

    // Simulate the actual DB round trip: JSON.stringify → store as TEXT → JSON.parse on read.
    const snapshot = JSON.parse(JSON.stringify(serializeProgress(memory)));
    const restored = deserializeProgress(createMemory(), snapshot);

    expect(restored.currentCardId).toBe('apple');
    expect(restored.currentWord).toBe('apple');
    expect(restored.clearedCardIds).toEqual(['apple']);
    expect(restored.cardProgress.apple).toBe('cleared');
    expect(restored.cardProgress.banana).toBe('attempted');
    expect(restored.cardCorrectCount).toEqual({ apple: 2 });
    expect(restored.cardAttemptStreak).toEqual({ banana: 1 });
    expect(restored.parkedCardIds).toEqual(['carrot']);
    expect(restored.passedQuizIds).toEqual(['q1', 'q2']);
    expect(restored.totalInteractions).toBe(7);

    const applePerf = restored.wordPerformance.get('apple');
    expect(applePerf).toBeDefined();
    expect(applePerf!.attempts).toBe(2);
    expect(applePerf!.correct).toBe(2);
    expect(applePerf!.lastAttempt).toBeInstanceOf(Date);
    expect(applePerf!.lastAttempt.getTime()).toBe(memory.wordPerformance.get('apple')!.lastAttempt.getTime());

    const bananaPerf = restored.wordPerformance.get('banana');
    expect(bananaPerf).toBeDefined();
    expect(bananaPerf!.attempts).toBe(1);
    expect(bananaPerf!.correct).toBe(0);
  });

  it('excludes messages and interestSignals from the serialized snapshot', () => {
    let memory = initializeCardProgress(createMemory(), foodCourse);
    memory = { ...memory, messages: [{ role: 'user', content: '喜欢苹果吗?', timestamp: new Date() }] };

    const snapshot = serializeProgress(memory) as unknown as Record<string, unknown>;

    expect(snapshot).not.toHaveProperty('messages');
    expect(snapshot).not.toHaveProperty('interestSignals');
  });

  it('deserializeProgress does not backfill new course cards — caller must run initializeCardProgress', () => {
    const memory = initializeCardProgress(createMemory(), foodCourse);
    const snapshot = serializeProgress(memory);
    // Drop 'egg' from the persisted cardProgress to simulate an older snapshot predating a
    // course content change.
    delete (snapshot.cardProgress as Record<string, unknown>).egg;

    const restored = deserializeProgress(createMemory(), snapshot);

    expect(restored.cardProgress.egg).toBeUndefined();
    const backfilled = initializeCardProgress(restored, foodCourse);
    expect(backfilled.cardProgress.egg).toBe('untouched');
  });
});

describe('isCourseComplete', () => {
  const allWordCardIds = foodCourse.cards.filter((c) => c.kind === 'word').map((c) => c.id);
  const allQuizIds = foodCourse.phases.reinforcement.quizzes.map((q) => q.id);

  function clearedMemory(passedQuizIds: string[]) {
    let memory = initializeCardProgress(createMemory(), foodCourse);
    const cardProgress = { ...memory.cardProgress };
    for (const id of allWordCardIds) cardProgress[id] = 'cleared';
    memory = { ...memory, cardProgress, clearedCardIds: [...allWordCardIds], passedQuizIds };
    return memory;
  }

  it('is false when a word card is not yet cleared', () => {
    const memory = clearedMemory(allQuizIds);
    memory.cardProgress.apple = 'attempted';

    expect(isCourseComplete(foodCourse, memory)).toBe(false);
  });

  it('is false when word cards are cleared but quizzes are not all passed', () => {
    const memory = clearedMemory(allQuizIds.slice(0, -1));

    expect(isCourseComplete(foodCourse, memory)).toBe(false);
  });

  it('is true when every word card is cleared and every quiz is passed', () => {
    const memory = clearedMemory(allQuizIds);

    expect(isCourseComplete(foodCourse, memory)).toBe(true);
  });
});

describe('resolveResumeCardId', () => {
  it('returns the current card when it is still uncleared', () => {
    const memory = { ...initializeCardProgress(createMemory(), foodCourse), currentCardId: 'banana' };

    expect(resolveResumeCardId(foodCourse, memory)).toBe('banana');
  });

  it('returns the first uncleared word card in teaching order when the current card is cleared', () => {
    let memory = initializeCardProgress(createMemory(), foodCourse);
    memory = {
      ...memory,
      currentCardId: 'apple',
      cardProgress: { ...memory.cardProgress, apple: 'cleared', banana: 'cleared' },
    };

    expect(resolveResumeCardId(foodCourse, memory)).toBe('bread');
  });

  it('returns empty string when every word card is cleared', () => {
    let memory = initializeCardProgress(createMemory(), foodCourse);
    const cardProgress = { ...memory.cardProgress };
    for (const card of foodCourse.cards.filter((c) => c.kind === 'word')) cardProgress[card.id] = 'cleared';
    memory = { ...memory, currentCardId: 'chicken', cardProgress };

    expect(resolveResumeCardId(foodCourse, memory)).toBe('');
  });

  it('returns the first uncleared word card when there is no current card yet', () => {
    const memory = initializeCardProgress(createMemory(), foodCourse);

    expect(resolveResumeCardId(foodCourse, memory)).toBe('apple');
  });
});

describe('isResumableProgress', () => {
  function makeRow(
    phase: PhaseName,
    opts: { completed?: boolean; clearedCardIds?: string[]; passedQuizIds?: string[] } = {},
  ): CourseProgressRow {
    const memory = {
      ...initializeCardProgress(createMemory(), foodCourse),
      clearedCardIds: opts.clearedCardIds ?? [],
      passedQuizIds: opts.passedQuizIds ?? [],
    };
    return {
      courseId: foodCourse.id,
      snapshot: serializeProgress(memory),
      phase,
      completed: opts.completed ?? false,
      updatedAt: '2026-07-20T00:00:00.000Z',
    };
  }

  it('is false for a completed course (kept but ignored — fresh review next time)', () => {
    expect(isResumableProgress(makeRow('interactive', { completed: true, clearedCardIds: ['apple'] }))).toBe(false);
  });

  it('is false for an empty intro-only breakpoint (opening speech, nothing learned yet)', () => {
    expect(isResumableProgress(makeRow('intro'))).toBe(false);
  });

  it('is true for an intro breakpoint that already has a cleared card', () => {
    expect(isResumableProgress(makeRow('intro', { clearedCardIds: ['apple'] }))).toBe(true);
  });

  it('is true for an intro breakpoint with a passed quiz', () => {
    expect(isResumableProgress(makeRow('intro', { passedQuizIds: ['q1'] }))).toBe(true);
  });

  it('is true once past intro even with nothing cleared yet', () => {
    expect(isResumableProgress(makeRow('interactive'))).toBe(true);
    expect(isResumableProgress(makeRow('reinforcement'))).toBe(true);
  });
});

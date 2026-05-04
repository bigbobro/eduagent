import { describe, expect, it } from 'vitest';
import { transportationCourse } from '@/data/courses/transportation';
import {
  createMemory,
  detectCurrentWordAttempt,
  markWordCorrect,
  markWordIncorrect,
} from './memory';

describe('detectCurrentWordAttempt', () => {
  it('detects an exact current-word hit', () => {
    const memory = {
      ...createMemory(),
      currentWord: 'train',
      phase: 'learning' as const,
    };

    expect(detectCurrentWordAttempt(memory, transportationCourse, 'Train.')).toEqual({
      word: 'train',
      correct: true,
    });
  });

  it('does not treat a similar ASR word as correct', () => {
    const memory = {
      ...createMemory(),
      currentWord: 'train',
      phase: 'learning' as const,
    };

    expect(detectCurrentWordAttempt(memory, transportationCourse, 'Tree. Tree.')).toEqual({
      word: 'train',
      correct: false,
    });
  });

  it('ignores turns with no active target word', () => {
    const memory = createMemory();

    expect(detectCurrentWordAttempt(memory, transportationCourse, 'car')).toBeNull();
  });
});

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

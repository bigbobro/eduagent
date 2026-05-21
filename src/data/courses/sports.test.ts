import { describe, expect, it } from 'vitest';
import { sportsCourse } from './sports';

describe('sports course', () => {
  it('defines a small phased sports lesson for testing', () => {
    expect(sportsCourse.id).toBe('sports');
    expect(sportsCourse.tone).toBe('mint');
    expect(sportsCourse.cards.filter((card) => card.kind === 'word')).toHaveLength(12);
    expect(sportsCourse.cards.filter((card) => card.kind === 'sentence')).toHaveLength(4);
    expect(sportsCourse.cards).toHaveLength(16);
    expect(sportsCourse.phases.introduction.sceneCaption).toContain('运动');
  });

  it('practices short sports sentences', () => {
    expect(sportsCourse.objectives.sentences).toEqual(['I can play soccer.', 'I like running.', 'I play tennis.', 'I like swimming.']);
    expect(sportsCourse.phases.reinforcement.quizzes.filter((quiz) => quiz.type === 'pick-word')).toHaveLength(4);
    expect(sportsCourse.phases.reinforcement.quizzes.filter((quiz) => quiz.type === 'repeat-after-me')).toHaveLength(4);
  });
});

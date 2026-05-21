import { describe, expect, it } from 'vitest';
import { colorsCourse } from './colors';

describe('colors course', () => {
  it('defines a small phased color lesson for testing', () => {
    expect(colorsCourse.id).toBe('colors');
    expect(colorsCourse.tone).toBe('sky');
    expect(colorsCourse.cards.filter((card) => card.kind === 'word')).toHaveLength(12);
    expect(colorsCourse.cards.filter((card) => card.kind === 'sentence')).toHaveLength(4);
    expect(colorsCourse.cards).toHaveLength(16);
    expect(colorsCourse.phases.introduction.sceneCaption).toContain('颜色');
  });

  it('practices short color sentences', () => {
    expect(colorsCourse.objectives.sentences).toEqual(['It is red.', 'I see blue.', 'I like pink.', 'This is green.']);
    expect(colorsCourse.phases.reinforcement.quizzes.filter((quiz) => quiz.type === 'pick-word')).toHaveLength(4);
    expect(colorsCourse.phases.reinforcement.quizzes.filter((quiz) => quiz.type === 'repeat-after-me')).toHaveLength(4);
  });
});

import { describe, expect, it } from 'vitest';
import { Course, Quiz } from './course';

describe('Course phase schema', () => {
  it('supports a phased course shape', () => {
    const course: Course = {
      id: 'food',
      title: 'Food',
      description: '',
      targetAge: [3, 6],
      tone: 'peach',
      cards: [],
      objectives: { sentences: ['This is a ___.'] },
      teachingHints: {
        opening: '',
        reviewCardIds: [],
        newCardIds: [],
        quizQuestions: [],
        closing: '',
      },
      phases: {
        introduction: { sceneCaption: '今天要认识食物' },
        interactive: {},
        reinforcement: { quizzes: [] },
      },
    };

    expect(course.tone).toBe('peach');
    expect(course.phases.introduction.sceneCaption).toBe('今天要认识食物');
  });

  it('discriminates quiz variants', () => {
    const pick: Quiz = {
      id: 'q1',
      type: 'pick-word',
      prompt: 'Where is apple?',
      correctCardId: 'apple',
      distractorCardIds: ['banana', 'bread'],
    };
    const repeat: Quiz = {
      id: 'q2',
      type: 'repeat-after-me',
      cardId: 'apple',
      targetText: 'This is an apple.',
    };

    expect(pick.type).toBe('pick-word');
    expect(repeat.type).toBe('repeat-after-me');
  });

});

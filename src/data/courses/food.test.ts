import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { foodCourse } from './food';

const publicDir = path.join(process.cwd(), 'public');

describe('food course authoring standard', () => {
  const cardIds = new Set(foodCourse.cards.map((card) => card.id));

  it('defines a complete phased lesson', () => {
    expect(foodCourse.phases).toBeDefined();
    expect(foodCourse.tone).toBe('peach');
    expect(foodCourse.phases.introduction.sceneCaption).toContain('食物');
    expect(foodCourse.phases.reinforcement.quizzes.length).toBe(5);
  });

  it('uses unique word card ids', () => {
    expect(cardIds.size).toBe(foodCourse.cards.length);
    expect(foodCourse.cards.every((card) => card.kind === 'word')).toBe(true);
  });

  it('defines short sentence objectives', () => {
    expect(foodCourse.objectives.sentences.length).toBeGreaterThanOrEqual(1);
    expect(foodCourse.objectives.sentences).toContain('This is a ___.');
    expect(foodCourse.objectives.sentences).toContain('I like ___.');
  });

  it('quiz references only valid card ids and uses real repeat sentences', () => {
    for (const quiz of foodCourse.phases.reinforcement.quizzes) {
      if (quiz.type === 'pick-word') {
        expect(cardIds.has(quiz.correctCardId)).toBe(true);
        for (const id of quiz.distractorCardIds) expect(cardIds.has(id)).toBe(true);
      } else {
        expect(cardIds.has(quiz.cardId)).toBe(true);
        expect(quiz.targetText).toMatch(/[.!?]$/);
        expect(quiz.targetText).not.toMatch(/^Say\s+\w+\.?$/i);
      }
    }
  });

  it('stores card art as ImageGen PNG assets', () => {
    for (const card of foodCourse.cards) {
      expect(card.imageUrl.endsWith('.png'), `${card.id} should use a PNG`).toBe(true);
      expect(fs.existsSync(path.join(publicDir, card.imageUrl))).toBe(true);
    }
  });

  it('does not require an introduction scene asset field', () => {
    const removedField = ['scene', 'Image'].join('');
    expect(removedField in foodCourse.phases.introduction).toBe(false);
  });
});

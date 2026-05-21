import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { foodCourse } from './food';

const publicDir = path.join(process.cwd(), 'public');

describe('food course authoring standard', () => {
  const cardIds = new Set(foodCourse.cards.map((card) => card.id));
  const wordCards = foodCourse.cards.filter((card) => card.kind === 'word');
  const sentenceCards = foodCourse.cards.filter((card) => card.kind === 'sentence');
  const wordCardIds = new Set(wordCards.map((card) => card.id));
  const sentenceCardIds = new Set(sentenceCards.map((card) => card.id));

  it('defines a complete phased lesson', () => {
    expect(foodCourse.phases).toBeDefined();
    expect(foodCourse.tone).toBe('peach');
    expect(foodCourse.phases.introduction.sceneCaption).toContain('食物');
    expect(foodCourse.phases.reinforcement.quizzes.length).toBe(8);
  });

  it('uses unique word card ids', () => {
    expect(cardIds.size).toBe(foodCourse.cards.length);
    expect(wordCards).toHaveLength(12);
    expect(sentenceCards).toHaveLength(4);
    expect(foodCourse.cards).toHaveLength(16);
  });

  it('defines short sentence objectives', () => {
    expect(foodCourse.objectives.sentences).toEqual(['This is an apple.', 'I like milk.', 'I want water.', 'I eat rice.']);
    expect(sentenceCards.map((card) => card.english)).toEqual(foodCourse.objectives.sentences);
    expect(sentenceCards.map((card) => card.imageUrl)).toEqual([
      '/images/food/apple.png',
      '/images/food/milk.png',
      '/images/food/water.png',
      '/images/food/rice.png',
    ]);
  });

  it('quiz references only valid card ids and uses real repeat sentences', () => {
    for (const quiz of foodCourse.phases.reinforcement.quizzes) {
      if (quiz.type === 'pick-word') {
        expect(cardIds.has(quiz.correctCardId)).toBe(true);
        expect(wordCardIds.has(quiz.correctCardId)).toBe(true);
        for (const id of quiz.distractorCardIds) {
          expect(cardIds.has(id)).toBe(true);
          expect(wordCardIds.has(id)).toBe(true);
        }
      } else {
        expect(cardIds.has(quiz.cardId)).toBe(true);
        expect(sentenceCardIds.has(quiz.cardId)).toBe(true);
        expect(quiz.targetText).toMatch(/[.!?]$/);
        expect(quiz.targetText).not.toMatch(/^Say\s+\w+\.?$/i);
        expect(foodCourse.cards.find((card) => card.id === quiz.cardId)?.english).toBe(quiz.targetText);
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

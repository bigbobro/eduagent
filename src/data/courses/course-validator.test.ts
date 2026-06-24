import { describe, expect, it } from 'vitest';
import { animalsCourse } from './animals';
import { validateCourse } from './course-validator';

const clone = () => structuredClone(animalsCourse);

describe('validateCourse', () => {
  it('accepts a well-formed course', () => {
    expect(validateCourse(animalsCourse)).toEqual([]);
  });

  it('flags a missing word card (cardinality)', () => {
    const c = clone();
    const firstWordIdx = c.cards.findIndex((card) => card.kind === 'word');
    c.cards.splice(firstWordIdx, 1);
    expect(validateCourse(c).some((p) => p.includes('expected 12 word cards'))).toBe(true);
  });

  it('flags a blank drillPart', () => {
    const c = clone();
    c.cards[0].drillParts = ['ok', '   '];
    expect(validateCourse(c).some((p) => p.includes('drillParts has a blank entry'))).toBe(true);
  });

  it('flags a duplicate card id', () => {
    const c = clone();
    c.cards[1].id = c.cards[0].id;
    expect(validateCourse(c).some((p) => p.includes('duplicate card id'))).toBe(true);
  });

  it('flags a pick-word quiz whose distractors include the correct card', () => {
    const c = clone();
    const quiz = c.phases.reinforcement.quizzes.find((q) => q.type === 'pick-word');
    if (quiz && quiz.type === 'pick-word') {
      quiz.distractorCardIds = [quiz.correctCardId, quiz.distractorCardIds[0]];
    }
    expect(validateCourse(c).some((p) => p.includes('distractors must exclude correctCardId'))).toBe(true);
  });

  it('flags a sentence card that does not reuse its target word image', () => {
    const c = clone();
    const sentenceCard = c.cards.find((card) => card.kind === 'sentence');
    if (sentenceCard) sentenceCard.imageUrl = '/courses/__not-the-target__.png';
    expect(validateCourse(c).some((p) => p.includes('must reuse target word'))).toBe(true);
  });

  it('flags a repeat-after-me targetText missing terminal punctuation', () => {
    const c = clone();
    const quiz = c.phases.reinforcement.quizzes.find((q) => q.type === 'repeat-after-me');
    if (quiz && quiz.type === 'repeat-after-me') {
      quiz.targetText = quiz.targetText.replace(/[.!?]+$/, '');
    }
    expect(validateCourse(c).some((p) => p.includes('targetText must end with'))).toBe(true);
  });
});

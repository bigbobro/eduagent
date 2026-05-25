import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { allCourses } from '.';

const publicDir = path.join(process.cwd(), 'public');

describe('course drill data', () => {
  function sentenceUsesCourseWord(sentence: string, words: string[]): boolean {
    const normalized = sentence.toLowerCase().replace(/[^a-z\s-]/g, ' ');
    return words.some((word) => normalized.split(/\s+/).includes(word.toLowerCase()));
  }

  function targetWordCardForSentence(sentence: string, wordCards: typeof allCourses[number]['cards']) {
    const normalized = sentence.toLowerCase().replace(/[^a-z\s-]/g, ' ');
    const sentenceWords = normalized.split(/\s+/);
    return wordCards.find((card) => sentenceWords.includes(card.english.toLowerCase()));
  }

  it('registers the visible test course catalog', () => {
    expect(allCourses.map((course) => course.id)).toEqual([
      'food',
      'colors',
      'sports',
      'animals',
      'family',
      'toys',
      'clothes',
      'weather',
      'body',
      'shapes',
      'home',
      'nature',
      'actions',
      'school',
      'fruits',
      'vegetables',
      'ocean',
      'farm',
      'jobs',
      'insects',
      'feelings',
      'playground',
      'opposites',
      'instruments',
      'party',
      'bathroom',
      'space',
      'hobbies',
      'magic',
      'treats',
    ]);
  });

  it('defines non-empty drillParts for every card', () => {
    for (const course of allCourses) {
      for (const card of course.cards) {
        expect(card.drillParts, `${course.id}/${card.id}`).toBeDefined();
        expect(card.drillParts.length, `${course.id}/${card.id}`).toBeGreaterThan(0);
        expect(card.drillParts.every((part) => part.trim().length > 0), `${course.id}/${card.id}`).toBe(true);
        expect((card.asrAliases || []).every((alias) => alias.trim().length > 0), `${course.id}/${card.id} asrAliases`).toBe(true);
      }
    }
  });

  it('keeps every course card and quiz reference valid', () => {
    for (const course of allCourses) {
      const wordCards = course.cards.filter((card) => card.kind === 'word');
      const sentenceCards = course.cards.filter((card) => card.kind === 'sentence');
      const cardIds = new Set(course.cards.map((card) => card.id));
      const wordCardIds = new Set(wordCards.map((card) => card.id));
      const sentenceCardIds = new Set(sentenceCards.map((card) => card.id));
      const words = wordCards.map((card) => card.english);
      const sentenceCardTexts = sentenceCards.map((card) => card.english);

      expect(cardIds.size, course.id).toBe(course.cards.length);
      expect(wordCards.length, `${course.id} word cards`).toBe(12);
      expect(sentenceCards.length, `${course.id} sentence cards`).toBe(4);
      expect(course.cards.length, `${course.id} total cards`).toBe(16);
      expect(course.objectives.sentences.length, course.id).toBe(4);
      expect(course.objectives.sentences.every((sentence) => sentenceUsesCourseWord(sentence, words)), course.id).toBe(true);
      expect(sentenceCardTexts, `${course.id} sentence card text`).toEqual(course.objectives.sentences);
      for (const card of sentenceCards) {
        const targetWordCard = targetWordCardForSentence(card.english, wordCards);
        expect(targetWordCard, `${course.id}/${card.id} target word`).toBeDefined();
        expect(card.imageUrl, `${course.id}/${card.id} reuses target word image`).toBe(targetWordCard?.imageUrl);
      }
      expect(course.phases.introduction.sceneCaption, course.id).toBeTruthy();
      expect(course.phases.introduction.narrationHint, course.id).toBeTruthy();
      expect(course.phases.reinforcement.quizzes.filter((quiz) => quiz.type === 'pick-word').length, course.id).toBeGreaterThanOrEqual(4);
      expect(course.phases.reinforcement.quizzes.filter((quiz) => quiz.type === 'repeat-after-me').length, course.id).toBe(4);

      for (const card of course.cards) {
        expect(card.imageUrl.endsWith('.png'), `${course.id}/${card.id} should use a PNG`).toBe(true);
        expect(fs.existsSync(path.join(publicDir, card.imageUrl)), `${course.id}/${card.id} image exists`).toBe(true);
      }

      for (const quiz of course.phases.reinforcement.quizzes) {
        if (quiz.type === 'pick-word') {
          expect(cardIds.has(quiz.correctCardId), `${course.id}/${quiz.id} correctCardId`).toBe(true);
          expect(wordCardIds.has(quiz.correctCardId), `${course.id}/${quiz.id} correctCardId is word`).toBe(true);
          expect(quiz.distractorCardIds.length, `${course.id}/${quiz.id} distractors`).toBeGreaterThanOrEqual(2);
          expect(quiz.distractorCardIds.includes(quiz.correctCardId), `${course.id}/${quiz.id} distractors exclude correct`).toBe(false);
          for (const id of quiz.distractorCardIds) {
            expect(cardIds.has(id), `${course.id}/${quiz.id}/${id}`).toBe(true);
            expect(wordCardIds.has(id), `${course.id}/${quiz.id}/${id} is word`).toBe(true);
          }
        } else {
          expect(cardIds.has(quiz.cardId), `${course.id}/${quiz.id} cardId`).toBe(true);
          expect(sentenceCardIds.has(quiz.cardId), `${course.id}/${quiz.id} cardId is sentence`).toBe(true);
          expect(quiz.targetText, `${course.id}/${quiz.id} targetText`).toMatch(/[.!?]$/);
          expect(quiz.targetText, `${course.id}/${quiz.id} targetText`).not.toMatch(/^Say\s+\w+\.?$/i);
          expect(course.objectives.sentences, `${course.id}/${quiz.id} targetText`).toContain(quiz.targetText);
          expect(course.cards.find((card) => card.id === quiz.cardId)?.english, `${course.id}/${quiz.id} sentence card text`).toBe(quiz.targetText);
        }
      }
    }
  });
});

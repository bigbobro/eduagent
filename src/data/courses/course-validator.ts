import fs from 'fs';
import path from 'path';
import { Course, WordCard } from '@/types/course';

export type CourseProblem = string;

/**
 * The single, importable definition of a well-formed course.
 *
 * Pure (no filesystem). Encodes the structural contract that previously lived only
 * inside course-data.test.ts: cardinality (12 word + 4 sentence = 16), unique ids,
 * non-empty drillParts/asrAliases, sentence cards reusing their target word image,
 * quiz linkage, and the introduction/reinforcement phase shape. Filesystem-backed
 * asset existence lives separately in validateCourseAssets.
 */
export function validateCourse(course: Course): CourseProblem[] {
  const problems: CourseProblem[] = [];
  const at = (suffix: string) => `${course.id}${suffix}`;

  const wordCards = course.cards.filter((c) => c.kind === 'word');
  const sentenceCards = course.cards.filter((c) => c.kind === 'sentence');
  const cardIds = new Set(course.cards.map((c) => c.id));
  const wordCardIds = new Set(wordCards.map((c) => c.id));
  const sentenceCardIds = new Set(sentenceCards.map((c) => c.id));
  const words = wordCards.map((c) => c.english);

  // Cardinality + id uniqueness.
  if (cardIds.size !== course.cards.length) problems.push(at(`: duplicate card id (${cardIds.size} unique of ${course.cards.length})`));
  if (wordCards.length !== 12) problems.push(at(`: expected 12 word cards, got ${wordCards.length}`));
  if (sentenceCards.length !== 4) problems.push(at(`: expected 4 sentence cards, got ${sentenceCards.length}`));
  if (course.cards.length !== 16) problems.push(at(`: expected 16 total cards, got ${course.cards.length}`));

  // Per-card: drillParts, asrAliases, image extension.
  for (const card of course.cards) {
    if (!card.drillParts || card.drillParts.length === 0) {
      problems.push(at(`/${card.id}: drillParts is empty`));
    } else if (!card.drillParts.every((part) => part.trim().length > 0)) {
      problems.push(at(`/${card.id}: drillParts has a blank entry`));
    }
    if ((card.asrAliases || []).some((alias) => alias.trim().length === 0)) {
      problems.push(at(`/${card.id}: asrAliases has a blank entry`));
    }
    if (!card.imageUrl.endsWith('.png')) {
      problems.push(at(`/${card.id}: imageUrl must be a .png`));
    }
  }

  // Objectives ↔ sentence cards.
  if (course.objectives.sentences.length !== 4) {
    problems.push(at(`: expected 4 objective sentences, got ${course.objectives.sentences.length}`));
  }
  for (const sentence of course.objectives.sentences) {
    if (!sentenceUsesCourseWord(sentence, words)) {
      problems.push(at(`: objective sentence does not use a course word: "${sentence}"`));
    }
  }
  const sentenceCardTexts = sentenceCards.map((c) => c.english);
  if (!arraysEqual(sentenceCardTexts, course.objectives.sentences)) {
    problems.push(at(`: sentence card texts do not match objectives.sentences`));
  }
  for (const card of sentenceCards) {
    const targetWordCard = targetWordCardForSentence(card.english, wordCards);
    if (!targetWordCard) {
      problems.push(at(`/${card.id}: no course word found in sentence "${card.english}"`));
    } else if (card.imageUrl !== targetWordCard.imageUrl) {
      problems.push(at(`/${card.id}: imageUrl must reuse target word (${targetWordCard.id}) image`));
    }
  }

  // Introduction phase.
  if (!course.phases.introduction.sceneCaption) problems.push(at(`: introduction.sceneCaption is empty`));
  if (!course.phases.introduction.narrationHint) problems.push(at(`: introduction.narrationHint is empty`));

  // Reinforcement quizzes.
  const quizzes = course.phases.reinforcement.quizzes;
  const pickWordCount = quizzes.filter((q) => q.type === 'pick-word').length;
  const repeatCount = quizzes.filter((q) => q.type === 'repeat-after-me').length;
  if (pickWordCount < 4) problems.push(at(`: expected >=4 pick-word quizzes, got ${pickWordCount}`));
  if (repeatCount !== 4) problems.push(at(`: expected 4 repeat-after-me quizzes, got ${repeatCount}`));

  for (const quiz of quizzes) {
    if (quiz.type === 'pick-word') {
      if (!cardIds.has(quiz.correctCardId)) problems.push(at(`/${quiz.id}: correctCardId ${quiz.correctCardId} is not a card`));
      else if (!wordCardIds.has(quiz.correctCardId)) problems.push(at(`/${quiz.id}: correctCardId ${quiz.correctCardId} is not a word card`));
      if (quiz.distractorCardIds.length < 2) problems.push(at(`/${quiz.id}: expected >=2 distractors, got ${quiz.distractorCardIds.length}`));
      if (quiz.distractorCardIds.includes(quiz.correctCardId)) problems.push(at(`/${quiz.id}: distractors must exclude correctCardId`));
      for (const id of quiz.distractorCardIds) {
        if (!cardIds.has(id)) problems.push(at(`/${quiz.id}: distractor ${id} is not a card`));
        else if (!wordCardIds.has(id)) problems.push(at(`/${quiz.id}: distractor ${id} is not a word card`));
      }
    } else {
      if (!cardIds.has(quiz.cardId)) problems.push(at(`/${quiz.id}: cardId ${quiz.cardId} is not a card`));
      else if (!sentenceCardIds.has(quiz.cardId)) problems.push(at(`/${quiz.id}: cardId ${quiz.cardId} is not a sentence card`));
      if (!/[.!?]$/.test(quiz.targetText)) problems.push(at(`/${quiz.id}: targetText must end with . ! or ?`));
      if (/^Say\s+\w+\.?$/i.test(quiz.targetText)) problems.push(at(`/${quiz.id}: targetText must not be a bare "Say <word>"`));
      if (!course.objectives.sentences.includes(quiz.targetText)) problems.push(at(`/${quiz.id}: targetText not in objectives.sentences`));
      const sentenceCard = course.cards.find((c) => c.id === quiz.cardId);
      if (sentenceCard && sentenceCard.english !== quiz.targetText) {
        problems.push(at(`/${quiz.id}: sentence card text does not equal targetText`));
      }
    }
  }

  return problems;
}

/** Filesystem-backed: every card image exists under publicDir (default <cwd>/public). */
export function validateCourseAssets(
  course: Course,
  publicDir: string = path.join(process.cwd(), 'public'),
): CourseProblem[] {
  const problems: CourseProblem[] = [];
  for (const card of course.cards) {
    if (!fs.existsSync(path.join(publicDir, card.imageUrl))) {
      problems.push(`${course.id}/${card.id}: image not found at ${card.imageUrl}`);
    }
  }
  return problems;
}

function sentenceUsesCourseWord(sentence: string, words: string[]): boolean {
  const normalized = sentence.toLowerCase().replace(/[^a-z\s-]/g, ' ');
  const sentenceWords = normalized.split(/\s+/);
  return words.some((word) => sentenceWords.includes(word.toLowerCase()));
}

function targetWordCardForSentence(sentence: string, wordCards: WordCard[]): WordCard | undefined {
  const normalized = sentence.toLowerCase().replace(/[^a-z\s-]/g, ' ');
  const sentenceWords = normalized.split(/\s+/);
  return wordCards.find((card) => sentenceWords.includes(card.english.toLowerCase()));
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

import type { Course, Quiz } from '@/types/course';
type RepeatAfterMeQuiz = Extract<Quiz, { type: 'repeat-after-me' }>;

interface RepeatAfterMeScoring {
  contentWords: string[];
  coreWords: string[];
}

export function buildRepeatAfterMePrompt(targetText: string): string {
  const sentence = targetText.trim();
  const words = extractEnglishWords(sentence);
  if (!sentence || words.length <= 1) return sentence;

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 2) {
    chunks.push(words.slice(i, i + 2).join(' '));
  }
  return `${sentence} 慢一点: ${chunks.map((chunk) => `${chunk}.`).join(' ')} ${sentence}`;
}

export function buildRepeatAfterMeScoring(quiz: RepeatAfterMeQuiz, course: Course): RepeatAfterMeScoring {
  const targetWords = uniqueWords(extractEnglishWords(quiz.targetText).map((word) => word.toLowerCase()));
  const contentWords = targetWords.filter((word) => !SENTENCE_HELPER_WORDS.has(word));
  const linkedWordId = quiz.cardId.startsWith('sentence_') ? quiz.cardId.slice('sentence_'.length) : '';
  const linkedWordCard = course.cards.find((item) => item.kind === 'word' && item.id === linkedWordId);
  const coreWords = linkedWordCard
    ? uniqueWords(extractEnglishWords(linkedWordCard.english).map((word) => word.toLowerCase()))
    : [];

  return {
    contentWords: contentWords.length > 0 ? contentWords : targetWords,
    coreWords,
  };
}

export function isRepeatAfterMeCorrect(scoring: RepeatAfterMeScoring, saidText: string): boolean {
  const saidWords = new Set(extractEnglishWords(saidText).map((word) => word.toLowerCase()));
  if (saidWords.size === 0) return false;

  const coreMatched = scoring.coreWords.length === 0
    || scoring.coreWords.every((word) => saidWords.has(word));
  if (!coreMatched) return false;

  const matchedContentCount = scoring.contentWords.filter((word) => saidWords.has(word)).length;
  const requiredContentCount = Math.min(2, scoring.contentWords.length);
  return matchedContentCount >= requiredContentCount;
}

const SENTENCE_HELPER_WORDS = new Set(['a', 'an', 'the', 'i']);

function extractEnglishWords(text: string): string[] {
  return text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)?/g) ?? [];
}

function uniqueWords(words: string[]): string[] {
  return Array.from(new Set(words));
}

export function getRetryPrompt(quiz: Quiz): string {
  return quiz.type === 'pick-word' ? quiz.prompt : quiz.targetText;
}

export function buildPickWordPromptText(quiz: Extract<Quiz, { type: 'pick-word' }>, course: Course): string {
  const correct = course.cards.find((card) => card.id === quiz.correctCardId);
  return `${quiz.prompt} ${correct?.english ?? quiz.correctCardId}.`;
}

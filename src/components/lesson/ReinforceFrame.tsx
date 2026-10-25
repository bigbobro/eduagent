'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Course, Quiz } from '@/types/course';
import type { LessonController } from '@/lib/voice/lesson-controller';
import { LessonCard } from './LessonCard';
import { PushToTalkPill } from '@/components/ui/PushToTalkPill';
import { talkState } from './talkState';
import { useStaticPromptSpeech } from './useStaticPromptSpeech';

type RepeatAfterMeQuiz = Extract<Quiz, { type: 'repeat-after-me' }>;

interface ReinforceFrameProps {
  disabled?: boolean;
  quiz: RepeatAfterMeQuiz;
  course: Course;
  controller: LessonController;
  onAnswer: (result: { correct: boolean; said: string }) => void;
}

interface RepeatAfterMeScoring {
  contentWords: string[];
  coreWords: string[];
}

export function ReinforceFrame({ quiz, course, controller, onAnswer, disabled = false }: ReinforceFrameProps) {
  const [listening, setListening] = useState(false);
  const [heardSentence, setHeardSentence] = useState(false);
  const spokenPrompt = useMemo(() => buildRepeatAfterMePrompt(quiz.targetText), [quiz.targetText]);
  const { state, promptPlaying, hasHeardPrompt } = useStaticPromptSpeech(controller, spokenPrompt, quiz.id);
  const card = course.cards.find((item) => item.id === quiz.cardId);
  const scoring = useMemo(() => buildRepeatAfterMeScoring(quiz, course), [course, quiz]);
  // ASR 热词候选句:当前 quiz 句在前,同组其余 repeat-after-me 句作次级候选
  // (孩子偶尔会读到别的句子;proxy 端按顺序注入 corpus.context)。
  const asrSentenceTexts = useMemo(() => {
    const siblings = course.phases.reinforcement.quizzes
      .filter((item): item is Extract<Quiz, { type: 'repeat-after-me' }> => item.type === 'repeat-after-me')
      .map((item) => item.targetText)
      .filter((text) => text !== quiz.targetText);
    return [quiz.targetText, ...siblings];
  }, [course, quiz.targetText]);
  const canHold = !disabled && (state === 'awaiting' || state === 'listening') && hasHeardPrompt && !promptPlaying;

  // Keep the asr-final subscription tied to `controller` only. The parent passes a fresh
  // onAnswer every render (it closes over quiz index / retries), so depending on it here would
  // detach + reattach the listener on every render. Read the latest values from refs instead.
  const onAnswerRef = useRef(onAnswer);
  const scoringRef = useRef(scoring);
  useEffect(() => {
    onAnswerRef.current = onAnswer;
    scoringRef.current = scoring;
  });

  useEffect(() => {
    const onFinal = (event: { text: string }) => {
      const correct = isRepeatAfterMeCorrect(scoringRef.current, event.text);
      if (correct) setHeardSentence(true);
      onAnswerRef.current({ correct, said: event.text });
    };
    controller.on('asr-final', onFinal);
    return () => {
      controller.off('asr-final', onFinal);
    };
  }, [controller]);

  useEffect(() => {
    setListening(false);
    setHeardSentence(false);
  }, [quiz.id]);

  const start = () => {
    if (!canHold) return;
    setListening(true);
    controller.startListening({ routeToChat: false, asrSentenceTexts });
  };
  const stop = () => {
    setListening(false);
    controller.stopListening();
  };
  return <section className="p2-stage">
    {card && <LessonCard card={{ ...card, english: quiz.targetText }} state={listening ? 'recording' : heardSentence ? 'correct' : 'listening'} />}
    <div className="p2-dock"><PushToTalkPill state={canHold ? listening ? 'listening' : talkState(state) : state === 'awaiting' ? 'preparing' : talkState(state)} onPress={start} onRelease={stop} /></div>
  </section>;
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

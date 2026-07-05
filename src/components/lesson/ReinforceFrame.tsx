'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSpacebar } from '@/hooks/useSpacebar';
import type { Course, Quiz } from '@/types/course';
import type { LessonController } from '@/lib/voice/lesson-controller';
import { Cat, PaperButton, PictureCard } from '@/components/magic';
import { toPictureCardData } from '@/components/magic/cardData';
import { useStaticPromptSpeech } from './useStaticPromptSpeech';

type RepeatAfterMeQuiz = Extract<Quiz, { type: 'repeat-after-me' }>;

interface ReinforceFrameProps {
  quiz: RepeatAfterMeQuiz;
  course: Course;
  controller: LessonController;
  onAnswer: (result: { correct: boolean; said: string }) => void;
}

interface RepeatAfterMeScoring {
  contentWords: string[];
  coreWords: string[];
}

export function ReinforceFrame({ quiz, course, controller, onAnswer }: ReinforceFrameProps) {
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
  const canHold = (state === 'awaiting' || state === 'listening') && hasHeardPrompt && !promptPlaying;
  const catMood = promptPlaying || state === 'quiz-speaking' ? 'speaking' : heardSentence ? 'cheer' : 'happy';

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
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canHold) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    start();
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stop();
  };

  useSpacebar({ enabled: canHold, onDown: start, onUp: stop });

  return (
    <div className="grid h-full w-full grid-cols-[1fr_320px] gap-7 bg-paperDeep px-8 py-8 text-ink">
      <section className="flex flex-col justify-center gap-7">
        <div className="rounded-paper-lg border-[2.4px] border-ink bg-paper p-8 text-center shadow-paper-hero">
          <div className="font-en text-[54px] font-bold leading-tight">{quiz.targetText}</div>
          <div className="mt-4 font-display text-3xl text-inkSoft">{card?.chinese ?? '跟读这个短句'}</div>
        </div>
        {card && (
          <PictureCard
            card={toPictureCardData(card, course.tone)}
            state={heardSentence ? 'correct' : 'listening'}
          />
        )}
        <div className="grid grid-cols-4 gap-3">
          {course.cards.filter((item) => item.kind === 'sentence').map((item) => (
            <PictureCard
              key={item.id}
              card={toPictureCardData(item, course.tone)}
              size="chip"
              state={item.id === card?.id ? (heardSentence ? 'correct' : 'selected') : 'idle'}
            />
          ))}
        </div>
      </section>
      <aside className="flex flex-col gap-4">
        <div className="rounded-paper-lg border-2 border-ink bg-paper p-4 shadow-paper">
          <Cat size={150} mood={catMood} />
          <div className="mt-2 rounded-paper-lg border-2 border-ink bg-butter p-3 font-zh text-base leading-snug">跟着图片说出这个短句</div>
        </div>
        <PaperButton
          color={listening ? 'mint' : 'butter'}
          disabled={!canHold}
          aria-pressed={listening}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          按住 Space
        </PaperButton>
      </aside>
    </div>
  );
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

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Course, Quiz, WordCard } from '@/types/course';
import type { LessonController } from '@/lib/voice/lesson-controller';
import Image from 'next/image';
import { Check } from 'lucide-react';
import { useStaticPromptSpeech } from './useStaticPromptSpeech';

interface QuizPickWordFrameProps {
  disabled?: boolean;
  attempt?: number;
  quiz: Extract<Quiz, { type: 'pick-word' }>;
  course: Course;
  controller: LessonController;
  onAnswer: (result: { correct: boolean; picked: string }) => void;
}

export function QuizPickWordFrame({ quiz, course, controller, onAnswer, disabled = false, attempt = 0 }: QuizPickWordFrameProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Synchronous guard: a fast double-click fires two onClicks before selectedId re-renders,
  // so gate on a ref to ensure onAnswer fires at most once per quiz.
  const answeredRef = useRef(false);
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const options = useMemo(() => buildOptions(wordCards, quiz), [wordCards, quiz]);
  const promptText = useMemo(() => buildPickWordPromptText(quiz, course), [course, quiz]);
  const { state, promptPlaying } = useStaticPromptSpeech(controller, promptText, quiz.id);
  const locked = disabled || promptPlaying || state === 'quiz-speaking';

  useEffect(() => {
    setSelectedId(null);
    answeredRef.current = false;
  }, [quiz.id, attempt]);

  return <section className="p2-quiz">
    <div className="p2-ask"><b>{quiz.prompt}</b><span>听一听,点出老师说的那张卡</span></div>
    <div className="p2-options">{options.map(card => {
      const selected = selectedId === card.id;
      const correct = selected && card.id === quiz.correctCardId;
      const wrong = selected && !correct;
      return <button key={card.id} type="button" aria-label={`${card.english} ${card.chinese}`} disabled={locked} data-picture-card-size="tile" data-picture-card-state={correct ? 'correct' : wrong ? 'wrong' : 'idle'} className={`p2-option p2-card ${card.english.length >= 14 ? 'p2-extra-long' : card.english.length >= 11 ? 'p2-long' : ''} ${correct ? 'p2-right' : ''} ${wrong ? 'p2-wrong' : ''}`} onClick={() => {
        if (locked || answeredRef.current) return;
        answeredRef.current = true;
        setSelectedId(card.id);
        onAnswer({ correct: card.id === quiz.correctCardId, picked: card.id });
      }}><div className="p2-option-pic"><Image src={card.imageUrl} alt="" fill sizes="280px" unoptimized /></div><div><b>{card.english}</b><small>{card.chinese}</small>{correct && <span className="p2-check" aria-label="答对了"><Check size={16} strokeWidth={3} /></span>}</div></button>;
    })}</div>
  </section>;
}

export function buildPickWordPromptText(quiz: Extract<Quiz, { type: 'pick-word' }>, course: Course): string {
  const correct = course.cards.find((card) => card.id === quiz.correctCardId);
  const english = correct?.english ?? quiz.correctCardId;
  return `${quiz.prompt} ${english}.`;
}

function buildOptions(cards: WordCard[], quiz: Extract<Quiz, { type: 'pick-word' }>): WordCard[] {
  const ids = [quiz.correctCardId, ...quiz.distractorCardIds];
  for (const card of cards) {
    if (ids.length >= 4) break;
    if (!ids.includes(card.id)) ids.push(card.id);
  }
  return ids.map((id) => cards.find((card) => card.id === id)).filter(Boolean) as WordCard[];
}

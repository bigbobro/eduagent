'use client';

import { useMemo } from 'react';
import { Course, Quiz, WordCard } from '@/types/course';

interface QuizPickWordProps {
  quiz: Extract<Quiz, { type: 'pick-word' }>;
  course: Course;
  onAnswer: (result: { correct: boolean; picked: string }) => void;
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function QuizPickWord({ quiz, course, onAnswer }: QuizPickWordProps) {
  const options = useMemo<WordCard[]>(() => {
    const ids = [quiz.correctCardId, ...quiz.distractorCardIds];
    return shuffle(ids.map((id) => course.cards.find((card) => card.id === id)).filter(Boolean) as WordCard[]);
  }, [course.cards, quiz.correctCardId, quiz.distractorCardIds]);

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <h2 className="font-en text-2xl text-bunny-ink">{quiz.prompt}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {options.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onAnswer({ correct: card.id === quiz.correctCardId, picked: card.id })}
            className="w-36 h-40 bg-white border-2 border-bunny-pink-soft rounded-bunny-lg hover:scale-105 hover:border-bunny-pink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-bunny-pink/60 transition-transform flex flex-col items-center justify-center gap-2 p-3"
            aria-label={`${card.chinese} ${card.english}`}
          >
            <img src={card.imageUrl} alt="" aria-hidden="true" className="w-24 h-24 object-contain" />
            <span className="text-center leading-tight">
              <span className="block font-zh text-base text-bunny-ink-soft">{card.chinese}</span>
              <span className="block font-en text-xl font-bold text-bunny-ink">{card.english}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

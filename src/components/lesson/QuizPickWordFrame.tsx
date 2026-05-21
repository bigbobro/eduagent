'use client';

import { useMemo, useState } from 'react';
import type { Course, Quiz, WordCard } from '@/types/course';
import { Cat, PictureCard } from '@/components/magic';
import { toPictureCardData } from '@/components/magic/cardData';

interface QuizPickWordFrameProps {
  quiz: Extract<Quiz, { type: 'pick-word' }>;
  course: Course;
  onAnswer: (result: { correct: boolean; picked: string }) => void;
}

export function QuizPickWordFrame({ quiz, course, onAnswer }: QuizPickWordFrameProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const options = useMemo(() => buildOptions(wordCards, quiz), [wordCards, quiz]);

  return (
    <div className="grid h-full w-full grid-cols-[1fr_320px] gap-7 bg-paperDeep px-8 py-8 text-ink">
      <section className="grid grid-cols-2 gap-5">
        {options.map((card) => {
          const selected = selectedId === card.id;
          const correct = selected && card.id === quiz.correctCardId;
          const wrong = selected && card.id !== quiz.correctCardId;
          return (
            <PictureCard
              key={card.id}
              card={toPictureCardData(card, course.tone)}
              size="tile"
              state={correct ? 'correct' : wrong ? 'wrong' : selected ? 'selected' : 'idle'}
              onClick={() => {
                setSelectedId(card.id);
                onAnswer({ correct: card.id === quiz.correctCardId, picked: card.id });
              }}
              className="min-h-[230px]"
            />
          );
        })}
      </section>
      <aside className="flex flex-col gap-4">
        <div className="rounded-paper-lg border-2 border-ink bg-paper p-4 shadow-paper">
          <Cat size={150} mood="happy" />
          <div className="mt-2 rounded-paper-lg border-2 border-ink bg-butter p-3 font-zh text-base leading-snug">{quiz.prompt}</div>
        </div>
        <div className="rounded-paper-lg border-2 border-ink bg-paper p-4 font-zh text-sm text-inkSoft shadow-paper">
          看一看,选出老师说的那张卡。
        </div>
      </aside>
    </div>
  );
}

function buildOptions(cards: WordCard[], quiz: Extract<Quiz, { type: 'pick-word' }>): WordCard[] {
  const ids = [quiz.correctCardId, ...quiz.distractorCardIds];
  for (const card of cards) {
    if (ids.length >= 4) break;
    if (!ids.includes(card.id)) ids.push(card.id);
  }
  return ids.map((id) => cards.find((card) => card.id === id)).filter(Boolean) as WordCard[];
}

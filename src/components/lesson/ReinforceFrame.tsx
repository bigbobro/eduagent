'use client';

import { useEffect, useState } from 'react';
import { useSpacebar } from '@/hooks/useSpacebar';
import type { Course, Quiz } from '@/types/course';
import { LessonController, type LessonStateName } from '@/lib/voice/lesson-controller';
import { Cat, PaperButton, PictureCard } from '@/components/magic';
import { toPictureCardData } from '@/components/magic/cardData';

interface ReinforceFrameProps {
  quiz: Extract<Quiz, { type: 'repeat-after-me' }>;
  course: Course;
  controller: LessonController;
  onAnswer: (result: { correct: boolean; said: string }) => void;
}

export function ReinforceFrame({ quiz, course, controller, onAnswer }: ReinforceFrameProps) {
  const [state, setState] = useState<LessonStateName>(controller.getState());
  const [listening, setListening] = useState(false);
  const [filledWord, setFilledWord] = useState<string | null>(null);
  const card = course.cards.find((item) => item.id === quiz.cardId);
  const targetWord = card?.english.toLowerCase() ?? '';
  const canHold = state === 'awaiting' || state === 'listening';

  useEffect(() => {
    const onState = (next: LessonStateName) => setState(next);
    const onFinal = (event: { text: string }) => {
      if (!targetWord) return;
      const said = event.text.toLowerCase();
      const correct = said.includes(targetWord);
      if (correct && card) setFilledWord(card.english);
      onAnswer({ correct, said: event.text });
    };
    controller.on('state', onState);
    controller.on('asr-final', onFinal);
    return () => {
      controller.off('state', onState);
      controller.off('asr-final', onFinal);
    };
  }, [card, controller, onAnswer, targetWord]);

  const start = () => {
    if (!canHold) return;
    setListening(true);
    controller.startListening();
  };
  const stop = () => {
    setListening(false);
    controller.stopListening();
  };

  useSpacebar({ enabled: canHold, onDown: start, onUp: stop });

  return (
    <div className="grid h-full w-full grid-cols-[1fr_320px] gap-7 bg-paperDeep px-8 py-8 text-ink">
      <section className="flex flex-col justify-center gap-7">
        <div className="rounded-paper-lg border-[2.4px] border-ink bg-paper p-8 text-center shadow-paper-hero">
          <div className="font-en text-[72px] font-bold leading-tight">
            I like <span className={`inline-block min-w-[180px] rounded-paper-md border-2 border-dashed px-4 ${filledWord ? 'border-mintDeep bg-mint' : 'border-peachDeep bg-peach/50'}`}>
              {filledWord ?? '___'}
            </span>.
          </div>
          <div className="mt-4 font-display text-3xl text-inkSoft">我喜欢{filledWord ? ` ${card?.chinese ?? ''}` : '___'}。</div>
        </div>
        <div className="grid grid-cols-6 gap-3">
          {course.cards.map((item) => (
            <PictureCard
              key={item.id}
              card={toPictureCardData(item, course.tone)}
              size="chip"
              state={item.english === filledWord ? 'correct' : 'idle'}
            />
          ))}
        </div>
      </section>
      <aside className="flex flex-col gap-4">
        <div className="rounded-paper-lg border-2 border-ink bg-paper p-4 shadow-paper">
          <Cat size={150} mood={filledWord ? 'cheer' : 'happy'} />
          <div className="mt-2 rounded-paper-lg border-2 border-ink bg-butter p-3 font-zh text-base leading-snug">说一个你喜欢的食物</div>
        </div>
        <PaperButton
          color={listening ? 'mint' : 'butter'}
          disabled={!canHold}
          onPointerDown={start}
          onPointerUp={stop}
          onPointerCancel={stop}
          onPointerLeave={stop}
        >
          按住 Space
        </PaperButton>
      </aside>
    </div>
  );
}

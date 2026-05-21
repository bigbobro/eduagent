'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [heardSentence, setHeardSentence] = useState(false);
  const card = course.cards.find((item) => item.id === quiz.cardId);
  const targetWords = useMemo(
    () => quiz.targetText.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter((word) => word.length > 2),
    [quiz.targetText],
  );
  const canHold = state === 'awaiting' || state === 'listening';

  useEffect(() => {
    const onState = (next: LessonStateName) => setState(next);
    const onFinal = (event: { text: string }) => {
      const said = event.text.toLowerCase();
      const matchedCount = targetWords.filter((word) => said.includes(word)).length;
      const correct = matchedCount >= Math.min(2, targetWords.length);
      if (correct) setHeardSentence(true);
      onAnswer({ correct, said: event.text });
    };
    controller.on('state', onState);
    controller.on('asr-final', onFinal);
    return () => {
      controller.off('state', onState);
      controller.off('asr-final', onFinal);
    };
  }, [controller, onAnswer, targetWords]);

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
          <Cat size={150} mood={heardSentence ? 'cheer' : 'happy'} />
          <div className="mt-2 rounded-paper-lg border-2 border-ink bg-butter p-3 font-zh text-base leading-snug">跟着图片说出这个短句</div>
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

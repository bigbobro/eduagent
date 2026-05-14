'use client';

import { useEffect, useState } from 'react';
import { useSpacebar } from '@/hooks/useSpacebar';
import { Course, Quiz } from '@/types/course';
import { LessonController } from '@/lib/voice/lesson-controller';
import { BloomButton } from './BloomButton';

interface QuizRepeatAfterMeProps {
  quiz: Extract<Quiz, { type: 'repeat-after-me' }>;
  course: Course;
  controller: LessonController;
  onAnswer: (result: { correct: boolean; said: string }) => void;
}

export function QuizRepeatAfterMe({ quiz, course, controller, onAnswer }: QuizRepeatAfterMeProps) {
  const [listening, setListening] = useState(false);
  const [answered, setAnswered] = useState(false);
  const card = course.cards.find((item) => item.id === quiz.cardId);
  const targetWord = card?.english.toLowerCase() || '';

  useEffect(() => {
    const onFinal = (event: { text: string }) => {
      if (answered || !targetWord) return;
      const said = event.text.toLowerCase();
      setAnswered(true);
      onAnswer({ correct: said.includes(targetWord), said: event.text });
    };
    controller.on('asr-final', onFinal);
    return () => controller.off('asr-final', onFinal);
  }, [answered, controller, onAnswer, targetWord]);

  const start = () => {
    setListening(true);
    controller.startListening();
  };
  const stop = () => {
    setListening(false);
    controller.stopListening();
  };

  useSpacebar({ enabled: true, onDown: start, onUp: stop });

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <p className="font-zh text-xl text-bunny-ink-soft">跟着说:</p>
      <h2 className="font-en text-3xl text-bunny-ink">{quiz.targetText}</h2>
      {card && <img src={card.imageUrl} alt={card.english} className="w-32 h-32 object-contain mt-2" />}
      <BloomButton disabled={false} active={listening} onPressStart={start} onPressEnd={stop} />
    </div>
  );
}

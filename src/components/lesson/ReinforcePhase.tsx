'use client';

import { useState } from 'react';
import { Course } from '@/types/course';
import { LessonController } from '@/lib/voice/lesson-controller';
import { QuizPickWord } from './QuizPickWord';
import { QuizRepeatAfterMe } from './QuizRepeatAfterMe';

interface ReinforcePhaseProps {
  course: Course;
  controller: LessonController;
  sessionId: string;
  onAllDone: () => void;
}

export function ReinforcePhase({ course, controller, sessionId, onAllDone }: ReinforcePhaseProps) {
  const quizzes = course.phases.reinforcement.quizzes;
  const [idx, setIdx] = useState(0);
  const [retries, setRetries] = useState(0);
  const current = quizzes[idx];

  const handleAnswer = async (result: { correct: boolean; picked?: string; said?: string }) => {
    if (!current) return;
    const answer = result.picked || result.said || '';
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quiz-answer',
          sessionId,
          quizId: current.id,
          answer,
          correct: result.correct,
        }),
      });
    } catch {}

    if (result.correct || retries >= 2) {
      const next = idx + 1;
      if (next >= quizzes.length) {
        onAllDone();
      } else {
        setIdx(next);
        setRetries(0);
      }
    } else {
      setRetries((value) => value + 1);
    }
  };

  if (!current) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bunny-cream">
        <p className="font-zh text-xl text-bunny-ink">今天的练习完成啦</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-bunny-cream">
      <div className="mb-4 font-zh text-sm text-bunny-ink-soft">{idx + 1} / {quizzes.length}</div>
      {current.type === 'pick-word' ? (
        <QuizPickWord quiz={current} course={course} onAnswer={handleAnswer} />
      ) : (
        <QuizRepeatAfterMe quiz={current} course={course} controller={controller} onAnswer={handleAnswer} />
      )}
      <div className="mt-6 flex gap-2">
        {quizzes.map((quiz, i) => (
          <span
            key={quiz.id}
            className={`w-3 h-3 rounded-full ${i < idx ? 'bg-bunny-pink' : 'bg-bunny-cream-soft'}`}
          />
        ))}
      </div>
    </div>
  );
}

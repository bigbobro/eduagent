'use client';

import { useState } from 'react';
import type { Course } from '@/types/course';
import type { LessonController } from '@/lib/voice/lesson-controller';
import { QuizPickWordFrame } from './QuizPickWordFrame';
import { ReinforceFrame } from './ReinforceFrame';

interface ReinforcementFlowProps {
  course: Course;
  controller: LessonController;
  sessionId: string;
  onAllDone: () => void;
}

export function ReinforcementFlow({ course, controller, sessionId, onAllDone }: ReinforcementFlowProps) {
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
      <div className="flex h-full w-full items-center justify-center bg-paperDeep">
        <p className="font-zh text-xl text-ink">今天的练习完成啦</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-paperDeep">
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-paper-pill border-2 border-ink bg-paper px-4 py-2 font-zh text-sm text-inkSoft shadow-paper">
        {idx + 1} / {quizzes.length}
      </div>
      {current.type === 'pick-word' ? (
        <QuizPickWordFrame quiz={current} course={course} onAnswer={handleAnswer} />
      ) : (
        <ReinforceFrame quiz={current} course={course} controller={controller} onAnswer={handleAnswer} />
      )}
    </div>
  );
}

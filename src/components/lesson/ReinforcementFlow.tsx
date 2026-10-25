'use client';

import { useEffect, useRef, useState } from 'react';
import type { Course, Quiz } from '@/types/course';
import type { LessonController } from '@/lib/voice/lesson-controller';
import { QuizPickWordFrame } from './QuizPickWordFrame';
import { ReinforceFrame } from './ReinforceFrame';

type Answer = { correct: boolean; picked?: string; said?: string };

interface ReinforcementFlowProps {
  course: Course;
  controller: LessonController;
  // R1/R3 (2026-07-20 session persistence): quiz ids already answered correctly in a prior
  // session for this course — a resumed reinforcement phase starts at the first quiz NOT in
  // this list instead of always at quiz 0. Omitted/empty for a fresh lesson (today's default).
  passedQuizIds?: string[];
  onAllDone: () => void;
  onQuizChange?: (index: number) => void;
}

export function ReinforcementFlow({ course, controller, passedQuizIds = [], onAllDone, onQuizChange }: ReinforcementFlowProps) {
  const quizzes = course.phases.reinforcement.quizzes;
  const [idx, setIdx] = useState(() => {
    const firstUnpassed = quizzes.findIndex((quiz) => !passedQuizIds.includes(quiz.id));
    return firstUnpassed === -1 ? quizzes.length : firstUnpassed;
  });
  useEffect(() => { onQuizChange?.(idx); }, [idx, onQuizChange]);
  const [retries, setRetries] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failedAnswer, setFailedAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const submitting = useRef(false);
  const lifetime = useRef({ active: true });
  useEffect(() => {
    const owner = { active: true };
    lifetime.current = owner;
    return () => { owner.active = false; };
  }, [controller]);
  const current = quizzes[idx];

  const handleAnswer = async (result: Answer) => {
    if (!current || submitting.current) return;
    const generation = lifetime.current;
    submitting.current = true;
    setSaving(true);
    const saved = await controller.submitQuizAnswer(current.id, result.picked || result.said || '', result.correct);
    if (!generation.active) return;
    if (!saved.ok) {
      setFailedAnswer(result);
      setSaving(false);
      submitting.current = false;
      return;
    }
    setFailedAnswer(null);
    if (result.correct || retries >= 2) {
      const next = idx + 1;
      if (next >= quizzes.length) {
        onAllDone();
        return; // Keep the synchronous lock until the completed flow unmounts.
      }
      setIdx(next);
      setRetries(0);
    } else {
      await controller.speakStatic(`再听一次: ${getRetryPrompt(current)}`).catch(() => {});
      if (!generation.active) return;
      setRetries((value) => value + 1);
      setAttempt((value) => value + 1);
    }
    setSaving(false);
    submitting.current = false;
  };

  if (!current) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-xl">今天的练习完成啦</p>
      </div>
    );
  }

  return (
    <div className="p2-flow">
      {failedAnswer && (
        <div role="alert" className="p2-save-error ui-glass ui-banner">
          答案还没保存好,再试一次吧
          <button type="button" disabled={saving} onClick={() => void handleAnswer(failedAnswer)} className="ui-button ui-button-glass ui-button-sm">
            {saving ? '保存中…' : '重试保存'}
          </button>
        </div>
      )}
      {current.type === 'pick-word' ? (
        <QuizPickWordFrame attempt={attempt} disabled={saving || failedAnswer !== null} quiz={current} course={course} controller={controller} onAnswer={handleAnswer} />
      ) : (
        <ReinforceFrame disabled={saving || failedAnswer !== null} quiz={current} course={course} controller={controller} onAnswer={handleAnswer} />
      )}
    </div>
  );
}

export function getRetryPrompt(quiz: Quiz): string {
  return quiz.type === 'pick-word' ? quiz.prompt : quiz.targetText;
}

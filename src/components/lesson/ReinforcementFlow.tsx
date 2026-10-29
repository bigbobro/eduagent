'use client';

import { useEffect, useRef, useState } from 'react';
import type { Course } from '@/types/course';
import type { Classroom, QuizResult } from '@/lib/voice/classroom';
import { QuizPickWordFrame } from './QuizPickWordFrame';
import { ReinforceFrame } from './ReinforceFrame';

interface ReinforcementFlowProps {
  course: Course;
  controller: Classroom;
  passedQuizIds?: string[];
  onAllDone: () => void;
  onQuizChange?: (index: number) => void;
}

export function ReinforcementFlow({ course, controller, passedQuizIds = [], onAllDone, onQuizChange }: ReinforcementFlowProps) {
  const quizzes = course.phases.reinforcement.quizzes;
  const [idx, setIdx] = useState(() => {
    const first = quizzes.findIndex((quiz) => !passedQuizIds.includes(quiz.id));
    return first === -1 ? quizzes.length : first;
  });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const submitting = useRef(false);
  const done = useRef(false);
  const current = quizzes[idx];
  const onAllDoneRef = useRef(onAllDone);
  onAllDoneRef.current = onAllDone;
  useEffect(() => { onQuizChange?.(idx); }, [idx, onQuizChange]);
  useEffect(() => { if (current) controller.presented?.({ kind: 'quiz', id: current.id }); }, [controller, current]);
  useEffect(() => {
    if (!current && !done.current) {
      done.current = true;
      onAllDoneRef.current();
    }
  }, [current]);
  useEffect(() => {
    const onSaving = (busy: boolean) => { submitting.current = busy; setSaving(busy); };
    const onResult = (result: QuizResult) => {
      if (result.quizId !== current?.id) return;
      setFailed(!result.ok);
      setSaving(false);
      submitting.current = false;
      if (!result.ok) return;
      if (result.next === 'advance') {
        // Resume may contain non-contiguous passed quizzes; never repeat saved work.
        const next = quizzes.findIndex((quiz, index) => index > idx && !passedQuizIds.includes(quiz.id));
        setIdx(next < 0 ? quizzes.length : next);
      } else setAttempt((value) => value + 1);
    };
    controller.on('quiz-saving', onSaving);
    controller.on('quiz-result', onResult);
    return () => { controller.off('quiz-saving', onSaving); controller.off('quiz-result', onResult); };
  }, [controller, current?.id, idx, passedQuizIds, quizzes]);

  if (!current) return <div className="flex h-full w-full items-center justify-center"><p className="text-xl">今天的练习完成啦</p></div>;
  return <div className="p2-flow">
    {failed && <div role="alert" className="p2-save-error ui-glass ui-banner">
      答案还没保存好,再试一次吧
      <button type="button" disabled={saving} onClick={() => {
        if (submitting.current) return;
        submitting.current = true; setSaving(true);
        void controller.retryQuiz(current.id);
      }} className="ui-button ui-button-glass ui-button-sm">{saving ? '保存中…' : '重试保存'}</button>
    </div>}
    {current.type === 'pick-word'
      ? <QuizPickWordFrame attempt={attempt} disabled={saving || failed} quiz={current} course={course} controller={controller} onAnswer={({ picked }) => {
        if (submitting.current) return;
        submitting.current = true; setSaving(true);
        void controller.submitPick(current.id, picked);
      }} />
      : <ReinforceFrame disabled={saving || failed} quiz={current} course={course} controller={controller} />}
  </div>;
}

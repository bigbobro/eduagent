'use client';

import { useEffect, useState } from 'react';
import type { Course, Quiz } from '@/types/course';
import type { Classroom, QuizResult } from '@/lib/voice/classroom';
import { LessonCard } from './LessonCard';
import { PushToTalkPill } from '@/components/ui/PushToTalkPill';
import { talkState } from './talkState';
import { useStaticPromptSpeech } from './useStaticPromptSpeech';

type RepeatAfterMeQuiz = Extract<Quiz, { type: 'repeat-after-me' }>;

interface ReinforceFrameProps {
  disabled?: boolean;
  quiz: RepeatAfterMeQuiz;
  course: Course;
  controller: Classroom;
}

export function ReinforceFrame({ quiz, course, controller, disabled = false }: ReinforceFrameProps) {
  const [listening, setListening] = useState(false);
  const [heardSentence, setHeardSentence] = useState(false);
  const { state, promptPlaying, hasHeardPrompt } = useStaticPromptSpeech(controller, quiz.id);
  const card = course.cards.find((item) => item.id === quiz.cardId);
  const canHold = !disabled && (state === 'awaiting' || state === 'listening') && hasHeardPrompt && !promptPlaying;

  useEffect(() => {
    const onResult = (result: QuizResult) => {
      if (result.quizId === quiz.id && result.ok && result.correct) setHeardSentence(true);
    };
    controller.on('quiz-result', onResult);
    return () => controller.off('quiz-result', onResult);
  }, [controller, quiz.id]);

  useEffect(() => {
    setListening(false);
    setHeardSentence(false);
  }, [quiz.id]);

  const start = () => {
    if (!canHold) return;
    setListening(true);
    void controller.startQuizListening(quiz.id);
  };
  const stop = () => {
    setListening(false);
    controller.stopListening();
  };
  return <section className="p2-stage">
    {card && <LessonCard card={{ ...card, english: quiz.targetText }} state={listening ? 'recording' : heardSentence ? 'correct' : 'listening'} />}
    <div className="p2-dock"><PushToTalkPill state={canHold ? listening ? 'listening' : talkState(state) : state === 'awaiting' ? 'preparing' : talkState(state)} onPress={start} onRelease={stop} /></div>
  </section>;
}

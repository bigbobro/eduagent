'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WordBook } from './WordBook';
import { SubtitleBar } from './SubtitleBar';
import { BloomButton } from './BloomButton';
import { Bunny, type BunnyMood, type BunnyPose } from '@/components/bunny/Bunny';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from '@/components/ui/icons';
import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController, LessonStateName } from '@/lib/voice/lesson-controller';
import { setAsrSessionContext } from '@/lib/voice/asr-client';
import { useSpacebar } from '@/hooks/useSpacebar';

interface LessonViewProps {
  course: Course;
}

const STATE_TO_MOOD: Record<LessonStateName, BunnyMood> = {
  idle: 'idle',
  greeting: 'speaking',
  awaiting: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  ending: 'idle',
};
const STATE_TO_POSE: Record<LessonStateName, BunnyPose> = {
  idle: 'stand',
  greeting: 'stand',
  awaiting: 'stand',
  listening: 'stand',
  thinking: 'stand',
  speaking: 'point',
  ending: 'stand',
};

function pickLatestCardId(actions: ToolAction[]): string | null {
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (a.tool === 'show_card') return a.params.card_id;
  }
  return null;
}

export function LessonView({ course }: LessonViewProps) {
  const router = useRouter();
  const controllerRef = useRef<LessonController | null>(null);
  const [state, setState] = useState<LessonStateName>('idle');
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({
    text: '',
    source: 'idle',
  });
  const [currentCardId, setCurrentCardId] = useState<string>(() => course.cards[0]?.id || '');
  const [error, setError] = useState<string | null>(null);
  const targetWords = useMemo(
    () => course.cards.filter((c) => c.kind === 'word').map((c) => c.english),
    [course],
  );

  useEffect(() => {
    const c = new LessonController();
    controllerRef.current = c;
    c.on('state', setState);
    c.on('subtitle', (s: { text: string; source: 'user' | 'ai' }) => setSubtitle(s));
    c.on('subtitle-clear', () => setSubtitle({ text: '', source: 'idle' }));
    c.on('actions', (a: ToolAction[]) => {
      const next = pickLatestCardId(a);
      if (next) setCurrentCardId(next);
    });
    c.on('error', (err: { message: string }) => {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    });
    return () => {
      c.endLesson().catch(() => {});
    };
  }, []);

  useEffect(() => {
    setAsrSessionContext({ courseId: course.id, targetWords, cardId: currentCardId });
  }, [course.id, currentCardId, targetWords]);
  useEffect(() => () => setAsrSessionContext({}), []);

  const canHold = state === 'awaiting' || state === 'listening';
  useSpacebar({
    enabled: canHold,
    onDown: () => controllerRef.current?.startListening(),
    onUp: () => controllerRef.current?.stopListening(),
  });

  const handleStart = () => controllerRef.current?.startLesson(course.id);
  const handleLeave = () => router.push('/');
  const handleDone = () => router.push(`/lesson/${course.id}/done`);

  const isPlaying = state === 'speaking' || state === 'greeting';
  const helpText = useMemo(() => {
    switch (state) {
      case 'greeting':
        return '等老师讲完哦~';
      case 'awaiting':
        return '按住花朵 / 空格说话';
      case 'listening':
        return '我在听...';
      case 'thinking':
        return '让我想想...';
      case 'speaking':
        return '等老师说完~';
      case 'ending':
        return '今天的课结束啦,看看你学到了什么';
      default:
        return '准备好了吗?';
    }
  }, [state]);

  useEffect(() => {
    if (state === 'ending') {
      const t = setTimeout(handleDone, 1500);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="cabin" enterFrom="yard">
        <header className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-20">
          <button
            type="button"
            onClick={handleLeave}
            className="flex items-center gap-2 px-3 py-2 rounded-bunny-md text-bunny-ink hover:bg-bunny-pink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink"
            aria-label="离开课堂回院子"
          >
            <ArrowLeft width={20} height={20} />
            <span className="font-zh text-sm">离开</span>
          </button>
          <h1 className="font-zh text-xl text-bunny-ink">{course.title}</h1>
          <div className="w-20" />
        </header>

        {error && (
          <div className="absolute top-14 left-0 right-0 bg-bunny-berry/10 border-l-4 border-bunny-berry px-4 py-2 text-sm text-bunny-ink z-20">
            {error}
          </div>
        )}

        <div className="absolute inset-0 top-14 bottom-32 flex items-center justify-center gap-8 px-12">
          <div className="flex-shrink-0">
            <Bunny pose={STATE_TO_POSE[state]} mood={STATE_TO_MOOD[state]} size={240} />
          </div>
          <div className="flex-1 max-w-3xl h-full flex items-center justify-center">
            <WordBook cards={course.cards} currentCardId={currentCardId} />
          </div>
        </div>

        <footer className="absolute bottom-0 left-0 right-0 px-8 pb-6 z-20 flex items-end gap-6">
          {state === 'idle' ? (
            <div className="flex-1 flex items-center justify-center gap-6">
              <Button size="lg" onClick={handleStart}>
                开始上课
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1">
                <SubtitleBar text={subtitle.text} source={subtitle.source} isPlaying={isPlaying} />
                <div className="mt-2 text-center font-zh text-sm text-bunny-ink-soft">{helpText}</div>
              </div>
              <BloomButton
                disabled={!canHold}
                active={state === 'listening'}
                onPressStart={() => controllerRef.current?.startListening()}
                onPressEnd={() => controllerRef.current?.stopListening()}
              />
            </>
          )}
        </footer>
      </SceneFrame>
    </main>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WordCardCanvas } from './WordCardCanvas';
import { SubtitleBar } from './SubtitleBar';
import { HoldToTalkButton } from './HoldToTalkButton';
import { Bunny, BunnyMood } from './Bunny';
import { Button } from '@/components/ui/Button';
import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController, LessonStateName } from '@/lib/voice/lesson-controller';
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

function pickLatestCardId(actions: ToolAction[]): string | null {
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (a.tool === 'show_card') return a.params.card_id;
  }
  return null;
}

export function LessonView({ course }: LessonViewProps) {
  const controllerRef = useRef<LessonController | null>(null);
  const [state, setState] = useState<LessonStateName>('idle');
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({ text: '', source: 'idle' });
  const [currentCardId, setCurrentCardId] = useState<string>(() => course.cards[0]?.id || '');
  const [error, setError] = useState<string | null>(null);

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

  // 当前版本只在 awaiting/listening 状态可按 — speaking 时空格忽略(不打断)。
  // listening 必须包含,否则按下后切 listening,enabled=false 会卸载 keyup 监听器。
  const canHold = state === 'awaiting' || state === 'listening';

  useSpacebar({
    enabled: canHold,
    onDown: () => controllerRef.current?.startListening(),
    onUp: () => controllerRef.current?.stopListening(),
  });

  const handleStart = () => controllerRef.current?.startLesson(course.id);
  const handleEnd = () => controllerRef.current?.endLesson();
  const onPressStart = () => controllerRef.current?.startListening();
  const onPressEnd = () => controllerRef.current?.stopListening();

  const isPlaying = state === 'speaking' || state === 'greeting';
  const mood: BunnyMood = STATE_TO_MOOD[state];

  const helpText = useMemo(() => {
    switch (state) {
      case 'greeting': return '等老师讲完哦~';
      case 'awaiting': return '按住空格 / 按住按钮说话';
      case 'listening': return '我在听...';
      case 'thinking': return '让我想想...';
      case 'speaking': return '等老师说完~';
      default: return '';
    }
  }, [state]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }} className="bg-gray-50">
      <div className="flex items-center justify-between px-6 py-3 bg-white shadow-sm">
        <h1 className="text-xl font-bold text-gray-800">{course.title}</h1>
        {state !== 'idle' && (
          <Button variant="danger" size="sm" onClick={handleEnd}>结束课堂</Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <WordCardCanvas cards={course.cards} currentCardId={currentCardId} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <SubtitleBar
              text={subtitle.text}
              source={subtitle.source}
              isPlaying={isPlaying}
            />
            <div className="mt-1 text-xs text-gray-500 text-center">{helpText}</div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Bunny mood={mood} size={80} />
            {state === 'idle' ? (
              <Button size="lg" onClick={handleStart}>开始上课</Button>
            ) : (
              <HoldToTalkButton
                disabled={!canHold}
                active={state === 'listening'}
                onPressStart={onPressStart}
                onPressEnd={onPressEnd}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

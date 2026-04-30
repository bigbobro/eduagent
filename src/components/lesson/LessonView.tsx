'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageCanvas } from './ImageCanvas';
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

export function LessonView({ course }: LessonViewProps) {
  const controllerRef = useRef<LessonController | null>(null);
  const [state, setState] = useState<LessonStateName>('idle');
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({ text: '', source: 'idle' });
  const [actions, setActions] = useState<ToolAction[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 单例 controller(挂载时建,卸载时清理)
  useEffect(() => {
    const c = new LessonController();
    controllerRef.current = c;
    c.on('state', setState);
    c.on('subtitle', (s: { text: string; source: 'user' | 'ai' }) => setSubtitle(s));
    c.on('subtitle-clear', () => setSubtitle({ text: '', source: 'idle' }));
    c.on('actions', (a: ToolAction[]) => setActions(a));
    c.on('error', (err: { message: string }) => {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    });
    return () => {
      c.endLesson().catch(() => {});
    };
  }, []);

  const canHold = state === 'awaiting' || state === 'speaking';

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
      case 'speaking': return '按住空格可以打断哦';
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
          <ImageCanvas
            images={course.images}
            currentImageId={course.images[0]?.id || ''}
            actions={actions}
          />
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

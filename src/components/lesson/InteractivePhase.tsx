'use client';

import { useEffect, useState } from 'react';
import { Bunny, type BunnyMood, type BunnyPose } from '@/components/bunny/Bunny';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { useSpacebar } from '@/hooks/useSpacebar';
import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController, LessonStateName } from '@/lib/voice/lesson-controller';
import { BloomButton } from './BloomButton';
import { SubtitleBar } from './SubtitleBar';
import { WordBook } from './WordBook';

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

interface InteractivePhaseProps {
  course: Course;
  controller: LessonController;
}

export function InteractivePhase({ course, controller }: InteractivePhaseProps) {
  const [state, setState] = useState<LessonStateName>(controller.getState());
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({
    text: '',
    source: 'idle',
  });
  const [currentCardId, setCurrentCardId] = useState(course.cards[0]?.id || '');

  useEffect(() => {
    const onState = (next: LessonStateName) => setState(next);
    const onSubtitle = (next: { text: string; source: 'user' | 'ai' }) => setSubtitle(next);
    const onClear = () => setSubtitle({ text: '', source: 'idle' });
    const onActions = (actions: ToolAction[]) => {
      for (let i = actions.length - 1; i >= 0; i--) {
        if (actions[i].tool === 'show_card') {
          setCurrentCardId(actions[i].params.card_id);
          break;
        }
      }
    };
    controller.on('state', onState);
    controller.on('subtitle', onSubtitle);
    controller.on('subtitle-clear', onClear);
    controller.on('actions', onActions);
    return () => {
      controller.off('state', onState);
      controller.off('subtitle', onSubtitle);
      controller.off('subtitle-clear', onClear);
      controller.off('actions', onActions);
    };
  }, [controller]);

  const canHold = state === 'awaiting' || state === 'listening';
  useSpacebar({
    enabled: canHold,
    onDown: () => controller.startListening(),
    onUp: () => controller.stopListening(),
  });

  const isPlaying = state === 'speaking' || state === 'greeting';

  return (
    <SceneFrame variant="cabin" enterFrom="yard">
      <div className="absolute inset-0 top-14 bottom-28 flex items-center justify-center px-4">
        <div className="relative" style={{ width: 'min(90vw, calc((100vh - 200px) * 4 / 3))', maxWidth: '1600px' }}>
          <WordBook cards={course.cards} currentCardId={currentCardId} />
          <div className="absolute left-6 bottom-6 z-20">
            <Bunny pose={STATE_TO_POSE[state]} mood={STATE_TO_MOOD[state]} size={120} />
          </div>
        </div>
      </div>
      <footer className="absolute bottom-0 left-0 right-0 h-28 z-20 flex items-center justify-center px-8 gap-4">
        <div className="flex-1 max-w-4xl">
          <SubtitleBar text={subtitle.text} source={subtitle.source} isPlaying={isPlaying} />
        </div>
        <BloomButton
          disabled={!canHold}
          active={state === 'listening'}
          onPressStart={() => controller.startListening()}
          onPressEnd={() => controller.stopListening()}
        />
      </footer>
    </SceneFrame>
  );
}

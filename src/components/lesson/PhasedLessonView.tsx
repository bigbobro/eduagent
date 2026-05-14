'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Course, PhaseName } from '@/types/course';
import { LessonController } from '@/lib/voice/lesson-controller';
import { PhasedLessonController } from '@/lib/voice/phased-lesson-controller';
import { InteractivePhase } from './InteractivePhase';
import { IntroPhase } from './IntroPhase';
import { ReinforcePhase } from './ReinforcePhase';

interface PhasedLessonViewProps {
  course: Course;
}

export function PhasedLessonView({ course }: PhasedLessonViewProps) {
  const router = useRouter();
  const v2Ref = useRef<LessonController | null>(null);
  const phasedRef = useRef<PhasedLessonController | null>(null);
  const [phase, setPhase] = useState<PhaseName>('intro');
  const [started, setStarted] = useState(false);
  const [introBusy, setIntroBusy] = useState(false);
  const [introActiveCardId, setIntroActiveCardId] = useState<string | null>(null);

  useEffect(() => {
    const v2 = new LessonController();
    const phased = new PhasedLessonController(v2, course);
    const onPhaseChange = (next: PhaseName) => setPhase(next);
    const onIntroBusyChange = (busy: boolean) => setIntroBusy(busy);
    const onIntroActiveCardChange = (cardId: string | null) => setIntroActiveCardId(cardId);
    v2Ref.current = v2;
    phasedRef.current = phased;
    phased.on('phase-change', onPhaseChange);
    phased.on('intro-busy-change', onIntroBusyChange);
    phased.on('intro-active-card-change', onIntroActiveCardChange);
    return () => {
      phased.off('phase-change', onPhaseChange);
      phased.off('intro-busy-change', onIntroBusyChange);
      phased.off('intro-active-card-change', onIntroActiveCardChange);
      phased.endLesson().catch(() => {});
    };
  }, [course]);

  const handleStart = async () => {
    setStarted(true);
    await phasedRef.current?.startLesson();
  };

  const handleHotspotClick = (cardId: string) => {
    if (!started) return;
    void phasedRef.current?.requestIntroCard(cardId);
  };

  const handleDone = () => router.push(`/lesson/${course.id}/done`);
  const handleLeave = () => router.push('/');
  const v2 = v2Ref.current;
  const sessionId = v2?.getSessionId() || '';

  return (
    <main className="w-screen h-screen relative">
      <header className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-30">
        <button
          type="button"
          onClick={handleLeave}
          className="px-3 py-2 rounded-bunny-md text-bunny-ink hover:bg-bunny-pink-soft"
        >
          离开
        </button>
        <h1 className="font-zh text-xl text-bunny-ink">{course.title}</h1>
        <div className="w-20" />
      </header>

      <div className="absolute inset-0 top-14">
        {!started && (
          <>
            <IntroPhase course={course} locked activeCardId={introActiveCardId} onHotspotClick={() => {}} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Button size="lg" onClick={handleStart} className="pointer-events-auto">开始上课</Button>
            </div>
          </>
        )}
        {started && phase === 'intro' && (
          <IntroPhase
            course={course}
            locked={introBusy}
            activeCardId={introActiveCardId}
            onHotspotClick={handleHotspotClick}
          />
        )}
        {started && phase === 'interactive' && v2 && <InteractivePhase course={course} controller={v2} />}
        {started && phase === 'reinforcement' && v2 && (
          <ReinforcePhase
            course={course}
            controller={v2}
            sessionId={sessionId}
            onAllDone={() => phasedRef.current?.completeReinforcement()}
          />
        )}
        {started && phase === 'done' && (
          <div className="w-full h-full flex flex-col items-center justify-center bg-bunny-cream">
            <h2 className="font-zh text-2xl mb-4 text-bunny-ink">今天的课结束啦!</h2>
            <Button onClick={handleDone}>看看你学了什么</Button>
          </div>
        )}
      </div>
    </main>
  );
}

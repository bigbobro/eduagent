'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Course, PhaseName } from '@/types/course';
import { LessonController } from '@/lib/voice/lesson-controller';
import { PhasedLessonController } from '@/lib/voice/phased-lesson-controller';
import { DoneCelebrateFrame } from './DoneCelebrateFrame';
import { IntroFrame } from './IntroFrame';
import { LessonMandalaV2 } from './LessonMandalaV2';
import { ReinforcementFlow } from './ReinforcementFlow';

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
          className="rounded-paper-md px-3 py-2 text-ink hover:bg-butter/70"
        >
          离开
        </button>
        <h1 className="font-zh text-xl text-ink">{course.title}</h1>
        <div className="w-20" />
      </header>

      <div className="absolute inset-0 top-14">
        {!started && (
          <IntroFrame
            course={course}
            locked
            activeCardId={introActiveCardId}
            onWordClick={() => {}}
            onStart={handleStart}
          />
        )}
        {started && phase === 'intro' && (
          <IntroFrame
            course={course}
            locked={introBusy}
            activeCardId={introActiveCardId}
            onWordClick={handleHotspotClick}
            started
          />
        )}
        {started && phase === 'interactive' && v2 && <LessonMandalaV2 course={course} controller={v2} />}
        {started && phase === 'reinforcement' && v2 && (
          <ReinforcementFlow
            course={course}
            controller={v2}
            sessionId={sessionId}
            onAllDone={() => phasedRef.current?.completeReinforcement()}
          />
        )}
        {started && phase === 'done' && (
          <DoneCelebrateFrame
            starsEarned={Math.min(5, course.cards.length)}
            totalStars={5}
            wordsLearned={course.cards.filter((card) => card.kind === 'word').length}
            onHome={() => router.push('/')}
            onAgain={handleDone}
          />
        )}
      </div>
    </main>
  );
}

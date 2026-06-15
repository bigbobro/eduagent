'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

interface ProgressSnapshot {
  clearedCardIds: string[];
}

const DEV_PHASE_OPTIONS: PhaseName[] = ['intro', 'interactive', 'reinforcement', 'done'];

function DevPhasePanel({
  currentPhase,
  onJump,
}: {
  currentPhase: PhaseName;
  onJump: (to: PhaseName) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-black/80 text-white rounded-lg px-3 py-2 text-xs font-mono shadow-lg pointer-events-auto">
      <div className="mb-1 opacity-70">dev · phase = {currentPhase}</div>
      <div className="flex gap-1">
        {DEV_PHASE_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onJump(p)}
            disabled={p === currentPhase}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PhasedLessonView({ course }: PhasedLessonViewProps) {
  const router = useRouter();
  const v2Ref = useRef<LessonController | null>(null);
  const phasedRef = useRef<PhasedLessonController | null>(null);
  const [phase, setPhase] = useState<PhaseName>('intro');
  const [started, setStarted] = useState(false);
  const [introBusy, setIntroBusy] = useState(false);
  const [introActiveCardId, setIntroActiveCardId] = useState<string | null>(null);
  const [clearedWordCount, setClearedWordCount] = useState(0);
  const [lessonRun, setLessonRun] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const wordCardIds = useMemo(() => new Set(wordCards.map((card) => card.id)), [wordCards]);

  useEffect(() => {
    const v2 = new LessonController();
    const phased = new PhasedLessonController(v2, course);
    const onPhaseChange = (next: PhaseName) => setPhase(next);
    const onIntroBusyChange = (busy: boolean) => setIntroBusy(busy);
    const onIntroActiveCardChange = (cardId: string | null) => setIntroActiveCardId(cardId);
    const onProgress = (next: ProgressSnapshot) => {
      setClearedWordCount(next.clearedCardIds.filter((cardId) => wordCardIds.has(cardId)).length);
    };
    const onError = (err: { message: string }) => {
      if (!err?.message) return;
      setErrorMsg(err.message);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setErrorMsg(null), 4000);
    };
    v2Ref.current = v2;
    phasedRef.current = phased;
    v2.on('progress', onProgress);
    v2.on('error', onError);
    phased.on('phase-change', onPhaseChange);
    phased.on('intro-busy-change', onIntroBusyChange);
    phased.on('intro-active-card-change', onIntroActiveCardChange);
    return () => {
      v2.off('progress', onProgress);
      v2.off('error', onError);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      phased.off('phase-change', onPhaseChange);
      phased.off('intro-busy-change', onIntroBusyChange);
      phased.off('intro-active-card-change', onIntroActiveCardChange);
      phased.endLesson().catch(() => {});
    };
  }, [course, lessonRun, wordCardIds]);

  const handleStart = async () => {
    setStarted(true);
    const startedOk = await phasedRef.current?.startLesson();
    if (startedOk === false) {
      setStarted(false);
      setPhase('intro');
      setIntroBusy(false);
      setIntroActiveCardId(null);
    }
  };

  const handleHotspotClick = (cardId: string) => {
    if (!started) return;
    void phasedRef.current?.requestIntroCard(cardId);
  };

  const handleLeave = () => router.push('/');
  const handleRestart = () => {
    setStarted(false);
    setPhase('intro');
    setIntroBusy(false);
    setIntroActiveCardId(null);
    setClearedWordCount(0);
    setLessonRun((run) => run + 1);
  };
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

      {errorMsg && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-1/2 top-16 z-40 max-w-[90vw] -translate-x-1/2 rounded-paper-pill border-2 border-ink bg-butter px-5 py-2.5 text-center font-zh text-base text-ink shadow-paper"
        >
          {errorMsg}
        </div>
      )}

      {process.env.NODE_ENV === 'development' && started && (
        <DevPhasePanel
          currentPhase={phase}
          onJump={(to) => phasedRef.current?.forceTransition(to)}
        />
      )}

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
            starsEarned={Math.min(5, clearedWordCount)}
            totalStars={5}
            wordsLearned={clearedWordCount}
            onHome={() => router.push('/')}
            onAgain={handleRestart}
          />
        )}
      </div>
    </main>
  );
}

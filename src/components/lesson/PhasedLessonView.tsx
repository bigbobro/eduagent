'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Course, PhaseName } from '@/types/course';
import { llmFailureNeedsSettings } from '@/lib/llm-errors';
import type { LessonProgressSnapshot } from '@/lib/lesson-protocol';
import { LessonController } from '@/lib/voice/lesson-controller';
import { PhasedLessonController } from '@/lib/voice/phased-lesson-controller';
import { DoneCelebrateFrame } from './DoneCelebrateFrame';
import { IntroFrame } from './IntroFrame';
import { LessonMandalaV2 } from './LessonMandalaV2';
import { ReinforcementFlow } from './ReinforcementFlow';
import { LessonToolbar } from './LessonToolbar';
import { SubtitleLog } from './SubtitleLog';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

interface PhasedLessonViewProps {
  course: Course;
  learnerId: string;
}


export function PhasedLessonView({ course, learnerId }: PhasedLessonViewProps) {
  const router = useRouter();
  const v2Ref = useRef<LessonController | null>(null);
  const phasedRef = useRef<PhasedLessonController | null>(null);
  const [introSubtitle, setIntroSubtitle] = useState('');
  const [quizIndex, setQuizIndex] = useState(0);
  const [phase, setPhase] = useState<PhaseName>('intro');
  const [transitionRetry, setTransitionRetry] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [started, setStarted] = useState(false);
  const [introBusy, setIntroBusy] = useState(false);
  const [introActiveCardId, setIntroActiveCardId] = useState<string | null>(null);
  const [clearedWordCount, setClearedWordCount] = useState(0);
  // R1 (2026-07-20 session persistence): populated from PhasedLessonController.getResumeInfo()
  // right after a resumed startLesson() resolves, so LessonMandalaV2/ReinforcementFlow can
  // position on the breakpoint instead of flashing the default first card / quiz 0.
  const [resumeCardId, setResumeCardId] = useState<string | null>(null);
  const [resumeClearedCardIds, setResumeClearedCardIds] = useState<string[]>([]);
  const [resumePassedQuizIds, setResumePassedQuizIds] = useState<string[]>([]);
  const [lessonRun, setLessonRun] = useState(0);
  const [lessonError, setLessonError] = useState<{ message: string; code?: string } | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // R1 (2026-07-20): guards against re-applying resume info on later, ordinary phase changes
  // (e.g. a post-resume interactive→reinforcement transition once the child finishes the rest
  // of the words) — resume info must only ever seed the *first* phase-change of a lesson.
  const resumeAppliedRef = useRef(false);
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const wordCardIds = useMemo(() => new Set(wordCards.map((card) => card.id)), [wordCards]);

  useEffect(() => {
    const v2 = new LessonController();
    const phased = new PhasedLessonController(v2, course);
    // R1 (2026-07-20 session persistence): a resumed session's very first 'phase-change' event
    // IS the resume application itself (PhasedLessonController.applyResumeInfo emits it
    // synchronously before startLesson() resolves — see phased-lesson-controller.ts). Reading
    // getResumeInfo() here, in the SAME synchronous callback as setPhase, guarantees both land
    // in one React update instead of two — otherwise LessonMandalaV2/ReinforcementFlow can
    // mount one tick early with the still-default card/passedQuizIds (verified by a failing
    // test before this fix: quiz 0 briefly won the race against the resumed passedQuizIds).
    const onPhaseChange = (next: PhaseName) => {
      setPhase(next);
      if (!resumeAppliedRef.current) {
        const resume = phased.getResumeInfo();
        if (resume?.resumed) {
          resumeAppliedRef.current = true;
          setResumeCardId(resume.resumeCardId || null);
          setResumeClearedCardIds(resume.clearedCardIds);
          setResumePassedQuizIds(resume.passedQuizIds);
          setClearedWordCount(resume.clearedCardIds.filter((cardId) => wordCardIds.has(cardId)).length);
        }
      }
    };
    const onTransitionRetry = (needed: boolean) => setTransitionRetry(needed);
    const onIntroBusyChange = (busy: boolean) => setIntroBusy(busy);
    const onIntroActiveCardChange = (cardId: string | null) => setIntroActiveCardId(cardId);
    const onProgress = (next: LessonProgressSnapshot) => {
      setLessonError(null);
      setClearedWordCount(next.clearedCardIds.filter((cardId) => wordCardIds.has(cardId)).length);
    };
    const onError = (err: { message: string; code?: string }) => {
      if (!err?.message) return;
      setLessonError(err);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      // Configuration problems need to remain visible long enough to act on them.
      if (!llmFailureNeedsSettings(err.code)) errorTimerRef.current = setTimeout(() => setLessonError(null), 4000);
    };
    v2Ref.current = v2;
    phasedRef.current = phased;
    const onSubtitle = (next: { text: string; source: string }) => { if (next.source === 'ai') setIntroSubtitle(next.text); };
    v2.on('subtitle', onSubtitle);
    v2.on('progress', onProgress);
    v2.on('error', onError);
    phased.on('phase-change', onPhaseChange);
    phased.on('transition-retry-change', onTransitionRetry);
    phased.on('intro-busy-change', onIntroBusyChange);
    phased.on('intro-active-card-change', onIntroActiveCardChange);
    return () => {
      if (phasedRef.current === phased) phasedRef.current = null;
      if (v2Ref.current === v2) v2Ref.current = null;
      v2.off('subtitle', onSubtitle);
      v2.off('progress', onProgress);
      v2.off('error', onError);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      phased.off('phase-change', onPhaseChange);
      phased.off('transition-retry-change', onTransitionRetry);
      phased.off('intro-busy-change', onIntroBusyChange);
      phased.off('intro-active-card-change', onIntroActiveCardChange);
      phased.endLesson().catch(() => {});
    };
  }, [course, lessonRun, wordCardIds]);

  const handleStart = async () => {
    setLessonError(null);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setStarted(true);
    const phased = phasedRef.current;
    const startedOk = await phased?.startLesson(learnerId);
    if (phasedRef.current !== phased) return;
    if (startedOk === false) {
      setStarted(false);
      setPhase('intro');
      setIntroBusy(false);
      setIntroActiveCardId(null);
    }
    // Resume info (if any) is applied by onPhaseChange, in the same tick as the resumed
    // phase's 'phase-change' event — see the useEffect above.
  };

  const handleHotspotClick = (cardId: string) => {
    if (!started) return;
    void phasedRef.current?.requestIntroCard(cardId);
  };

  const handleLeave = () => router.push('/');
  const handleRestart = () => {
    setLessonError(null);
    setTransitionRetry(false);
    setStarted(false);
    setPhase('intro');
    setIntroBusy(false);
    setIntroActiveCardId(null);
    setClearedWordCount(0);
    setResumeCardId(null);
    setResumeClearedCardIds([]);
    setResumePassedQuizIds([]);
    resumeAppliedRef.current = false;
    setLessonRun((run) => run + 1);
  };
  const v2 = v2Ref.current;

  return (
    <main className="p2-app">
      <LessonToolbar course={course} learnerId={learnerId} phase={phase} cleared={clearedWordCount} quizIndex={quizIndex} onLeave={handleLeave} />
      {lessonError && (
        <div className="p2-error"><Banner action={llmFailureNeedsSettings(lessonError.code) ? <a href="/settings" className="ui-button ui-button-glass ui-button-sm">去设置</a> : undefined}>{lessonError.message}</Banner></div>
      )}

      <div className={`p2-content ${started && phase !== 'intro' && phase !== 'done' ? 'p2-lesson' : ''}`}>
        {transitionRetry && (
          <div role="alert" className="p2-retry"><EmptyState title="老师还没准备好下一步,再试一次吧" action={<Button disabled={retrying} onClick={async () => {
              const phased = phasedRef.current;
              setLessonError(null);
              setRetrying(true);
              try { await phased?.retryTransition(); } finally { if (phasedRef.current === phased) setRetrying(false); }
            }}>{retrying ? '准备中…' : '再试一次'}</Button>} /></div>
        )}
        {!started && (
          <IntroFrame
            course={course}
            locked
            activeCardId={introActiveCardId}
            onWordClick={() => {}}
            onStart={handleStart}
          />
        )}
        {started && !transitionRetry && phase === 'intro' && (
          <IntroFrame
            course={course}
            locked={introBusy}
            activeCardId={introActiveCardId}
            onWordClick={handleHotspotClick}
            started
            subtitle={introSubtitle}
          />
        )}
        {started && !transitionRetry && phase === 'interactive' && v2 && (
          <LessonMandalaV2
            course={course}
            controller={v2}
            initialCardId={resumeCardId || undefined}
            initialClearedCardIds={resumeClearedCardIds}
          />
        )}
        {started && !transitionRetry && phase === 'reinforcement' && v2 && (
          <ReinforcementFlow
            course={course}
            controller={v2}
            passedQuizIds={resumePassedQuizIds}
            onQuizChange={setQuizIndex}
            onAllDone={() => phasedRef.current?.completeReinforcement()}
          />
        )}
        {started && phase !== 'intro' && phase !== 'done' && v2 && <SubtitleLog controller={v2} learnerId={learnerId} />}
        {started && !transitionRetry && phase === 'done' && (
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

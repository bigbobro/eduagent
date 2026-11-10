'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Course, PhaseName } from '@/types/course';
import { llmFailureNeedsSettings } from '@/lib/llm-errors';
import type { LessonProgressSnapshot } from '@/lib/lesson-protocol';
import type { Classroom } from '@/lib/voice/classroom';
import { isWordBattleOn, rememberEscapedMonster } from '@/lib/word-battle-pref';
import { BattleSummary } from './battle/BattleSummary';
import type { BattleState } from './battle/battle-state';
import { RealtimeClassroom } from '@/lib/voice/realtime-classroom';
import { LegacyClassroom } from '@/lib/voice/legacy-classroom';
import { DoneLesson } from './DoneLesson';
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
  /** Home "从头复习": ask the server to ignore the breakpoint and start over. */
  fresh?: boolean;
  /** Called once startLesson succeeds, e.g. to drop the one-shot fresh flag from the URL. */
  onStarted?: () => void;
}

const CLASSROOM_MODES = [
  { id: 'legacy', label: '原有课堂 · 豆包语音' },
  { id: 'realtime', label: 'Realtime 自然对话 · OpenAI' },
] as const;

export function PhasedLessonView({ course, learnerId, fresh, onStarted }: PhasedLessonViewProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'legacy' | 'realtime'>('legacy');
  useEffect(() => { try { if (localStorage.getItem('eduagent.classroomMode') === 'realtime') setMode('realtime'); } catch {} }, []);
  const v2Ref = useRef<Classroom | null>(null);
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
  const [sittingEnded, setSittingEnded] = useState(false);
  // Word battle: decided when the lesson starts (Realtime only), so a settings change applies to the next lesson.
  const [battle, setBattle] = useState(false);
  const [collectedCardIds, setCollectedCardIds] = useState<string[]>([]);
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  // The battle is the sitting's closing recall game: it starts when the server says the wrap-up began.
  const [fighting, setFighting] = useState(false);
  const [battleEnd, setBattleEnd] = useState<BattleState | null>(null);
  const battleNow = useRef<BattleState | null>(null);
  const onBattleChange = useCallback((next: BattleState) => { battleNow.current = next; }, []);
  const [lessonError, setLessonError] = useState<{ message: string; code?: string } | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // R1 (2026-07-20): guards against re-applying resume info on later, ordinary phase changes
  // (e.g. a post-resume interactive→reinforcement transition once the child finishes the rest
  // of the words) — resume info must only ever seed the *first* phase-change of a lesson.
  const resumeAppliedRef = useRef(false);
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const wordCardIds = useMemo(() => new Set(wordCards.map((card) => card.id)), [wordCards]);

  useEffect(() => {
    const v2: Classroom = mode === 'realtime' ? new RealtimeClassroom(course) : new LegacyClassroom(course);
    const phased = v2;
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
      if (next.collectedCardIds) setCollectedCardIds(next.collectedCardIds);
    };
    const onError = (err: { message: string; code?: string }) => {
      if (!err?.message) return;
      setLessonError(err);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      // Configuration problems need to remain visible long enough to act on them.
      if (mode === 'legacy' && !llmFailureNeedsSettings(err.code)) errorTimerRef.current = setTimeout(() => setLessonError(null), 4000);
    };
    const onWrapUp = () => setFighting(true);
    const onSittingEnded = () => {
      // Keep what the battle looked like when the sitting ended; the untamed monster comes back first next time.
      const last = battleNow.current; setBattleEnd(last);
      if (last) rememberEscapedMonster(last.monster.kind);
      setSittingEnded(true);
    };
    v2Ref.current = v2;
    v2.on('sitting-ended', onSittingEnded);
    v2.on('sitting-wrap-up', onWrapUp);
    const onSubtitle = (next: { text: string; source: string }) => { if (next.source === 'ai') setIntroSubtitle(next.text); };
    v2.on('subtitle', onSubtitle);
    v2.on('progress', onProgress);
    v2.on('error', onError);
    phased.on('phase-change', onPhaseChange);
    phased.on('transition-retry-change', onTransitionRetry);
    phased.on('intro-busy-change', onIntroBusyChange);
    phased.on('intro-active-card-change', onIntroActiveCardChange);
    return () => {
      if (v2Ref.current === v2) v2Ref.current = null;
      v2.off('subtitle', onSubtitle);
      v2.off('progress', onProgress);
      v2.off('error', onError);
      v2.off('sitting-ended', onSittingEnded);
      v2.off('sitting-wrap-up', onWrapUp);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      phased.off('phase-change', onPhaseChange);
      phased.off('transition-retry-change', onTransitionRetry);
      phased.off('intro-busy-change', onIntroBusyChange);
      phased.off('intro-active-card-change', onIntroActiveCardChange);
      phased.endLesson().catch(() => {});
    };
  }, [course, lessonRun, wordCardIds, mode]);

  const handleStart = async () => {
    setLessonError(null);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setStarted(true);
    const phased = v2Ref.current;
    const game = mode === 'realtime' && isWordBattleOn();
    setBattle(game); setFighting(false); setCollectedCardIds([]); setSubtitlesOpen(false); setBattleEnd(null); battleNow.current = null;
    const startedOk = await phased?.startLesson(learnerId, game ? { ...(fresh ? { fresh: true } : {}), game: true } : fresh ? { fresh: true } : undefined);
    if (v2Ref.current !== phased) return;
    if (startedOk === false) {
      setStarted(false);
      setPhase('intro');
      setIntroBusy(false);
      setIntroActiveCardId(null);
    } else {
      onStarted?.();
    }
    // Resume info (if any) is applied by onPhaseChange, in the same tick as the resumed
    // phase's 'phase-change' event — see the useEffect above.
  };

  const handleHotspotClick = (cardId: string) => {
    if (!started) return;
    void v2Ref.current?.requestIntroCard(cardId);
  };

  const handleLeave = () => router.push('/');
  const handleRestart = () => {
    setLessonError(null);
    setTransitionRetry(false);
    setStarted(false);
    setSittingEnded(false);
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
  // The battle scene folds the subtitle column away (still mounted, so it keeps collecting lines).
  const battleScene = battle && fighting && started && phase === 'interactive' && !sittingEnded;

  return (
    <main className="p2-app">
      <LessonToolbar course={course} learnerId={learnerId} phase={phase} cleared={clearedWordCount} quizIndex={quizIndex} onLeave={handleLeave} />
      {lessonError && (
        <div className="p2-error"><Banner action={llmFailureNeedsSettings(lessonError.code) ? <a href={mode === 'realtime' ? '/settings#realtime' : '/settings'} className="ui-button ui-button-glass ui-button-sm">去设置</a> : mode === 'realtime' && started ? lessonError.code === 'SESSION_EXPIRED' ? <Button size="sm" onClick={handleRestart}>重新进入课堂</Button> : <Button size="sm" onClick={() => { setLessonError(null); void v2Ref.current?.retryLastTurn?.(); }}>重试这一步</Button> : undefined}>{lessonError.message}</Banner></div>
      )}

      <div className="p2-mode">
        {!started ? <>
          <span id="p2-mode-label">课堂模式</span>
          <div className="shell-segments" role="radiogroup" aria-labelledby="p2-mode-label">
            {CLASSROOM_MODES.map(({ id, label }) => <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => {
              setMode(id); try { localStorage.setItem('eduagent.classroomMode', id); } catch {}
            }}>{label}</button>)}
          </div>
        </> : <span>{mode === 'realtime' ? 'Realtime 自然对话课堂 · OpenAI（直接说话，可随时插话）' : '原有课堂 · 豆包语音'}</span>}
        {battleScene && <button type="button" className="p2-subs-toggle" aria-pressed={subtitlesOpen} onClick={() => setSubtitlesOpen((open) => !open)}>{subtitlesOpen ? '收起字幕' : '字幕'}</button>}
      </div>
      <div className={`p2-content ${started && phase !== 'intro' && phase !== 'done' ? 'p2-lesson' : ''} ${battleScene && !subtitlesOpen ? 'p2-subs-closed' : ''}`}>
        {transitionRetry && (
          <div role="alert" className="p2-retry"><EmptyState title="老师还没准备好下一步,再试一次吧" action={<Button disabled={retrying} onClick={async () => {
              const phased = v2Ref.current;
              setLessonError(null);
              setRetrying(true);
              try { await phased?.retryTransition(); } finally { if (v2Ref.current === phased) setRetrying(false); }
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
        {started && !transitionRetry && !sittingEnded && phase === 'intro' && (
          <IntroFrame
            course={course}
            locked={introBusy}
            activeCardId={introActiveCardId}
            onWordClick={handleHotspotClick}
            started
            subtitle={introSubtitle}
          />
        )}
        {started && !transitionRetry && !sittingEnded && phase === 'interactive' && v2 && (
          <LessonMandalaV2
            course={course}
            controller={v2}
            initialCardId={resumeCardId || undefined}
            initialClearedCardIds={resumeClearedCardIds}
            battle={battle && fighting}
            initialCollectedCardIds={collectedCardIds}
            onBattleChange={onBattleChange}
          />
        )}
        {started && !transitionRetry && !sittingEnded && phase === 'reinforcement' && v2 && (
          <ReinforcementFlow
            course={course}
            controller={v2}
            passedQuizIds={resumePassedQuizIds}
            onQuizChange={setQuizIndex}
            onAllDone={() => v2Ref.current?.completeReinforcement()}
          />
        )}
        {started && phase !== 'intro' && phase !== 'done' && !sittingEnded && v2 && <SubtitleLog controller={v2} learnerId={learnerId} />}
        {sittingEnded && phase !== 'done' && (
          <div role="status" className={battle ? 'p2-retry bt-end' : 'p2-retry'}>{battle && <BattleSummary course={course} collectedCardIds={collectedCardIds} team={battleEnd?.team} escaped={battleEnd?.monster} />}<EmptyState title="今天先学到这里" action={<><Button onClick={handleRestart}>继续上课</Button> <Button variant="glass" onClick={handleLeave}>回到课程</Button></>}>进度已保存，下次继续</EmptyState></div>
        )}
        {started && !transitionRetry && phase === 'done' && (
          <DoneLesson courseId={course.id} learnerId={learnerId} onAgain={handleRestart} extra={battle ? <BattleSummary course={course} collectedCardIds={collectedCardIds} compact /> : undefined} />
        )}
      </div>
    </main>
  );
}

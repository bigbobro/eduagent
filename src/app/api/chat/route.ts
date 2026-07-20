import { NextRequest, NextResponse } from 'next/server';
import { createSession, createSessionFromSnapshot, getSession, endSession, recordQuizAnswer, setSessionPhase } from '@/lib/agent/session';
import { resolveResumeCardId, isResumableProgress } from '@/lib/agent/course-progress';
import { streamUserInputToSSE } from '@/lib/agent/orchestrator';
import { getCourseById } from '@/data/courses';
import { getCourseProgress } from '@/lib/db/queries';
import { ensureInitialized } from '@/lib/init';
import { PhaseName } from '@/types/course';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  ensureInitialized();
  const body = await req.json();
  console.log('[chat]', 'action=' + body.action, 'courseId=' + (body.courseId ?? '-'), 'sessionId=' + (body.sessionId ?? '-'));

  if (body.action === 'start') {
    const course = getCourseById(body.courseId);
    if (!course) {
      console.warn('[chat] 404 course not found:', body.courseId);
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // R1 (2026-07-20 session persistence): resume from a *resumable* breakpoint instead of
    // starting fresh. isResumableProgress excludes both completed courses (kept but ignored —
    // next start is a fresh review, PRD R3) and empty intro-only breakpoints (the opening-speech
    // turn persists an intro snapshot with nothing cleared; resuming that would give a child who
    // only heard the intro a misplaced "welcome back").
    // R4 (PRD, deliberate): no expiry. A breakpoint stays valid forever until the course is
    // completed. Future extension point, not implemented: if a stale breakpoint ever needs to
    // expire, compare `progress.updatedAt` against a threshold here and fall through to the
    // fresh-start branch instead of resuming.
    let session;
    let resumeHeader: string | undefined;
    const progress = getCourseProgress(course.id);
    if (progress && isResumableProgress(progress)) {
      session = createSessionFromSnapshot(course, progress);
      const resumeCardId = resolveResumeCardId(course, session.memory);
      console.log('[chat] resume hit', {
        courseId: course.id,
        phase: progress.phase,
        resumeCardId,
        clearedCount: session.memory.clearedCardIds.length,
        passedQuizCount: session.memory.passedQuizIds.length,
      });
      resumeHeader = JSON.stringify({
        resumed: true,
        phase: progress.phase,
        clearedCardIds: session.memory.clearedCardIds,
        resumeCardId,
        passedQuizIds: session.memory.passedQuizIds,
      });
    } else {
      session = createSession(course);
      console.log('[chat] fresh start', { courseId: course.id, hadProgress: !!progress, completed: progress?.completed ?? false });
    }

    // System turn (not the child speaking) → rawAsrText '' so it never counts an R2 hit.
    // phaseOpening: opening speech is exempt from speechCardAlign rewrite.
    const stream = streamUserInputToSSE(session.id, '(课堂开始)', undefined, '', { phaseOpening: true });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Session-Id': session.id,
        // Only present when resumed=true — absence keeps today's fresh-start response shape
        // byte-identical (PRD: "否则现状"). JSON-encoded because header values are single
        // strings; all fields are ASCII card/quiz ids and a PhaseName, safe to encode directly.
        ...(resumeHeader ? { 'X-Resume-Info': resumeHeader } : {}),
      },
    });
  }

  if (body.action === 'message') {
    const session = getSession(body.sessionId);
    if (!session) {
      console.warn('[chat] 404 session not found (message):', body.sessionId);
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    // body.system marks a teacher-initiated turn ("请老师再说") that is NOT the child speaking;
    // pass rawAsrText '' so its instruction text (which names the target word) is not R2-counted.
    const stream = streamUserInputToSSE(body.sessionId, body.text, body.asrResult, body.system ? '' : body.text);
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  }

  if (body.action === 'phase-transition') {
    const session = getSession(body.sessionId);
    if (!session) {
      console.warn('[chat] 404 session not found (phase-transition):', body.sessionId);
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const valid: PhaseName[] = ['intro', 'interactive', 'reinforcement', 'done'];
    if (!valid.includes(body.to)) {
      return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
    }
    setSessionPhase(body.sessionId, body.to);
    // System turn → rawAsrText '' so the transition prompt never counts an R2 hit.
    // phaseOpening: transition opening speech legitimately mentions other words —
    // exempt from speechCardAlign rewrite (n=51 reinforcement opening bug).
    const stream = streamUserInputToSSE(body.sessionId, `(切换到 ${body.to} 阶段,请说一句简短开场)`, undefined, '', { phaseOpening: true });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  }

  if (body.action === 'quiz-answer') {
    const ok = recordQuizAnswer(body.sessionId, body.quizId, body.answer, body.correct);
    if (!ok) {
      console.warn('[chat] 404 session not found (quiz-answer):', body.sessionId);
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'end') {
    endSession(body.sessionId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession, endSession, recordQuizAnswer, setSessionPhase } from '@/lib/agent/session';
import { streamUserInputToSSE } from '@/lib/agent/orchestrator';
import { getCourseById } from '@/data/courses';
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
    const session = createSession(course);
    // System turn (not the child speaking) → rawAsrText '' so it never counts an R2 hit.
    const stream = streamUserInputToSSE(session.id, '(课堂开始)', undefined, '');
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Session-Id': session.id,
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
    const stream = streamUserInputToSSE(body.sessionId, `(切换到 ${body.to} 阶段,请说一句简短开场)`, undefined, '');
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

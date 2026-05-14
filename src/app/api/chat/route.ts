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

  if (body.action === 'start') {
    const course = getCourseById(body.courseId);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const session = createSession(course);
    const stream = streamUserInputToSSE(session.id, '(课堂开始)');
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
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const stream = streamUserInputToSSE(body.sessionId, body.text, body.asrResult);
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
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const valid: PhaseName[] = ['intro', 'interactive', 'reinforcement', 'done'];
    if (!valid.includes(body.to)) {
      return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
    }
    setSessionPhase(body.sessionId, body.to);
    const stream = streamUserInputToSSE(body.sessionId, `(切换到 ${body.to} 阶段,请说一句简短开场)`);
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

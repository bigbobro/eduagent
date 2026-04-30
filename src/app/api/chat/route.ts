import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession, endSession } from '@/lib/agent/session';
import { streamUserInputToSSE } from '@/lib/agent/orchestrator';
import { getCourseById } from '@/data/courses/transportation';
import { ensureInitialized } from '@/lib/init';

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

  if (body.action === 'end') {
    endSession(body.sessionId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

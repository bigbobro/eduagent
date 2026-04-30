import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession, processUserInput, endSession } from '@/lib/agent/session';
import { getCourseById } from '@/data/courses/transportation';
import { ensureInitialized } from '@/lib/init';

export async function POST(req: NextRequest) {
  ensureInitialized();
  const body = await req.json();

  // Start new session
  if (body.action === 'start') {
    const course = getCourseById(body.courseId);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const session = createSession(course);

    try {
      // Generate opening message
      const { response } = await processUserInput(session.id, '(课堂开始)');
      return NextResponse.json({
        sessionId: session.id,
        response,
      });
    } catch (e: any) {
      console.error('Error generating opening message:', e);
      return NextResponse.json({ error: e.message || 'LLM call failed' }, { status: 500 });
    }
  }

  // Continue session
  if (body.action === 'message') {
    const session = getSession(body.sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    try {
      const { response } = await processUserInput(body.sessionId, body.text, body.asrResult);
      return NextResponse.json({ response });
    } catch (e: any) {
      console.error('Error processing message:', e);
      return NextResponse.json({ error: e.message || 'Processing failed' }, { status: 500 });
    }
  }

  // End session
  if (body.action === 'end') {
    endSession(body.sessionId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

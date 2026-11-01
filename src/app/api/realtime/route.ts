import { NextResponse } from 'next/server';
import { InvalidCourseProgressError } from '@/lib/db/progress-snapshot';
import { getConfig, getRealtimeTurnMode, isRealtimeConfigured } from '@/lib/config';
import { isAllowedHttpOrigin } from '@/lib/voice/ws-origin';
import { ensureInitialized } from '@/lib/init';
import { realtimeRequestSchema, encodeRealtimeEvent, type RealtimeEvent } from '@/lib/realtime-protocol';
import { RealtimeClassroomSession, realtimeClassrooms, registerClassroom } from '@/lib/realtime/classroom-session';
import { endSession } from '@/lib/agent/session';
import { requireOwner, snapshot } from '@/lib/realtime/teaching';
import { createLogger } from '@/lib/logger';
const log = createLogger('realtime');
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAllowedHttpOrigin(req.headers.get('origin'), getConfig().port)) return NextResponse.json({ code: 'FORBIDDEN_ORIGIN' }, { status: 403 });
  if (Number(req.headers.get('content-length')) > 100_000) return NextResponse.json({ code: 'INPUT_TOO_LARGE' }, { status: 413 });
  const input = await readBoundedJson(req);
  if (input === 'too-large') return NextResponse.json({ code: 'INPUT_TOO_LARGE' }, { status: 413 });
  const parsed = realtimeRequestSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  const body = parsed.data;
  if (body.action !== 'presented') log.info('request', { action: body.action });
  ensureInitialized();
  try {
    if (body.action === 'start') {
      if (!isRealtimeConfigured()) return NextResponse.json({ code: 'NOT_CONFIGURED', error: '请先配置 OpenAI API Key。' }, { status: 503 });
      const classroom = new RealtimeClassroomSession(body.courseId, body.learnerId, body.fresh);
      registerClassroom(classroom);
      log.info('started', { sessionId: classroom.session.id, model: getConfig().realtimeModel, transport: classroom.transport });
      return NextResponse.json({ sessionId: classroom.session.id, resume: classroom.resume, receipt: snapshot(classroom.session), transport: classroom.transport, turnMode: getRealtimeTurnMode() });
    }
    requireOwner(body.sessionId, body.learnerId);
    const classroom = realtimeClassrooms.get(body.sessionId);
    if (!classroom) return NextResponse.json({ code: 'SESSION_EXPIRED' }, { status: 409 });
    switch (body.action) {
      case 'end':
        classroom.close(); endSession(body.sessionId); realtimeClassrooms.delete(body.sessionId);
        log.info('ended', { sessionId: body.sessionId });
        return NextResponse.json({ ok: true });
      case 'connect': return await connect(req, classroom, body.sdp);
      case 'presented': classroom.presented(body.target); return NextResponse.json({ ok: true });
      case 'present-quiz': classroom.presentQuiz(body.quizId); return NextResponse.json({ ok: true });
      case 'repeat': classroom.repeat(body.cardId); return NextResponse.json({ ok: true });
      case 'pause': classroom.pause(body.paused); return NextResponse.json({ ok: true });
      case 'speech': classroom.speech(body.phase, body.voicedMs); return NextResponse.json({ ok: true });
      case 'pick': return NextResponse.json({ receipt: classroom.pick(body.turnId, body.quizId, body.cardId) });
      case 'phase': return NextResponse.json({ receipt: classroom.phase(body.to) });
      case 'mock-speech':
        if (!getConfig().voiceMock) return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
        classroom.mockSpeech(body.utterance); return NextResponse.json({ ok: true });
    }
  } catch (error) {
    if (error instanceof InvalidCourseProgressError) {
      log.warn('invalid checkpoint', { courseId: error.courseId, fields: error.fields });
      return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
    }
    const code = errorCode(error);
    log.warn('request failed', { action: body.action, code });
    const status = code === 'NOT_FOUND' ? 404 : ['SESSION_EXPIRED', 'CALL_EXISTS', 'INVALID_INPUT_ASSOCIATION', 'INVALID_TARGET', 'INVALID_PHASE'].includes(code) ? 409
      : /AUTH|MODEL_UNAVAILABLE|RATE_LIMITED|PROVIDER/.test(code) ? 502 : 500;
    return NextResponse.json({ code, error: '课堂暂时无法继续，请重试。' }, { status });
  }
}

/** One long-lived SSE stream per call: the SDP answer, then committed receipts and conversation state. Cancel ends the classroom. */
async function connect(req: Request, classroom: RealtimeClassroomSession, sdp: string | null): Promise<Response> {
  const encoder = new TextEncoder();
  const buffered: RealtimeEvent[] = [];
  let push: (event: RealtimeEvent) => void = (event) => { buffered.push(event); };
  const answer = await classroom.connect(sdp, (event) => push(event));
  const lifetime = classroom.session.lifetime.signal;
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = () => { if (open) { open = false; controller.close(); } };
      push = (event) => { if (open) controller.enqueue(encoder.encode(encodeRealtimeEvent(event))); };
      push({ type: 'answer', sdp: answer });
      buffered.splice(0).forEach(push);
      lifetime.addEventListener('abort', finish, { once: true });
      if (lifetime.aborted) finish();
    },
    cancel() { open = false; log.info('stream cancelled', { sessionId: classroom.session.id }); classroom.expire(); },
  });
  req.signal.addEventListener('abort', () => classroom.expire(), { once: true });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' } });
}
function errorCode(error: unknown): string { return error instanceof Error && /^[A-Z0-9_]{1,180}$/.test(error.message) ? error.message : 'REALTIME_FAILED'; }

async function readBoundedJson(req: Request): Promise<unknown> {
  if (!req.body) return null;
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 100_000) { await reader.cancel(); return 'too-large'; }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    return JSON.parse(body.toString('utf8'));
  } catch { return null; } finally { reader.releaseLock(); }
}

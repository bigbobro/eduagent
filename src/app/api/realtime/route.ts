import { NextResponse } from 'next/server';
import { getConfig, isRealtimeConfigured } from '@/lib/config';
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
  if (Number(req.headers.get('content-length')) > 2_000_000) return NextResponse.json({ code: 'INPUT_TOO_LARGE' }, { status: 413 });
  const input = await readBoundedJson(req);
  if (input === 'too-large') return NextResponse.json({ code: 'INPUT_TOO_LARGE' }, { status: 413 });
  const parsed = realtimeRequestSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  const body = parsed.data;
  log.info('request', { action: body.action });
  ensureInitialized();
  try {
    if (body.action === 'start') {
      if (!isRealtimeConfigured()) return NextResponse.json({ code: 'NOT_CONFIGURED', error: '请先配置 OpenAI API Key。' }, { status: 503 });
      const classroom = new RealtimeClassroomSession(body.courseId, body.learnerId, body.fresh);
      registerClassroom(classroom);
      log.info('started', { sessionId: classroom.session.id, model: getConfig().realtimeModel });
      return NextResponse.json({ sessionId: classroom.session.id, resume: classroom.resume, receipt: snapshot(classroom.session) });
    }
    requireOwner(body.sessionId, body.learnerId);
    const classroom = realtimeClassrooms.get(body.sessionId);
    if (!classroom) return NextResponse.json({ code: 'SESSION_EXPIRED' }, { status: 409 });
    if (body.action === 'end') {
      classroom.close(); endSession(body.sessionId); realtimeClassrooms.delete(body.sessionId);
      log.info('ended', { sessionId: body.sessionId });
      return NextResponse.json({ ok: true });
    }
    const run = new AbortController();
    const signal = AbortSignal.any([req.signal, run.signal]);
    let open = true;
    const cancelled = () => classroom.expire();
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: RealtimeEvent) => { if (open) controller.enqueue(new TextEncoder().encode(encodeRealtimeEvent(event))); };
        void classroom.turn(body.turnId, body.intent, emit, signal).catch((error) => {
          const code = error instanceof Error && /^[A-Z0-9_]{1,180}$/.test(error.message) ? error.message : 'REALTIME_FAILED';
          log.warn('turn failed', { sessionId: body.sessionId, turnId: body.turnId, code });
          emit({ type: 'error', code, message: '实时老师暂时断开了，请重新进入课堂，从已保存的进度继续。' });
        }).finally(() => { signal.removeEventListener('abort', cancelled); if (open) { open = false; controller.close(); } });
      },
      cancel() { open = false; run.abort(); classroom.expire(); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' } });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]{1,180}$/.test(error.message) ? error.message : 'REALTIME_FAILED';
    log.warn('request failed', { action: body.action, code });
    return NextResponse.json({ code, error: '课堂暂时无法继续，请重试。' }, { status: code === 'NOT_FOUND' ? 404 : code === 'SESSION_EXPIRED' ? 409 : 500 });
  }
}

async function readBoundedJson(req: Request): Promise<unknown> {
  if (!req.body) return null;
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) { await reader.cancel(); return 'too-large'; }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    return JSON.parse(body.toString('utf8'));
  } catch { return null; } finally { reader.releaseLock(); }
}

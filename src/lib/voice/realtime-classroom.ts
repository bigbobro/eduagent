'use client';

import type { Classroom, ClassroomEvents, LessonStateName } from './classroom';
import type { Course, PhaseName } from '@/types/course';
import type { ResumeInfo } from '@/lib/lesson-protocol';
import { parseResumeInfo } from '@/lib/lesson-protocol';
import { parseRealtimeEvent, type RealtimeIntent, type RealtimeEvent } from '@/lib/realtime-protocol';
import { LessonRecorder, type RecorderHandle } from '@/lib/audio/recorder';
import { PcmPlayer } from '@/lib/audio/pcm-player';

type Receipt = Extract<RealtimeEvent, { type: 'receipt' }>['receipt'];
interface Run {
  abort: AbortController; recorder: LessonRecorder; player: PcmPlayer;
  learnerId: string; sessionId: string | null; busy: boolean; state: LessonStateName;
  phase: PhaseName; cardId: string; quizId: string | null;
  tap: RecorderHandle | null; startup: Promise<void> | null; stopRequested: boolean;
  chunks: Uint8Array[]; bytes: number; recordingTimer: ReturnType<typeof setTimeout> | null;
  failed: { turnId: string; intent: RealtimeIntent } | null;
}
export class RealtimeClassroom implements Classroom {
  private listeners = new Map<keyof ClassroomEvents, Set<(data: never) => void>>();
  private run: Run | null = null;
  private resume: ResumeInfo | null = null;
  constructor(private course: Course) {}
  on<K extends keyof ClassroomEvents>(event: K, fn: (data: ClassroomEvents[K]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as (data: never) => void);
  }
  off<K extends keyof ClassroomEvents>(event: K, fn: (data: ClassroomEvents[K]) => void): void { this.listeners.get(event)?.delete(fn as (data: never) => void); }
  private emit<K extends keyof ClassroomEvents>(event: K, data: ClassroomEvents[K]): void { this.listeners.get(event)?.forEach((fn) => fn(data as never)); }
  private current(run: Run): boolean { return this.run === run && !run.abort.signal.aborted; }
  private state(run: Run, state: LessonStateName): void { if (this.current(run)) { run.state = state; this.emit('state', state); } }
  getState(): LessonStateName { return this.run?.state ?? 'idle'; }
  getResumeInfo(): ResumeInfo | null { return this.resume; }

  async startLesson(learnerId: string, options?: { fresh?: boolean }): Promise<boolean> {
    const previous = this.endLesson();
    const run: Run = { abort: new AbortController(), recorder: new LessonRecorder(24000), player: new PcmPlayer(24000), learnerId,
      sessionId: null, busy: true, state: 'greeting', phase: 'intro', cardId: '', quizId: null,
      tap: null, startup: null, stopRequested: false, chunks: [], bytes: 0, recordingTimer: null, failed: null };
    this.run = run; this.resume = null;
    this.emit('state', 'greeting'); this.emit('intro-busy-change', true);
    try {
      await previous;
      if (!this.current(run)) return false;
      await Promise.all([run.recorder.prewarm(), run.player.prewarm()]);
      if (!this.current(run)) return false;
      const response = await this.post(run, { action: 'start', courseId: this.course.id, learnerId, ...options });
      const body = await response.json();
      if (typeof body.sessionId !== 'string') throw new Error('REALTIME_PROTOCOL');
      if (!this.current(run)) { void this.endRemote(body.sessionId, learnerId); return false; }
      run.sessionId = body.sessionId;
      this.resume = parseResumeInfo(body.resume ? JSON.stringify(body.resume) : null);
      const event = parseRealtimeEvent(JSON.stringify({ type: 'receipt', receipt: body.receipt }));
      if (event.type !== 'receipt') throw new Error('REALTIME_PROTOCOL');
      this.apply(run, event.receipt);
      await this.request(run, { kind: 'opening' });
      if (!this.current(run)) return false;
      if (run.phase === 'intro') await this.request(run, { kind: 'phase', to: 'interactive' });
      if (run.phase === 'interactive' && run.cardId) await this.request(run, { kind: 'repeat', cardId: run.cardId });
      if (!this.current(run)) return false;
      run.busy = false; this.state(run, 'awaiting'); this.emit('intro-busy-change', false);
      return true;
    } catch (error) {
      if (this.current(run)) { this.error(error); await this.endLesson(); }
      return false;
    }
  }
  async endLesson(): Promise<void> {
    const run = this.run;
    if (!run) return;
    this.run = null; run.abort.abort();
    if (run.recordingTimer) clearTimeout(run.recordingTimer);
    await Promise.allSettled([run.tap?.stop(), run.recorder.dispose(), run.player.dispose(),
      run.sessionId ? this.endRemote(run.sessionId, run.learnerId) : Promise.resolve()]);
  }
  private async endRemote(sessionId: string, learnerId: string): Promise<void> {
    await fetch('/api/realtime', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end', sessionId, learnerId }), signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
  private async post(run: Run, body: object): Promise<Response> {
    const response = await fetch('/api/realtime', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.any([run.abort.signal, AbortSignal.timeout(65000)]) });
    if (!response.ok) {
      const problem: unknown = await response.json().catch(() => null);
      const code = problem && typeof problem === 'object' && 'code' in problem && typeof problem.code === 'string' && /^[A-Z0-9_]+$/.test(problem.code) ? problem.code : 'REALTIME_FAILED';
      throw new Error(code);
    }
    return response;
  }
  private apply(run: Run, receipt: Receipt, includeQuiz = true): void {
    if (!this.current(run)) return;
    const previousPhase = run.phase;
    run.phase = receipt.progress.currentPhase;
    run.cardId = receipt.cardId;
    this.emit('progress', receipt.progress);
    if (previousPhase !== run.phase || this.resume?.resumed) this.emit('phase-change', run.phase);
    if (run.cardId) this.emit('actions', [{ tool: 'show_card', params: { card_id: run.cardId } }]);
    if (receipt.assessment?.heard) {
      this.emit('subtitle', { text: receipt.assessment.heard, source: 'user', provenance: 'model' });
      this.emit('subtitle-clear', undefined);
    }
    if (includeQuiz && receipt.quiz) this.emit('quiz-result', receipt.quiz);
  }
  private async request(run: Run, intent: RealtimeIntent, turnId = crypto.randomUUID()): Promise<void> {
    if (!this.current(run) || !run.sessionId) throw new Error('SESSION_EXPIRED');
    run.failed = { turnId, intent };
    let receipt: Receipt | undefined;
    let done = false; let transcript = '';
    try {
      const response = await this.post(run, { action: 'turn', sessionId: run.sessionId, learnerId: run.learnerId, turnId, intent });
      if (!response.body) throw new Error('REALTIME_PROTOCOL');
      const reader = response.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      run.abort.signal.addEventListener('abort', cancel, { once: true });
      const decoder = new TextDecoder(); let buffer = '';
      try {
        for (;;) {
          const { value, done: ended } = await reader.read();
          if (!this.current(run)) throw new Error('SESSION_EXPIRED');
          if (ended) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 4_000_000) throw new Error('REALTIME_PROTOCOL');
          let index: number;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, index); buffer = buffer.slice(index + 2);
            const data = frame.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
            if (!data) continue;
            const event = parseRealtimeEvent(data);
            if (done) throw new Error('REALTIME_PROTOCOL');
            if (event.type === 'receipt') receipt = event.receipt;
            if (event.type === 'audio') {
              const text = atob(event.pcm); const pcm = new Uint8Array(text.length);
              for (let i = 0; i < text.length; i++) pcm[i] = text.charCodeAt(i);
              if (pcm.length % 2) throw new Error('REALTIME_PROTOCOL');
              run.player.enqueue(pcm.buffer); this.state(run, intent.kind === 'present-quiz' ? 'quiz-speaking' : 'speaking');
            }
            if (event.type === 'transcript') { transcript += event.text; this.emit('subtitle', { text: transcript, source: 'ai' }); }
            if (event.type === 'error') throw new Error(event.code);
            if (event.type === 'done') done = true;
          }
        }
        if (!done || buffer.trim()) throw new Error('REALTIME_TRUNCATED');
      } finally { run.abort.signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
      await this.drain(run);
      if (!this.current(run)) throw new Error('SESSION_EXPIRED');
      if (receipt) this.apply(run, receipt);
      run.failed = null;
    } catch (error) {
      await run.player.stop();
      if (receipt && this.current(run)) this.apply(run, receipt, false);
      throw error;
    }
  }
  private async drain(run: Run): Promise<void> {
    if (run.player.isIdle()) return;
    const signal = AbortSignal.any([run.abort.signal, AbortSignal.timeout(65000)]);
    await new Promise<void>((resolve, reject) => {
      const stop = () => { unsubscribe(); reject(new Error('REALTIME_PLAYBACK_CANCELLED')); };
      const unsubscribe = run.player.onIdle(() => { signal.removeEventListener('abort', stop); unsubscribe(); resolve(); });
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      else if (run.player.isIdle()) { signal.removeEventListener('abort', stop); unsubscribe(); resolve(); }
    });
  }
  private error(error: unknown): void {
    const code = error instanceof Error && /^[A-Z0-9_]{1,180}$/.test(error.message) ? error.message : 'REALTIME_FAILED';
    const settings = /NOT_CONFIGURED|AUTH|QUOTA|BALANCE|MODEL_UNAVAILABLE/.test(code);
    this.emit('error', { code, message: code === 'SESSION_EXPIRED' ? '实时会话已结束，请重新进入课堂，继续已保存的进度。' : settings ? '请到设置检查 OpenAI 密钥、模型权限或额度。' : '实时老师暂时没连上，可以重试这一步或退出后继续。' });
  }
  private async perform(work: (run: Run) => Promise<void>): Promise<void> {
    const run = this.run;
    if (!run || run.busy || !this.current(run)) throw new Error('TURN_BUSY');
    run.busy = true; this.state(run, 'thinking');
    try { await work(run); }
    catch (error) { if (this.current(run)) { this.error(error); this.state(run, 'idle'); } throw error; }
    finally { if (this.current(run)) { run.busy = false; if (!run.failed) this.state(run, 'awaiting'); } }
  }
  async repeatCard(cardId: string): Promise<void> { await this.perform((run) => this.request(run, { kind: 'repeat', cardId })).catch(() => {}); }
  async requestIntroCard(cardId: string): Promise<boolean> {
    if (this.run?.phase !== 'intro' || this.run.busy) return false;
    try { await this.perform((run) => this.request(run, { kind: 'intro-card', cardId })); return true; } catch { return false; }
  }
  async retryTransition(): Promise<void> { await this.retryLastTurn(); }
  async retryLastTurn(): Promise<void> {
    const failed = this.run?.failed; if (!failed) return;
    await this.perform((run) => this.request(run, failed.intent, failed.turnId)).catch(() => {});
  }
  async completeReinforcement(): Promise<void> { await this.perform((run) => this.request(run, { kind: 'phase', to: 'done' })).catch(() => {}); }
  async presentQuiz(quizId: string): Promise<void> {
    await this.perform(async (run) => { await this.request(run, { kind: 'present-quiz', quizId }); run.quizId = quizId; });
  }
  async submitPick(quizId: string, picked: string): Promise<void> {
    this.emit('quiz-saving', true);
    try { await this.perform((run) => this.request(run, { kind: 'pick', quizId, cardId: picked })); }
    catch { this.emit('quiz-result', { quizId, ok: false, correct: false, source: 'application', next: 'retry' }); }
    finally { this.emit('quiz-saving', false); }
  }
  async retryQuiz(): Promise<void> { this.emit('quiz-saving', true); await this.retryLastTurn(); this.emit('quiz-saving', false); }
  async startListening(): Promise<void> { await this.beginRecording(null); }
  async startQuizListening(quizId: string): Promise<void> { await this.beginRecording(quizId); }
  private async beginRecording(quizId: string | null): Promise<void> {
    const run = this.run;
    if (!run || run.busy || run.startup || run.tap || run.failed || run.state !== 'awaiting') return;
    if (quizId && run.quizId !== quizId) return;
    run.quizId = quizId; run.stopRequested = false; run.chunks = []; run.bytes = 0;
    this.state(run, 'listening');
    const startup = (async () => {
      const tap = await run.recorder.start({ onChunk: (pcm) => {
        if (!this.current(run)) return;
        const chunk = new Uint8Array(pcm);
        if (run.bytes + chunk.byteLength > 1_440_000) { void this.stopListening(); return; }
        run.chunks.push(chunk); run.bytes += chunk.byteLength;
      } });
      if (!this.current(run)) { await tap.stop(); return; }
      run.tap = tap;
    })();
    run.startup = startup;
    try { await startup; }
    catch (error) { if (this.current(run)) { this.error(error); this.state(run, 'awaiting'); } }
    finally { if (this.current(run) && run.startup === startup) run.startup = null; }
    if (!this.current(run)) return;
    if (run.stopRequested) await this.stopListening();
    else if (run.tap) run.recordingTimer = setTimeout(() => { void this.stopListening(); }, 30_000);
  }
  async stopListening(): Promise<void> {
    const run = this.run; if (!run || !this.current(run)) return;
    if (run.startup) { run.stopRequested = true; return; }
    const tap = run.tap; if (!tap) return;
    run.tap = null;
    if (run.recordingTimer) clearTimeout(run.recordingTimer); run.recordingTimer = null;
    this.state(run, 'thinking');
    await tap.stop();
    if (!this.current(run)) return;
    const pcm = new Uint8Array(run.bytes); let offset = 0;
    for (const chunk of run.chunks) { pcm.set(chunk, offset); offset += chunk.length; }
    run.chunks = []; run.bytes = 0;
    if (pcm.length < 4800 || pcm.every((byte) => byte === 0)) { this.state(run, 'awaiting'); return; }
    const parts: string[] = [];
    for (let i = 0; i < pcm.length; i += 8192) parts.push(String.fromCharCode(...Array.from(pcm.subarray(i, i + 8192))));
    const oldCard = run.cardId;
    if (run.quizId) this.emit('quiz-saving', true);
    await this.perform(async (current) => {
      await this.request(current, { kind: 'audio', targetId: current.quizId ?? current.cardId, pcm: btoa(parts.join('')) });
      if (current.phase === 'interactive' && current.cardId !== oldCard) await this.request(current, { kind: 'repeat', cardId: current.cardId });
    }).catch(() => {});
    if (this.current(run)) this.emit('quiz-saving', false);
  }
}

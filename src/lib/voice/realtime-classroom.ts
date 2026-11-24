'use client';

import { findQuiz, type AnswerResult, type Classroom, type ClassroomEvents, type LessonStateName } from './classroom';
import { playCardSound, preloadCardSounds } from './page-audio';
import type { Course, PhaseName } from '@/types/course';
import type { ResumeInfo } from '@/lib/lesson-protocol';
import { parseResumeInfo, invalidProgressMessage } from '@/lib/lesson-protocol';
import { MANUAL_TURN } from '@/lib/realtime/manual-turn';
import type { ManualTurnVad } from './manual-turn-vad';
import { parseRealtimeEvent, receiptSchema, type PresentedTarget, type ProviderEvent, type RealtimeEvent } from '@/lib/realtime-protocol';

type Receipt = Extract<RealtimeEvent, { type: 'receipt' }>['receipt'];
/** The mic reopens this long after the teacher went idle, to let the loudspeaker tail (Bluetooth latency, room echo) die out. */
const SPEAKER_RELEASE_MS = 500;
interface Waiter { match: (metadata: Record<string, string>) => boolean; responseId?: string; resolve: () => void }
interface Run {
  abort: AbortController; learnerId: string; sessionId: string | null; transport: 'webrtc' | 'mock';
  state: LessonStateName; phase: PhaseName; cardId: string; revision: number; resumeShown: boolean;
  stream: MediaStream | null; pc: RTCPeerConnection | null; channel: RTCDataChannel | null; audio: HTMLAudioElement | null;
  paused: boolean; childSpeaking: boolean; playing: boolean; waitingReply: ReturnType<typeof setTimeout> | null;
  active: Set<string>; done: Set<string>; transcripts: Map<string, string>;
  waiters: Set<Waiter>; presented: string; failed: (() => Promise<void>) | null;
  pick: { turnId: string; quizId: string; cardId: string } | null; finishing: boolean;
  // Speaker mode: the mic track is gated while the teacher generates or plays (see syncMic).
  speaker: boolean; micHold: boolean; micRelease: ReturnType<typeof setTimeout> | null;
  // Manual-turn mode only: the local VAD, the ordered speech-signal chain and the pause window after `end`.
  vad: ManualTurnVad | null; signals: Promise<unknown>; silence: ReturnType<typeof setTimeout> | null;
  // Word-card sound: `sound` waits for the teacher to be idle, `soundPlaying` while it plays; `cue` = either (gates the mic, see syncMic).
  sound: { cardId: string; url: string } | null; soundPlaying: boolean; cue: boolean;
  // The card whose English a sound quiz hides, until a correct answer or an ordinary show_card of it.
  hiddenCardId: string;
}
/** Word-card sound playback; injectable for tests. */
export interface CardSounds { play(url: string): Promise<void>; preload(urls: readonly string[]): void }
const PAGE_SOUNDS: CardSounds = { play: playCardSound, preload: preloadCardSounds };
const FATAL_MESSAGE = '实时连接已断开，请重新进入课堂，从已保存的进度继续。';
const QUOTA_MESSAGE = 'OpenAI 额度不足，请到 OpenAI 控制台检查余额和账单后再试。';

/** Natural Realtime classroom: one always-open microphone over WebRTC; the server sideband owns tools and saving. */
export class RealtimeClassroom implements Classroom {
  readonly interaction = 'conversation' as const;
  private listeners = new Map<keyof ClassroomEvents, Set<(data: never) => void>>();
  private run: Run | null = null;
  private resume: ResumeInfo | null = null;
  constructor(private course: Course, private sounds: CardSounds = PAGE_SOUNDS) {}
  on<K extends keyof ClassroomEvents>(event: K, fn: (data: ClassroomEvents[K]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as (data: never) => void);
  }
  off<K extends keyof ClassroomEvents>(event: K, fn: (data: ClassroomEvents[K]) => void): void { this.listeners.get(event)?.delete(fn as (data: never) => void); }
  private emit<K extends keyof ClassroomEvents>(event: K, data: ClassroomEvents[K]): void { this.listeners.get(event)?.forEach((fn) => fn(data as never)); }
  private current(run: Run): boolean { return this.run === run && !run.abort.signal.aborted; }
  private state(run: Run, state: LessonStateName): void { if (this.current(run) && run.state !== state) { run.state = state; this.emit('state', state); } }
  getState(): LessonStateName { return this.run?.state ?? 'idle'; }
  getResumeInfo(): ResumeInfo | null { return this.resume; }

  async startLesson(learnerId: string, options?: { fresh?: boolean; game?: boolean; speaker?: boolean }): Promise<boolean> {
    const previous = this.endLesson();
    const run: Run = { abort: new AbortController(), learnerId, sessionId: null, transport: 'webrtc', state: 'greeting', phase: 'intro', cardId: '', revision: -1, resumeShown: false,
      stream: null, pc: null, channel: null, audio: null, paused: false, childSpeaking: false, playing: false, waitingReply: null,
      active: new Set(), done: new Set(), transcripts: new Map(), waiters: new Set(), presented: '', failed: null, pick: null, finishing: false, speaker: options?.speaker === true, micHold: false, micRelease: null, vad: null, signals: Promise.resolve(), silence: null,
      sound: null, soundPlaying: false, cue: false, hiddenCardId: '' };
    this.run = run; this.resume = null;
    this.emit('state', 'greeting'); this.emit('intro-busy-change', true);
    try {
      await previous;
      if (!this.current(run)) return false;
      const body = await (await this.post(run, { action: 'start', courseId: this.course.id, learnerId, ...options })).json();
      if (typeof body.sessionId !== 'string') throw new Error('REALTIME_PROTOCOL');
      if (!this.current(run)) { void this.endRemote(body.sessionId, learnerId); return false; }
      run.sessionId = body.sessionId; run.transport = body.transport === 'mock' ? 'mock' : 'webrtc';
      this.resume = parseResumeInfo(body.resume ? JSON.stringify(body.resume) : null);
      this.apply(run, receiptSchema.parse(body.receipt));
      this.sounds.preload(this.course.cards.flatMap((card) => card.soundUrl ? [card.soundUrl] : []));
      // The only microphone capture of the lesson. Echo cancellation alone is not enough on a loudspeaker; speaker mode gates the mic while the teacher speaks.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (!this.current(run)) { stream.getTracks().forEach((track) => track.stop()); return false; }
      run.stream = stream;
      let sdp: string | null = null;
      if (run.transport === 'webrtc') {
        const pc = new RTCPeerConnection(); run.pc = pc;
        const audio = new Audio(); audio.autoplay = true; run.audio = audio;
        pc.ontrack = (event) => { if (this.current(run)) audio.srcObject = event.streams[0]; };
        pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.fatal(run, 'PROVIDER_DISCONNECTED'); };
        stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
        run.channel = pc.createDataChannel('oai-events');
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        sdp = offer.sdp ?? null;
      }
      const reader = await this.connect(run, sdp);
      if (!this.current(run)) return false;
      void this.listen(run, reader);
      if (body.turnMode === 'manual') await this.startVad(run);
      if (!this.current(run)) return false;
      run.failed = null; this.state(run, this.derive(run)); this.emit('intro-busy-change', false);
      return true;
    } catch (error) {
      if (this.current(run)) { this.error(error); await this.endLesson(); }
      return false;
    }
  }
  async endLesson(): Promise<void> {
    const run = this.run;
    if (!run) return;
    this.run = null;
    this.release(run);
    // End the call explicitly before cancelling the stream; a cancelled stream alone also ends it server-side.
    if (run.sessionId) await this.endRemote(run.sessionId, run.learnerId);
    run.abort.abort();
  }
  /** Manual-turn mode: the app decides turns, so the local VAD on the lesson's single mic stream sends speech start/end. */
  private async startVad(run: Run): Promise<void> {
    if (!run.stream) throw new Error('MICROPHONE_UNAVAILABLE');
    const { startManualTurnVad } = await import('./manual-turn-vad');
    const vad = await startManualTurnVad(run.stream, {
      onStart: () => {
        if (!this.current(run) || run.paused || run.finishing) return;
        if (run.silence) { clearTimeout(run.silence); run.silence = null; }
        this.stopWaiting(run);
        run.childSpeaking = true; this.state(run, this.derive(run));
        this.signal(run, { phase: 'start' });
      },
      onEnd: (voicedMs) => {
        if (!this.current(run) || run.paused || run.finishing || !run.childSpeaking) return;
        this.signal(run, { phase: 'end', voicedMs: Math.round(voicedMs) });
        // The server waits commitAfterSilenceMs before committing; until then the child may continue the same turn.
        run.silence = setTimeout(() => { run.silence = null; this.speechStopped(run); this.state(run, this.derive(run)); }, MANUAL_TURN.commitAfterSilenceMs);
      },
    }).catch((error) => { console.error('[realtime] manual-turn VAD failed to start', error); throw new Error('REALTIME_FAILED'); });
    if (!this.current(run)) { vad.destroy(); return; }
    run.vad = vad;
  }
  /** Speech signals reach the server in order, one request at a time. Failures only cost this turn. */
  private signal(run: Run, body: { phase: 'start' | 'end'; voicedMs?: number }): void {
    run.signals = run.signals.then(() => this.post(run, this.owned(run, { action: 'speech', ...body }))).catch(() => {});
  }
  private stopWaiting(run: Run): void { if (run.waitingReply) { clearTimeout(run.waitingReply); run.waitingReply = null; } }
  private release(run: Run): void {
    if (run.silence) clearTimeout(run.silence);
    run.silence = null; run.vad?.destroy(); run.vad = null;
    if (run.micRelease) { clearTimeout(run.micRelease); run.micRelease = null; }
    if (run.waitingReply) clearTimeout(run.waitingReply);
    run.waiters.forEach((waiter) => waiter.resolve()); run.waiters.clear();
    run.sound = null; run.cue = run.soundPlaying;
    try { run.channel?.close(); } catch { /* already closed */ }
    run.pc?.close();
    run.stream?.getTracks().forEach((track) => track.stop());
    if (run.audio) { run.audio.pause(); run.audio.srcObject = null; }
    run.channel = null; run.pc = null; run.stream = null; run.audio = null;
  }
  private async endRemote(sessionId: string, learnerId: string): Promise<void> {
    await fetch('/api/realtime', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end', sessionId, learnerId }), signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
  private async post(run: Run, body: object, signal: AbortSignal = AbortSignal.any([run.abort.signal, AbortSignal.timeout(20000)])): Promise<Response> {
    const response = await fetch('/api/realtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!response.ok) {
      const problem: unknown = await response.json().catch(() => null);
      const code = problem && typeof problem === 'object' && 'code' in problem && typeof problem.code === 'string' && /^[A-Z0-9_]+$/.test(problem.code) ? problem.code : 'REALTIME_FAILED';
      throw new Error(code);
    }
    return response;
  }
  private owned(run: Run, body: object): object { return { sessionId: run.sessionId, learnerId: run.learnerId, ...body }; }
  /** Opens the call's long-lived event stream; the first event carries the SDP answer. */
  private async connect(run: Run, sdp: string | null): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const deadline = new AbortController(); const timer = setTimeout(() => deadline.abort(), 20000);
    try {
      const response = await this.post(run, this.owned(run, { action: 'connect', sdp }), AbortSignal.any([run.abort.signal, deadline.signal]));
      if (!response.body) throw new Error('REALTIME_PROTOCOL');
      const reader = response.body.getReader();
      run.abort.signal.addEventListener('abort', () => { void reader.cancel().catch(() => {}); }, { once: true });
      deadline.signal.addEventListener('abort', () => { void reader.cancel().catch(() => {}); }, { once: true });
      const first = await this.next(reader, run);
      if (first?.type !== 'answer') throw new Error(first?.type === 'error' ? first.code : 'REALTIME_PROTOCOL');
      if (run.pc) {
        if (!first.sdp) throw new Error('REALTIME_PROTOCOL');
        await run.pc.setRemoteDescription({ type: 'answer', sdp: first.sdp });
      }
      return reader;
    } finally { clearTimeout(timer); }
  }
  private buffers = new WeakMap<ReadableStreamDefaultReader<Uint8Array>, { text: string; decoder: TextDecoder; events: RealtimeEvent[] }>();
  private async next(reader: ReadableStreamDefaultReader<Uint8Array>, run: Run): Promise<RealtimeEvent | null> {
    let state = this.buffers.get(reader);
    if (!state) { state = { text: '', decoder: new TextDecoder(), events: [] }; this.buffers.set(reader, state); }
    for (;;) {
      if (state.events.length) return state.events.shift()!;
      const { value, done } = await reader.read();
      if (done || !this.current(run)) return null;
      state.text += state.decoder.decode(value, { stream: true });
      if (state.text.length > 1_000_000) throw new Error('REALTIME_PROTOCOL');
      let index: number;
      while ((index = state.text.indexOf('\n\n')) >= 0) {
        const frame = state.text.slice(0, index); state.text = state.text.slice(index + 2);
        const data = frame.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
        if (data) state.events.push(parseRealtimeEvent(data));
      }
    }
  }
  private async listen(run: Run, reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      for (;;) {
        const event = await this.next(reader, run);
        if (!this.current(run)) return;
        if (!event) { this.fatal(run, 'SESSION_EXPIRED'); return; }
        if (event.type === 'receipt') this.apply(run, event.receipt);
        else if (event.type === 'provider') this.provider(run, event.event);
        else if (event.type === 'clear-output') { if (run.channel?.readyState === 'open') run.channel.send(JSON.stringify({ type: 'output_audio_buffer.clear' })); }
        else if (event.type === 'error') { this.fatal(run, event.code); return; }
        else if (event.type === 'sitting-wrap-up') this.emit('sitting-wrap-up', undefined);
        else if (event.type === 'sitting-ended') {
          // Course not complete: same wind-down as completion (mic off, wait for the goodbye, end the call), different end page.
          this.emit('sitting-ended', undefined); void this.finish(run);
        }
      }
    } catch { if (this.current(run)) this.fatal(run, 'REALTIME_PROTOCOL'); }
  }
  private fatal(run: Run, code: string): void {
    if (!this.current(run)) return;
    const settings = /AUTH|QUOTA|MODEL_UNAVAILABLE/.test(code);
    this.emit('error', { code: settings ? code : 'SESSION_EXPIRED', message: code === 'REALTIME_INSUFFICIENT_QUOTA' ? QUOTA_MESSAGE : settings ? '请到设置检查 OpenAI 密钥、模型权限或额度。' : FATAL_MESSAGE });
    this.state(run, 'idle');
    void this.endLesson();
  }
  private apply(run: Run, receipt: Receipt): void {
    // Receipts arrive on the ordered stream and, for picks, in the request response too; apply each revision once.
    if (!this.current(run) || receipt.revision <= run.revision) return;
    run.revision = receipt.revision;
    const previousPhase = run.phase;
    run.phase = receipt.progress.currentPhase; run.cardId = receipt.cardId;
    this.emit('progress', receipt.progress);
    const answer = this.answer(receipt);
    if (answer) this.emit('answer-result', answer);
    this.cueReceipt(run, receipt, previousPhase, answer);
    if (previousPhase !== run.phase || (this.resume?.resumed && !run.resumeShown)) { run.resumeShown = true; this.emit('phase-change', run.phase); }
    if (run.cardId && run.phase !== 'reinforcement' && run.phase !== 'done') this.emit('actions', [{ tool: 'show_card', params: { card_id: run.cardId } }]);
    if (receipt.assessment?.heard) {
      this.emit('subtitle', { text: receipt.assessment.heard, source: 'user', provenance: 'model' });
      this.emit('subtitle-clear', undefined);
    }
    if (receipt.quiz) this.emit('quiz-result', receipt.quiz);
    if (run.phase === 'done') void this.finish(run);
  }
  /** One answer stream for presentation layers: a spoken card, a repeat-after-me question or a picture choice, keyed by course card. */
  private answer(receipt: Receipt): AnswerResult | null {
    const assessed = receipt.assessment;
    if (receipt.quiz) {
      if (!receipt.quiz.ok) return null;
      const quiz = findQuiz(this.course, receipt.quiz.quizId);
      if (!quiz) return null;
      const result = assessed?.result ?? (receipt.quiz.correct ? 'correct' : 'wrong');
      return quiz.type === 'pick-word'
        ? { cardId: quiz.correctCardId, via: 'choice', result, mastered: false, quizId: quiz.id, revision: receipt.revision }
        : { cardId: quiz.cardId, via: 'voice', result, mastered: false, quizId: quiz.id, revision: receipt.revision };
    }
    if (!assessed || !this.course.cards.some((card) => card.id === assessed.target_id)) return null;
    return { cardId: assessed.target_id, via: 'voice', result: assessed.result, mastered: assessed.mastered, revision: receipt.revision };
  }
  private provider(run: Run, event: ProviderEvent): void {
    const id = event.response?.id ?? event.response_id ?? '';
    switch (event.type) {
      case 'input_audio_buffer.speech_started': run.childSpeaking = true; break;
      case 'input_audio_buffer.speech_stopped': this.speechStopped(run); break;
      case 'response.created': {
        run.active.add(id);
        if (run.waitingReply) { clearTimeout(run.waitingReply); run.waitingReply = null; }
        const metadata = event.response?.metadata;
        if (metadata) run.waiters.forEach((waiter) => { if (!waiter.responseId && waiter.match(metadata)) waiter.responseId = id; });
        break;
      }
      case 'response.output_audio_transcript.delta': {
        const text = (run.transcripts.get(id) ?? '') + (event.delta ?? '');
        run.transcripts.set(id, text);
        this.emit('subtitle', { text, source: 'ai', messageId: id });
        break;
      }
      // The provider reports ONE output buffer: back-to-back responses give a single started (first id) and a
      // single stopped (last id). A drained buffer means every response that finished generating has played.
      case 'output_audio_buffer.started': run.playing = true; break;
      case 'output_audio_buffer.stopped':
        run.playing = false;
        this.settle(run, (responseId) => run.done.has(responseId));
        break;
      case 'output_audio_buffer.cleared':
        // Interruption or pause discards all unplayed teacher audio.
        run.playing = false;
        if (run.transcripts.has(id)) this.emit('subtitle', { text: `${run.transcripts.get(id)} …`, source: 'ai', messageId: id });
        this.settle(run, () => true);
        break;
      case 'response.done':
        run.active.delete(id); run.done.add(id);
        if (event.response?.status !== 'completed') this.settle(run, (responseId) => responseId === id);
        break;
    }
    this.playSound(run);
    this.syncMic(run);
    this.state(run, this.derive(run));
  }
  /** Card receipts: a `cue` queues the card's own sound; a sound quiz hides the English until a correct answer for that card
   *  or an ordinary show_card of it. Assessment, practice and phase receipts carry the current card too: they are not a show. */
  private cueReceipt(run: Run, receipt: Receipt, previousPhase: PhaseName, answer: AnswerResult | null): void {
    if (run.sound && run.sound.cardId !== receipt.cardId) { this.dropSound(run); this.syncMic(run); } // replaced before it started: skip it
    const hidden = run.hiddenCardId;
    const show = !receipt.assessment && !receipt.quiz && previousPhase === run.phase;
    if (hidden && (receipt.cardId !== hidden || run.phase !== 'interactive' || (show && receipt.cue !== 'sound-quiz')
      || (answer?.cardId === hidden && answer.result === 'correct'))) {
      run.hiddenCardId = ''; this.emit('word-hidden', { cardId: hidden, hidden: false });
    }
    const url = receipt.cue && run.phase === 'interactive' ? this.course.cards.find((card) => card.id === receipt.cardId)?.soundUrl : undefined;
    if (!url) return;
    if (receipt.cue === 'sound-quiz' && run.hiddenCardId !== receipt.cardId) { run.hiddenCardId = receipt.cardId; this.emit('word-hidden', { cardId: receipt.cardId, hidden: true }); }
    this.queueSound(run, receipt.cardId, url);
  }
  private queueSound(run: Run, cardId: string, url: string): void {
    if (run.sound?.cardId === cardId) return;
    if (run.sound) this.dropSound(run);
    run.sound = { cardId, url }; run.cue = true;
    this.emit('sound-cue', { cardId, status: 'waiting' });
    this.playSound(run); this.syncMic(run);
  }
  private dropSound(run: Run): void {
    const sound = run.sound; if (!sound) return;
    run.sound = null; run.cue = run.soundPlaying;
    this.emit('sound-cue', { cardId: sound.cardId, status: 'done' });
  }
  /** Plays the waiting sound once the teacher is idle (nothing generating or playing) and the lesson is not paused or ending. */
  private playSound(run: Run): void {
    const sound = run.sound;
    if (!sound || run.soundPlaying || !this.current(run)) return;
    if (run.finishing) { this.dropSound(run); this.syncMic(run); return; }
    if (run.paused || run.active.size > 0 || run.playing) return;
    run.sound = null; run.soundPlaying = true;
    this.emit('sound-cue', { cardId: sound.cardId, status: 'playing' });
    void this.sounds.play(sound.url).catch(() => {}).then(() => {
      run.soundPlaying = false; run.cue = run.sound !== null;
      if (!this.current(run)) return;
      this.emit('sound-cue', { cardId: sound.cardId, status: 'done' });
      this.playSound(run); this.syncMic(run);
    });
  }
  /** The only place that sets the mic track's `enabled` during a run. In speaker mode the mic stays closed while the teacher
   *  generates or plays; in every mode it stays closed while a word-card sound waits or plays. It reopens SPEAKER_RELEASE_MS
   *  after the last of these ended. */
  private syncMic(run: Run): void {
    const busy = run.cue || (run.speaker && (run.active.size > 0 || run.playing));
    if (busy) {
      if (run.micRelease) { clearTimeout(run.micRelease); run.micRelease = null; }
      run.micHold = true;
    } else if (run.micHold && !run.micRelease) {
      run.micRelease = setTimeout(() => {
        run.micRelease = null; run.micHold = false;
        if (this.current(run)) this.syncMic(run);
      }, SPEAKER_RELEASE_MS);
    }
    const enabled = !run.paused && !run.finishing && !run.micHold;
    run.stream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }
  /** The child stopped talking: `thinking` until the reply starts (or 8 s pass). */
  private speechStopped(run: Run): void {
    run.childSpeaking = false;
    this.stopWaiting(run);
    run.waitingReply = setTimeout(() => { run.waitingReply = null; this.state(run, this.derive(run)); }, 8000);
  }
  private settle(run: Run, matches: (responseId: string) => boolean): void {
    run.waiters.forEach((waiter) => { if (waiter.responseId && matches(waiter.responseId)) { run.waiters.delete(waiter); waiter.resolve(); } });
  }
  private derive(run: Run): LessonStateName {
    if (run.paused) return 'paused';
    if (run.childSpeaking) return 'listening';
    if (run.playing) return 'speaking';
    if (run.active.size || run.waitingReply) return 'thinking';
    return 'awaiting';
  }
  /** Resolves once the matching app response was generated and the output buffer drained, was cleared/cancelled, or after a bounded wait. */
  private waitFor(run: Run, match: Waiter['match'], ms: number): { promise: Promise<void>; cancel: () => void } {
    let waiter!: Waiter;
    const promise = new Promise<void>((resolve) => {
      const timer = setTimeout(() => { run.waiters.delete(waiter); resolve(); }, ms);
      waiter = { match, resolve: () => { clearTimeout(timer); resolve(); } };
      run.waiters.add(waiter);
    });
    return { promise, cancel: () => { run.waiters.delete(waiter); waiter.resolve(); } };
  }
  private async finish(run: Run): Promise<void> {
    if (run.finishing) return;
    run.finishing = true;
    this.syncMic(run);
    if (run.silence) { clearTimeout(run.silence); run.silence = null; }
    run.vad?.destroy(); run.vad = null;
    await this.waitFor(run, (metadata) => metadata.kind === 'goodbye', 20000).promise;
    if (this.current(run)) await this.endLesson();
  }
  private error(error: unknown): void {
    const code = error instanceof Error && /^[A-Z0-9_]{1,180}$/.test(error.message) ? error.message
      : error instanceof DOMException && ['NotAllowedError', 'NotFoundError', 'NotReadableError'].includes(error.name) ? 'MICROPHONE_UNAVAILABLE' : 'REALTIME_FAILED';
    const settings = /NOT_CONFIGURED|AUTH|QUOTA|BALANCE|MODEL_UNAVAILABLE/.test(code);
    this.emit('error', { code, message: code === 'INVALID_COURSE_PROGRESS' ? invalidProgressMessage : code === 'SESSION_EXPIRED' ? FATAL_MESSAGE
      : code === 'MICROPHONE_UNAVAILABLE' ? '没有拿到麦克风，请检查麦克风权限后重新进入课堂。'
      : code === 'REALTIME_INSUFFICIENT_QUOTA' ? QUOTA_MESSAGE
      : settings ? '请到设置检查 OpenAI 密钥、模型权限或额度。' : '实时老师暂时没连上，可以重试这一步或退出后继续。' });
  }
  /** App-side actions keep a retry closure; a provider/stream failure instead ends the run. */
  private async act(work: (run: Run) => Promise<void>): Promise<void> {
    const run = this.run;
    if (!run || !run.sessionId || !this.current(run)) throw new Error('SESSION_EXPIRED');
    const attempt = async () => {
      try { await work(run); if (this.current(run)) run.failed = null; }
      catch (error) { if (this.current(run)) { run.failed = attempt; this.error(error); } throw error; }
    };
    await attempt();
  }
  presented(target: PresentedTarget): void {
    const run = this.run; const key = `${target.kind}:${target.id}`;
    if (!run?.sessionId || !this.current(run) || run.presented === key) return;
    run.presented = key;
    void this.post(run, this.owned(run, { action: 'presented', target })).catch(() => { if (run.presented === key) run.presented = ''; });
  }
  async setPaused(paused: boolean): Promise<void> {
    const run = this.run; if (!run || !this.current(run) || run.paused === paused) return;
    run.paused = paused;
    this.syncMic(run);
    if (run.silence) { clearTimeout(run.silence); run.silence = null; }
    if (paused) { run.childSpeaking = false; run.vad?.pause(); } else run.vad?.resume();
    if (paused && run.channel?.readyState === 'open') run.channel.send(JSON.stringify({ type: 'output_audio_buffer.clear' }));
    if (!paused) { this.playSound(run); this.syncMic(run); }
    this.state(run, this.derive(run));
    await this.post(run, this.owned(run, { action: 'pause', paused })).catch(() => {});
  }
  replaySound(cardId: string): void {
    const run = this.run; const url = this.course.cards.find((card) => card.id === cardId)?.soundUrl;
    if (!run || !this.current(run) || !url || run.finishing || run.phase !== 'interactive' || cardId !== run.cardId) return;
    this.queueSound(run, cardId, url);
  }
  async repeatCard(cardId: string): Promise<void> { await this.act((run) => this.post(run, this.owned(run, { action: 'repeat', cardId })).then(() => {})).catch(() => {}); }
  async requestIntroCard(): Promise<boolean> { return false; }
  async retryTransition(): Promise<void> { await this.retryLastTurn(); }
  async retryLastTurn(): Promise<void> { const retry = this.run?.failed; if (retry) await retry().catch(() => {}); }
  async completeReinforcement(): Promise<void> {
    await this.act(async (run) => this.apply(run, receiptSchema.parse((await (await this.post(run, this.owned(run, { action: 'phase', to: 'done' }))).json()).receipt))).catch(() => {});
  }
  async presentQuiz(quizId: string): Promise<void> {
    const run = this.run; if (!run || !this.current(run)) throw new Error('SESSION_EXPIRED');
    const wait = this.waitFor(run, (metadata) => metadata.kind === 'present-quiz' && metadata.quiz_id === quizId, 30000);
    try { await this.post(run, this.owned(run, { action: 'present-quiz', quizId })); } catch (error) { wait.cancel(); throw error; }
    await wait.promise;
    if (!this.current(run)) throw new Error('SESSION_EXPIRED');
  }
  async submitPick(quizId: string, picked: string): Promise<void> {
    const owner = this.run; if (!owner || !this.current(owner)) return;
    owner.pick = { turnId: crypto.randomUUID(), quizId, cardId: picked };
    await this.sendPick(owner);
  }
  async retryQuiz(): Promise<void> { const owner = this.run; if (owner?.pick && this.current(owner)) await this.sendPick(owner); }
  private async sendPick(owner: Run): Promise<void> {
    const pick = owner.pick!;
    this.emit('quiz-saving', true);
    try {
      const body = await (await this.post(owner, this.owned(owner, { action: 'pick', ...pick }))).json();
      this.apply(owner, receiptSchema.parse(body.receipt));
    } catch { if (this.current(owner)) this.emit('quiz-result', { quizId: pick.quizId, ok: false, correct: false, source: 'application', next: 'retry' }); }
    finally { if (this.current(owner)) this.emit('quiz-saving', false); }
  }
  // Conversation mode has no push-to-talk capture; the provider's turn detection decides turns.
  async startListening(): Promise<void> {}
  async stopListening(): Promise<void> {}
  async startQuizListening(): Promise<void> {}
}

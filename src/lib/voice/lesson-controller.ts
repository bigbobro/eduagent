'use client';

import { encodeLessonRequest, parseLessonEvent, parseResumeInfo, lessonAckSchema, invalidProgressMessage, type LessonCustomAction, type LessonCommandResult, type ResumeInfo, type StreamUserEvent, type LessonProgressSnapshot } from '@/lib/lesson-protocol';
export type { LessonCommandResult, ResumeInfo } from '@/lib/lesson-protocol';

import { v4 as uuidv4 } from 'uuid';
import type { PhaseName } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { AsrClient, type AsrClientSessionContext } from './asr-client';
import { TtsClient } from './tts-client';
import { PcmPlayer } from '@/lib/audio/pcm-player';
import { LessonRecorder, type RecorderHandle } from '@/lib/audio/recorder';
import { TurnTimeoutGuard } from './turn-timeout-guard';

export type LessonStateName =
  | 'idle' | 'greeting' | 'awaiting' | 'listening' | 'thinking' | 'speaking' | 'quiz-speaking' | 'ending';

type EventName =
  | 'state'
  | 'subtitle'           // { text: string, source: 'user' | 'ai' }
  | 'subtitle-clear'
  | 'actions'            // ToolAction[]
  | 'progress'
  | 'phase-change'
  | 'asr-final'
  | 'error';             // { message: string }

type Listener<T = any> = (data: T) => void;

interface StartListeningOptions {
  routeToChat?: boolean;
  /** repeat-after-me 句子轮的 ASR 候选句(当前 quiz 句在前),仅 routeToChat:false 生效。 */
  asrSentenceTexts?: string[];
}

export class LessonController {
  private state: LessonStateName = 'idle';
  private listeners = new Map<EventName, Set<Listener>>();
  private sessionId: string | null = null;

  private tts = new TtsClient();
  private asr: AsrClient | null = null;
  private player = new PcmPlayer(24000);
  private recorder: RecorderHandle | null = null;
  private audioRecorder = new LessonRecorder();
  private run = new AbortController();
  private ending: Promise<void> | null = null;
  private starting: Promise<boolean> | null = null;
  private recorderLock = false; // Prevent rapid Space press race
  private chatAbort: AbortController | null = null;
  // Named one-shot recovery timers (asrFinal / chatWatchdog / speechFinish). The
  // arm/clear/teardown bookkeeping lives in TurnTimeoutGuard; the recovery callbacks
  // (which touch lesson state) stay below in the methods that arm each timer.
  private timers = new TurnTimeoutGuard();
  private listenStartedAt = 0;
  private listenStoppedAt = 0;
  private speechStreamFinished = false;
  private routeCurrentAsrToChat = true;
  private pendingActions: ToolAction[] | null = null;
  private sseCommitted = false;
  private listenStartup: { stopRequestedAt: number | null } | null = null;
  private courseId: string | null = null;
  private currentAsrCardId: string | null = null;
  private clearedCardIds: string[] = [];
  private asrSentenceTexts: string[] = [];
  private ttsHandlersBound = false;
  private resumeInfo: ResumeInfo | null = null;
  private staticSpeech: {
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;
  private static readonly SPEECH_FINISH_FALLBACK_MS = 1500;
  private static readonly STATIC_SPEECH_TIMEOUT_MS = 10000;
  // Client backstop: server-side LLM deadline is 20s (see lib/llm.ts). If no SSE event arrives
  // within this window the whole route is unresponsive — abort and self-rescue to awaiting.
  private static readonly CHAT_WATCHDOG_MS = 25000;

  constructor() {
    this.player.onIdle(() => this.maybeReturnToAwaiting());
  }

  on(event: EventName, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: EventName, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: EventName, data?: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  private setState(s: LessonStateName): void {
    this.state = s;
    this.emit('state', s);
  }

  getState(): LessonStateName { return this.state; }

  // ─── 课堂生命周期 ─────────────────────────────────────────────────

  async startLesson(courseId: string): Promise<boolean> {
    if (this.starting && !this.run.signal.aborted) return this.starting;
    if (!this.ending && this.state !== 'idle') return false;
    const pending = this.startRun(courseId);
    this.starting = pending;
    try { return await pending; }
    finally { if (this.starting === pending) this.starting = null; }
  }

  private async startRun(courseId: string): Promise<boolean> {
    let failureMessage = '课堂暂时没准备好,再试一次吧';
    const run = new AbortController();
    this.run = run;
    if (this.ending) await this.ending;
    if (!this.isCurrent(run)) return false;
    this.audioRecorder = new LessonRecorder();
    this.courseId = courseId;
    this.currentAsrCardId = null;
    this.clearedCardIds = [];
    this.asrSentenceTexts = [];
    this.setState('greeting');
    // 1) 并行启动:TTS 长连 + mic 预热 + player 预热(权限框、AudioContext、Worklet、MediaStream 全提前就绪)
    //    开场白播完用户按住空格那一刻,worklet node 只需 connect 一下,几乎瞬间就能出 PCM。
    try {
      await this.untilCanceled(Promise.all([
        this.tts.open().catch((e) => {
          if (!this.isCurrent(run)) return;
          console.warn('[lesson] tts open failed (continuing text-only):', e);
          this.emit('error', { message: '语音暂时连不上,先继续文字流程' });
        }),
        this.audioRecorder.prewarm().catch((e) => {
          if (!this.isCurrent(run)) return;
          console.warn('[lesson] mic prewarm failed (will retry on first press):', e);
        }),
        this.player.prewarm().catch((e) => {
          if (!this.isCurrent(run)) return;
          console.warn('[lesson] player prewarm failed:', e);
        }),
      ]), run.signal);
      if (!this.isCurrent(run)) return false;
      this.bindTtsHandlers();

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: encodeLessonRequest({ action: 'start', courseId }),
        signal: run.signal,
      });
      if (!this.isCurrent(run)) {
        void res.body?.cancel().catch(() => {});
        const lateSession = res.headers.get('X-Session-Id');
        if (lateSession) void this.endRemoteSession(lateSession);
        return false;
      }
      if (res.status === 409) {
        const problem: unknown = await res.json();
        if (problem && typeof problem === 'object' && 'code' in problem && problem.code === 'INVALID_COURSE_PROGRESS') {
          failureMessage = invalidProgressMessage;
        }
      }
      if (!res.ok || !res.body) throw new Error(`Start failed: ${res.status}`);
      this.sessionId = res.headers.get('X-Session-Id');
      this.resumeInfo = parseResumeInfo(res.headers.get('X-Resume-Info'));
      await this.consumeSSE(res.body, () => {}, run);
      return this.isCurrent(run);
    } catch (error) {
      if (!this.isCurrent(run)) return false;
      console.warn('[lesson] start failed:', error);
      this.emit('error', { message: failureMessage });
      await this.endLesson();
      return false;
    }
  }

  endLesson(): Promise<void> {
    const run = this.run;
    run.abort(); // Invalidate before the first await or resource callback.
    if (this.ending) return this.ending;
    this.setState('ending');
    this.chatAbort?.abort();
    this.timers.clearAll();
    this.pendingActions = null;
    this.sseCommitted = false;
    this.speechStreamFinished = false;
    this.resumeInfo = null;
    this.courseId = null;
    this.currentAsrCardId = null;
    this.clearedCardIds = [];
    this.asrSentenceTexts = [];
    this.listenStartup = null;
    this.recorderLock = false;
    this.routeCurrentAsrToChat = true;
    const sessionId = this.sessionId;
    this.sessionId = null;
    const recorder = this.recorder;
    this.recorder = null;
    const asr = this.asr;
    this.asr = null;
    try { asr?.close(); } catch {}
    this.failStaticSpeech(new Error('Lesson ended'));
    this.tts.close();
    const ending = Promise.allSettled([
      recorder?.stop(), this.player.dispose(), this.audioRecorder.dispose(),
      sessionId ? this.endRemoteSession(sessionId) : Promise.resolve(),
    ]).then(() => {
      if (this.run === run) this.setState('idle');
    }).finally(() => {
      if (this.ending === ending) this.ending = null;
    });
    this.ending = ending;
    return ending;
  }

  private async endRemoteSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: encodeLessonRequest({ action: 'end', sessionId }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) console.warn('[lesson] end request failed:', response.status);
    } catch (error) { console.warn('[lesson] end request failed:', error); }
  }

  private isCurrent(run: AbortController): boolean {
    return this.run === run && !run.signal.aborted;
  }

  private untilCanceled<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Lesson ended', 'AbortError'));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
      work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }

  /**
   * Send a custom chat action and consume the returned SSE through the existing TTS/action path.
   */
  async sendCustomAction(body: LessonCustomAction): Promise<LessonCommandResult> {
    const run = this.run;
    if (!this.isCurrent(run)) return { ok: false };
    let acceptedPhase: PhaseName | undefined;
    try {
      if (!this.sessionId) throw new Error('Session not started');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: encodeLessonRequest({ ...body, sessionId: this.sessionId }),
        signal: run.signal,
      });
      if (!this.isCurrent(run)) { void res.body?.cancel().catch(() => {}); return { ok: false }; }
      if (!res.ok || !res.body) throw new Error(`Action ${body.action} failed: ${res.status}`);
      const phase = res.headers.get('X-Lesson-Phase');
      if (phase === 'intro' || phase === 'interactive' || phase === 'reinforcement' || phase === 'done') {
        acceptedPhase = phase;
      }
      if (body.action === 'phase-transition' && acceptedPhase !== body.to) {
        throw new Error('Phase acknowledgement missing or mismatched');
      }
      await this.consumeSSE(res.body, () => {}, run);
      return this.isCurrent(run) ? { ok: true, acceptedPhase } : { ok: false };
    } catch (error) {
      if (!this.isCurrent(run)) return { ok: false };
      await this.recoverCommand(error, run);
      return { ok: false, acceptedPhase };
    }
  }

  async submitQuizAnswer(quizId: string, answer: string, correct: boolean): Promise<LessonCommandResult> {
    const run = this.run;
    if (!this.isCurrent(run)) return { ok: false };
    try {
      if (!this.sessionId) throw new Error('Session not started');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: encodeLessonRequest({ action: 'quiz-answer', sessionId: this.sessionId, quizId, answer, correct }),
        signal: run.signal,
      });
      if (!res.ok || !lessonAckSchema.safeParse(await res.json()).success) throw new Error(`Quiz acknowledgement failed: ${res.status}`);
      return { ok: this.isCurrent(run) };
    } catch (error) {
      if (!this.isCurrent(run)) return { ok: false };
      console.warn('[lesson] quiz save failed:', error);
      return { ok: false };
    }
  }

  private async recoverCommand(error: unknown, run = this.run): Promise<void> {
    if (!this.isCurrent(run)) return;
    console.warn('[lesson] command failed:', error);
    this.pendingActions = null;
    this.sseCommitted = false;
    this.speechStreamFinished = false;
    this.timers.clear('speechFinish');
    this.tts.cancelSession();
    await this.player.stop();
    if (!this.isCurrent(run)) return;
    this.routeCurrentAsrToChat = true;
    this.emit('error', { message: '我有点没反应过来…再试一次吧' });
    this.setState('awaiting');
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getResumeInfo(): ResumeInfo | null {
    return this.resumeInfo;
  }

  async speakStatic(text: string): Promise<void> {
    if (this.run.signal.aborted) throw new Error('Lesson ended');
    const trimmed = text.trim();
    if (!trimmed) return;
    if (this.staticSpeech) {
      throw new Error('Static TTS already in progress');
    }
    if (this.state !== 'awaiting') {
      throw new Error('Static TTS requires awaiting state');
    }

    this.bindTtsHandlers();
    this.speechStreamFinished = false;
    this.setState('quiz-speaking');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.failStaticSpeech(new Error('Static TTS timed out'));
      }, LessonController.STATIC_SPEECH_TIMEOUT_MS);
      this.staticSpeech = { resolve, reject, timeout };
      try {
        this.tts.startSession(uuidv4());
        this.tts.sendText(trimmed);
        this.tts.finishSession();
      } catch (error) {
        this.failStaticSpeech(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // ─── 录音流程(空格键 / 长按按钮 调用)────────────────────────────

  async startListening(options: StartListeningOptions = {}): Promise<void> {
    const run = this.run;
    if (!this.isCurrent(run)) return;
    if (this.state === 'listening') return;
    if (this.state !== 'awaiting') return; // speaking 时不打断 — 老师说完才能再说
    if (this.recorderLock) return; // Prevent race condition from rapid Space press

    this.recorderLock = true;
    this.routeCurrentAsrToChat = options.routeToChat ?? true;
    // Reinforcement repeat-after-me (routeToChat:false) has the child read whole sentences, not a
    // single word card. The interactive-phase word-card context is stale here (it freezes on the
    // LAST word card, e.g. "princess"), and injecting that one word as the sole ASR hot word biases
    // recognition against the sentence. Drop it so hot words fall back to the full course vocabulary,
    // and inject the quiz sentence candidates (2026-07-03) so the ASR biases toward the exact target
    // sentence (fixes "I play tennis." → "I'll play Thomas."-style misrecognition).
    if (options.routeToChat === false) {
      this.currentAsrCardId = null;
      this.asrSentenceTexts = (options.asrSentenceTexts ?? []).filter(Boolean);
    } else if (this.asrSentenceTexts.length > 0) {
      // Word rounds must never inherit sentence candidates from a previous quiz turn.
      this.asrSentenceTexts = [];
    }
    this.setState('listening');
    this.emit('subtitle-clear');
    this.listenStartedAt = performance.now();

    const asr = new AsrClient(this.getAsrSessionContext());
    this.asr = asr;
    const startup = { stopRequestedAt: null as number | null };
    this.listenStartup = startup;
    asr.on('partial', (text: string) => {
      if (!this.isCurrent(run) || this.asr !== asr) return;
      this.emit('subtitle', { text, source: 'user' });
    });
    asr.on('final', (text: string) => {
      if (!this.isCurrent(run) || this.asr !== asr) return;
      this.handleAsrFinal(text);
    });
    asr.on('error', (err: { message: string }) => {
      if (!this.isCurrent(run) || this.asr !== asr) return;
      this.routeCurrentAsrToChat = true;
      this.emit('error', err);
      this.setState('awaiting');
    });

    // 并行启动 ASR WS 与 recorder tap — 总等待时间 = max(asr.open, startRecorder)
    // recorder 已 prewarm,startRecorder 只是 new WorkletNode + connect,几毫秒就能出 PCM
    let recorderPromise: Promise<RecorderHandle>;
    try {
      recorderPromise = this.audioRecorder.start({
        onChunk: (pcm) => {
          if (this.isCurrent(run) && this.asr === asr) asr.sendPcm(pcm);
        },
      });
    } catch (e) {
      this.listenStartup = null;
      if (this.asr === asr) this.asr = null;
      this.recorderLock = false; // Release lock on recorder start failure
      this.routeCurrentAsrToChat = true;
      this.emit('error', { message: '麦克风开不了哦,请允许权限' });
      this.setState('awaiting');
      return;
    }
    // Attach rejection handling immediately while the ASR handshake is still pending.
    void recorderPromise.catch(() => {});
    try {
      await asr.open();
    } catch {
      if (!this.isCurrent(run)) { void recorderPromise.then((handle) => handle.stop()).catch(() => {}); return; }
      if (this.listenStartup === startup) this.listenStartup = null;
      if (this.asr === asr) this.asr = null;
      this.recorderLock = false; // Release lock on ASR open failure
      this.routeCurrentAsrToChat = true;
      this.emit('error', { message: 'ASR 连接失败,请重试' });
      // 录音也得清干净
      try { await (await recorderPromise).stop(); } catch {}
      if (!this.isCurrent(run)) return;
      this.setState('awaiting');
      return;
    }
    try {
      const recorder = await recorderPromise;
      if (!this.isCurrent(run) || this.asr !== asr || this.getState() !== 'listening') {
        await recorder.stop();
        if (!this.isCurrent(run)) return;
        if (this.listenStartup === startup) this.listenStartup = null;
        this.recorderLock = false; // Release lock when listening was cancelled mid-startup
        return;
      }
      this.recorder = recorder;
      this.recorderLock = false; // Release lock after recorder ready
      if (this.listenStartup === startup) this.listenStartup = null;
      if (startup.stopRequestedAt !== null) {
        await this.finishListening(startup.stopRequestedAt);
      }
    } catch (e) {
      if (!this.isCurrent(run)) return;
      this.recorderLock = false; // Release lock on error
      if (this.listenStartup === startup) this.listenStartup = null;
      this.routeCurrentAsrToChat = true;
      this.emit('error', { message: '麦克风开不了哦,请允许权限' });
      if (this.asr === asr) {
        asr.close();
        this.asr = null;
      }
      this.setState('awaiting');
    }
  }

  async stopListening(): Promise<void> {
    if (this.state !== 'listening') return;
    const stoppedAt = performance.now();
    if (this.listenStartup) {
      this.listenStartup.stopRequestedAt ??= stoppedAt;
      return;
    }
    await this.finishListening(stoppedAt);
  }

  private async finishListening(stoppedAt: number): Promise<void> {
    const run = this.run;
    if (!this.isCurrent(run)) return;
    if (this.state !== 'listening') return;
    const recordedMs = stoppedAt - (this.listenStartedAt || stoppedAt);
    // 录音 < 800ms — 豆包对超短音频识别置信度不够,几乎一定 timeout。直接前端拦截更友好。
    if (recordedMs < 800) {
      await this.stopRecording();
      if (!this.isCurrent(run)) return;
      try { this.asr?.close(); } catch {}
      this.asr = null;
      this.recorderLock = false; // Release lock on short press
      this.routeCurrentAsrToChat = true;
      this.emit('subtitle-clear');
      this.emit('error', { message: '太短啦~按住多说一会儿' });
      this.setState('awaiting');
      return;
    }
    await this.stopRecording();
    if (!this.isCurrent(run)) return;
    this.recorderLock = false; // Release lock after recording stopped
    this.listenStoppedAt = performance.now();
    // 关键:不能立刻 close — close 会让 proxy 立刻断 upstream,豆包没机会回 final。
    // 改发 finish 控制帧:proxy 转发负序号终止包给豆包,等 final 自然返回再 close。
    this.asr?.finish();
    this.setState('thinking');
    // 兜底:豆包偶发不回 final → state 永远 thinking → 按钮灰锁死。5 秒后强制自救。
    this.timers.arm('asrFinal', 5000, () => {
      if (!this.isCurrent(run)) return;
      if (this.state !== 'thinking') return;
      this.emit('error', { message: '没听清呢~再说一次' });
      try { this.asr?.close(); } catch {}
      this.asr = null;
      this.routeCurrentAsrToChat = true;
      this.setState('awaiting');
    });
    // ASR final 事件会触发 handleAsrFinal → /api/chat;handleAsrFinal 末尾再 close ASR WS。
  }

  private async stopRecording(): Promise<void> {
    const recorder = this.recorder;
    this.recorder = null;
    await recorder?.stop();
  }

  // ─── ASR final → SSE chat → TTS ──────────────────────────────────

  private async handleAsrFinal(text: string): Promise<void> {
    const run = this.run;
    if (!this.isCurrent(run)) return;
    if (!this.sessionId) return;
    const routeToChat = this.routeCurrentAsrToChat;
    this.routeCurrentAsrToChat = true;
    // 清兜底超时
    this.timers.clear('asrFinal');
    // 收到 final 才 close ASR WS — 之前 stopListening 用 finish() 让 proxy 等 final
    this.asr?.close();
    this.asr = null;
    if (!text || !text.trim()) {
      this.emit('subtitle', { text: '没听清呢~再说一次', source: 'ai' });
      this.setState('awaiting');
      return;
    }
    this.emit('subtitle', { text, source: 'user' });
    this.emit('asr-final', { text });
    if (!routeToChat) {
      this.setState('awaiting');
      return;
    }
    const asrLatency = this.listenStoppedAt > 0
      ? Math.round(performance.now() - this.listenStoppedAt)
      : 0;
    const chatAbort = new AbortController();
    this.chatAbort = chatAbort;
    const signal = AbortSignal.any([run.signal, chatAbort.signal]);
    this.armChatWatchdog();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: encodeLessonRequest({
          action: 'message',
          sessionId: this.sessionId,
          text,
          asrResult: {
            latency: asrLatency,
            tokens: text.length,
          },
        }),
        signal,
      });
      if (!this.isCurrent(run)) { void res.body?.cancel().catch(() => {}); return; }
      if (!res.ok || !res.body) {
        // 404 = server 端 sessions Map 在 dev server 重启时清空,客户端持有的 sessionId 失效。
        // 现状只能让用户回首页重进。后续 server session 做持久化后此分支变可恢复。
        const reason = res.status === 404
          ? '课程已过期啦~回首页重新进入课程吧'
          : 'AI 没反应过来,再试一次';
        this.emit('error', { message: reason });
        this.setState('awaiting');
        return;
      }
      await this.consumeSSE(res.body, () => {
        // afterDone 不强制切状态;TTS session-finished 才回 awaiting
      }, run, signal);
    } catch (e) {
      if (this.isCurrent(run) && (e as Error).name !== 'AbortError') {
        await this.recoverCommand(e, run);
      }
    } finally {
      if (this.isCurrent(run) && this.chatAbort === chatAbort) this.clearChatWatchdog();
    }
  }

  private bindTtsHandlers(): void {
    if (this.ttsHandlersBound) return;
    this.ttsHandlersBound = true;
    this.tts.on('subtitle', (text: string) => {
      if (this.run.signal.aborted) return;
      this.emit('subtitle', { text, source: 'ai' });
    });
    this.tts.on('pcm', (pcm: ArrayBuffer) => {
      if (this.run.signal.aborted) return;
      // 打断保护:用户按空格切到 listening 后,豆包可能还有 inflight PCM 推过来,
      // 全部丢弃 — 否则 player.stop() 后又被新 enqueue 重新启动播放。
      // 等下一轮 AI 回应时,handleSseEvent 会切到 speaking,届时不再被 guard 拦。
      if (this.state !== 'greeting' && this.state !== 'speaking' && this.state !== 'quiz-speaking') return;
      this.player.enqueue(pcm);
    });
    this.tts.on('session-finished', () => {
      if (this.run.signal.aborted) return;
      this.timers.clear('speechFinish');
      this.speechStreamFinished = true;
      // Flush buffered actions now that TTS has finished speaking — this ensures
      // the card shown on screen matches the word the teacher just finished saying.
      this.flushPendingActions();
      this.maybeReturnToAwaiting();
    });
    this.tts.on('error', (err: { message: string }) => {
      if (this.run.signal.aborted) return;
      // On TTS error, release any buffered actions so the UI doesn't stay stale.
      this.flushPendingActions();
      this.failStaticSpeech(new Error(err.message || 'TTS failed'));
      this.emit('error', err);
    });
    this.tts.on('reconnecting', () => {
      if (this.run.signal.aborted) return;
      this.emit('subtitle', { text: '网络波动，正在重连…', source: 'ai' });
    });
    this.tts.on('reconnected', () => {
      if (this.run.signal.aborted) return;
      this.emit('subtitle-clear');
    });
    this.tts.on('session-lost', () => {
      if (this.run.signal.aborted) return;
      // TTS reconnect cleared stale session — flush pending actions to unblock UI
      this.flushPendingActions();
      // Return to awaiting if stuck in speaking/quiz-speaking
      if (this.state === 'speaking' || this.state === 'quiz-speaking') {
        this.setState('awaiting');
      }
    });
  }

  // ─── SSE 消费(speech-delta → TTS, actions → emit)────────────────

  private async consumeSSE(body: ReadableStream<Uint8Array>, afterDone: () => void, run = this.run, signal = run.signal): Promise<void> {
    const reader = body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    const decoder = new TextDecoder();
    let buf = '';
    let ttsStarted = false;
    let firstSpeech = true;
    let completed = false;
    this.sseCommitted = false;

    const ensureTtsSession = () => {
      if (!ttsStarted) {
        const sid = uuidv4();
        this.speechStreamFinished = false;
        this.tts.startSession(sid);
        ttsStarted = true;
      }
    };

    const onFirstSpeech = () => {
      if (firstSpeech) {
        firstSpeech = false;
        if (this.state !== 'greeting') {
          this.setState('speaking');
        }
      }
    };

    try {
      while (true) {
        const { done, value } = await this.untilCanceled(reader.read(), signal);
        if (!this.isCurrent(run)) throw new DOMException('Lesson ended', 'AbortError');
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          if (!this.isCurrent(run) || signal.aborted) throw new DOMException('Lesson ended', 'AbortError');
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const lines = frame.split('\n');
          let event = '';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim();
            else if (line.startsWith('data: ')) data += line.slice(6);
          }
          if (!event) continue;
          const parsed = parseLessonEvent(event, data);
          if (parsed.type === 'error') throw new Error(parsed.message || 'Lesson stream failed');
          if (parsed.type === 'done') {
            completed = true;
            this.sseCommitted = true;
          }
          this.handleSseEvent(parsed, ensureTtsSession, onFirstSpeech);
          if (completed) return;
        }
      }
    } finally {
      // Always release the reader lock, even if read() throws or the stream is aborted —
      // otherwise the lock leaks and afterDone's continuation is silently skipped.
      signal.removeEventListener('abort', cancel);
      if (completed && this.isCurrent(run)) afterDone();
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    throw new Error('Lesson stream ended without done');
  }

  private handleSseEvent(
    event: StreamUserEvent,
    ensureTtsSession: () => void,
    onFirstSpeech: () => void
  ): void {
    // Any SSE event means the server is responding — the request is not hung.
    this.clearChatWatchdog();
    switch (event.type) {
      case 'speech-delta':
        ensureTtsSession();
        onFirstSpeech();
        this.tts.sendText(event.text);
        break;
      case 'speech-end':
        // 不在这里 finishSession,等 actions 也来,然后 done 再 finish
        break;
      case 'actions':
        // Buffer actions until TTS session-finished so the UI card change is
        // in sync with what the teacher is saying, not 2-3 seconds ahead.
        this.pendingActions = event.actions;
        break;
      case 'progress_snapshot': {
        const { type: _type, ...snapshot } = event;
        this.applyProgressSnapshot(snapshot);
        break;
      }
      case 'done':
        this.tts.finishSession();
        this.armSpeechFinishFallback();
        break;

    }
  }

  private maybeReturnToAwaiting(): void {
    if (this.run.signal.aborted) return;
    if (!this.speechStreamFinished) return;
    if (!this.player.isIdle()) return;
    if (this.state === 'speaking' || this.state === 'greeting' || this.state === 'quiz-speaking') {
      this.setState('awaiting');
    }
    this.resolveStaticSpeech();
  }

  // Release SSE-buffered actions to the UI and sync ASR card context. Called from every
  // path that ends a TTS speech turn (session-finished / error / session-lost / fallback timer)
  // so the on-screen card never desyncs from what the teacher just said.
  private flushPendingActions(): void {
    if (!this.pendingActions || !this.sseCommitted) return;
    const actions = this.pendingActions;
    this.pendingActions = null;
    this.syncAsrSessionContextFromActions(actions);
    this.emit('actions', actions);
  }

  // Client backstop for a stalled /api/chat: if no SSE event arrives within CHAT_WATCHDOG_MS,
  // the request is hung — abort it and recover to awaiting with a gentle nudge. Cleared on the
  // first SSE event (handleSseEvent) and in handleAsrFinal's finally; the state guard prevents
  // misfiring during a long but legitimate teacher utterance.
  private armChatWatchdog(): void {
    const run = this.run;
    this.timers.arm('chatWatchdog', LessonController.CHAT_WATCHDOG_MS, () => {
      if (!this.isCurrent(run)) return;
      if (this.state !== 'thinking') return;
      this.chatAbort?.abort();
      this.pendingActions = null;
      this.routeCurrentAsrToChat = true;
      this.emit('error', { message: '我有点没反应过来…我们再聊一句?' });
      this.setState('awaiting');
    });
  }

  private clearChatWatchdog(): void {
    this.timers.clear('chatWatchdog');
  }

  private armSpeechFinishFallback(): void {
    const run = this.run;
    this.timers.arm('speechFinish', LessonController.SPEECH_FINISH_FALLBACK_MS, () => {
      if (!this.isCurrent(run)) return;
      this.speechStreamFinished = true;
      // The TTS finish frame never arrived — flush buffered actions so the card still
      // syncs to what the teacher said (otherwise: "画面切到 X，老师还让读 Y" desync).
      this.flushPendingActions();
      this.maybeReturnToAwaiting();
    });
  }

  private syncAsrSessionContextFromActions(actions: ToolAction[]): void {
    const lastShowCard = [...actions].reverse().find((action) => action.tool === 'show_card' && action.params.card_id);
    if (lastShowCard) {
      this.currentAsrCardId = lastShowCard.params.card_id;
    }
  }

  private applyProgressSnapshot(payload: LessonProgressSnapshot): void {
    this.clearedCardIds = [...payload.clearedCardIds];
    this.emit('progress', payload);
  }

  private getAsrSessionContext(): AsrClientSessionContext {
    return {
      ...(this.courseId ? { courseId: this.courseId } : {}),
      ...(this.currentAsrCardId ? { cardId: this.currentAsrCardId } : {}),
      ...(this.clearedCardIds.length > 0 ? { clearedCardIds: this.clearedCardIds } : {}),
      ...(this.asrSentenceTexts.length > 0 ? { sentenceTexts: this.asrSentenceTexts } : {}),
    };
  }

  private resolveStaticSpeech(): void {
    if (!this.staticSpeech) return;
    const pending = this.staticSpeech;
    this.staticSpeech = null;
    clearTimeout(pending.timeout);
    pending.resolve();
  }

  private failStaticSpeech(error: Error): void {
    if (!this.staticSpeech) return;
    const pending = this.staticSpeech;
    this.staticSpeech = null;
    clearTimeout(pending.timeout);
    this.speechStreamFinished = true;
    // Stop player async but don't await (failStaticSpeech is sync callback)
    this.player.stop().catch(() => {});
    if (this.state === 'quiz-speaking') {
      this.setState('awaiting');
    }
    pending.reject(error);
  }
}

'use client';

import { v4 as uuidv4 } from 'uuid';
import { ToolAction } from '@/types/tools';
import { AsrClient, setAsrSessionContext } from './asr-client';
import { TtsClient } from './tts-client';
import { PcmPlayer } from '@/lib/audio/pcm-player';
import { startRecorder, prewarmRecorder, disposeRecorder, RecorderHandle } from '@/lib/audio/recorder';

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
}

export class LessonController {
  private state: LessonStateName = 'idle';
  private listeners = new Map<EventName, Set<Listener>>();
  private sessionId: string | null = null;

  private tts = new TtsClient();
  private asr: AsrClient | null = null;
  private player = new PcmPlayer(24000);
  private recorder: RecorderHandle | null = null;
  private chatAbort: AbortController | null = null;
  private asrFinalTimer: ReturnType<typeof setTimeout> | null = null;
  private speechFinishFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private listenStartedAt = 0;
  private listenStoppedAt = 0;
  private speechStreamFinished = false;
  private routeCurrentAsrToChat = true;
  private pendingActions: ToolAction[] | null = null;
  private listenStartup: { stopRequestedAt: number | null } | null = null;
  private courseId: string | null = null;
  private currentAsrCardId: string | null = null;
  private clearedCardIds: string[] = [];
  private ttsHandlersBound = false;
  private staticSpeech: {
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;
  private static readonly SPEECH_FINISH_FALLBACK_MS = 1500;
  private static readonly STATIC_SPEECH_TIMEOUT_MS = 10000;

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

  async startLesson(courseId: string): Promise<void> {
    this.courseId = courseId;
    this.currentAsrCardId = null;
    this.clearedCardIds = [];
    this.syncAsrSessionContext();
    this.setState('greeting');
    // 1) 并行启动:TTS 长连 + mic 预热(权限框、AudioContext、Worklet、MediaStream 全提前就绪)
    //    开场白播完用户按住空格那一刻,worklet node 只需 connect 一下,几乎瞬间就能出 PCM。
    await Promise.all([
      this.tts.open().catch((e) => {
        console.warn('[lesson] tts open failed (continuing text-only):', e);
        this.emit('error', { message: '语音暂时连不上,先继续文字流程' });
      }),
      prewarmRecorder().catch((e) => {
        console.warn('[lesson] mic prewarm failed (will retry on first press):', e);
      }),
    ]);
    this.bindTtsHandlers();

    // 2) 调 /api/chat?action=start,跑开场白
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', courseId }),
    });
    if (!res.ok || !res.body) {
      this.emit('error', { message: 'Failed to start lesson' });
      this.setState('idle');
      return;
    }
    this.sessionId = res.headers.get('X-Session-Id');

    await this.consumeSSE(res.body, /* afterDone= */ () => {
      // greeting 不立刻切到 awaiting,等 TTS session-finished 来了再切
    });
  }

  async endLesson(): Promise<void> {
    this.setState('ending');
    this.chatAbort?.abort();
    if (this.asrFinalTimer) {
      clearTimeout(this.asrFinalTimer);
      this.asrFinalTimer = null;
    }
    if (this.speechFinishFallbackTimer) {
      clearTimeout(this.speechFinishFallbackTimer);
      this.speechFinishFallbackTimer = null;
    }
    this.pendingActions = null;
    this.courseId = null;
    this.currentAsrCardId = null;
    this.clearedCardIds = [];
    setAsrSessionContext({});
    this.listenStartup = null;
    await this.stopRecording();
    try { this.asr?.close(); } catch {}
    this.asr = null;
    this.player.stop();
    this.speechStreamFinished = false;
    this.routeCurrentAsrToChat = true;
    this.failStaticSpeech(new Error('Lesson ended'));
    this.tts.close();
    if (this.sessionId) {
      try {
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end', sessionId: this.sessionId }),
        });
      } catch {}
    }
    this.sessionId = null;
    await this.player.dispose();
    await disposeRecorder();
    this.setState('idle');
  }

  /**
   * Send a custom chat action and consume the returned SSE through the existing TTS/action path.
   */
  async sendCustomAction(body: Record<string, any>): Promise<void> {
    if (!this.sessionId) throw new Error('Session not started');
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, sessionId: this.sessionId }),
    });
    if (!res.ok || !res.body) {
      this.emit('error', { message: `Action ${body.action} failed: ${res.status}` });
      return;
    }
    await this.consumeSSE(res.body, () => {});
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async speakStatic(text: string): Promise<void> {
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
    if (this.state === 'listening') return;
    if (this.state !== 'awaiting') return; // speaking 时不打断 — 老师说完才能再说

    this.routeCurrentAsrToChat = options.routeToChat ?? true;
    this.setState('listening');
    this.emit('subtitle-clear');
    this.listenStartedAt = performance.now();

    const asr = new AsrClient();
    this.asr = asr;
    const startup = { stopRequestedAt: null as number | null };
    this.listenStartup = startup;
    asr.on('partial', (text: string) => {
      this.emit('subtitle', { text, source: 'user' });
    });
    asr.on('final', (text: string) => {
      this.handleAsrFinal(text);
    });
    asr.on('error', (err: { message: string }) => {
      this.routeCurrentAsrToChat = true;
      this.emit('error', err);
      this.setState('awaiting');
    });

    // 并行启动 ASR WS 与 recorder tap — 总等待时间 = max(asr.open, startRecorder)
    // recorder 已 prewarm,startRecorder 只是 new WorkletNode + connect,几毫秒就能出 PCM
    let recorderPromise: Promise<RecorderHandle>;
    try {
      recorderPromise = startRecorder({
        onChunk: (pcm) => {
          if (this.asr === asr) asr.sendPcm(pcm);
        },
      });
    } catch (e) {
      this.listenStartup = null;
      if (this.asr === asr) this.asr = null;
      this.routeCurrentAsrToChat = true;
      this.emit('error', { message: '麦克风开不了哦,请允许权限' });
      this.setState('awaiting');
      return;
    }
    try {
      await asr.open();
    } catch {
      if (this.listenStartup === startup) this.listenStartup = null;
      if (this.asr === asr) this.asr = null;
      this.routeCurrentAsrToChat = true;
      this.emit('error', { message: 'ASR 连接失败,请重试' });
      // 录音也得清干净
      try { (await recorderPromise).stop(); } catch {}
      this.setState('awaiting');
      return;
    }
    try {
      const recorder = await recorderPromise;
      if (this.asr !== asr || this.getState() !== 'listening') {
        await recorder.stop();
        if (this.listenStartup === startup) this.listenStartup = null;
        return;
      }
      this.recorder = recorder;
      if (this.listenStartup === startup) this.listenStartup = null;
      if (startup.stopRequestedAt !== null) {
        await this.finishListening(startup.stopRequestedAt);
      }
    } catch (e) {
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
    if (this.state !== 'listening') return;
    const recordedMs = stoppedAt - (this.listenStartedAt || stoppedAt);
    // 录音 < 800ms — 豆包对超短音频识别置信度不够,几乎一定 timeout。直接前端拦截更友好。
    if (recordedMs < 800) {
      await this.stopRecording();
      try { this.asr?.close(); } catch {}
      this.asr = null;
      this.routeCurrentAsrToChat = true;
      this.emit('subtitle-clear');
      this.emit('error', { message: '太短啦~按住多说一会儿' });
      this.setState('awaiting');
      return;
    }
    await this.stopRecording();
    this.listenStoppedAt = performance.now();
    // 关键:不能立刻 close — close 会让 proxy 立刻断 upstream,豆包没机会回 final。
    // 改发 finish 控制帧:proxy 转发负序号终止包给豆包,等 final 自然返回再 close。
    this.asr?.finish();
    this.setState('thinking');
    // 兜底:豆包偶发不回 final → state 永远 thinking → 按钮灰锁死。5 秒后强制自救。
    if (this.asrFinalTimer) clearTimeout(this.asrFinalTimer);
    this.asrFinalTimer = setTimeout(() => {
      this.asrFinalTimer = null;
      if (this.state !== 'thinking') return;
      this.emit('error', { message: '没听清呢~再说一次' });
      try { this.asr?.close(); } catch {}
      this.asr = null;
      this.routeCurrentAsrToChat = true;
      this.setState('awaiting');
    }, 5000);
    // ASR final 事件会触发 handleAsrFinal → /api/chat;handleAsrFinal 末尾再 close ASR WS。
  }

  private async stopRecording(): Promise<void> {
    if (this.recorder) {
      await this.recorder.stop();
      this.recorder = null;
    }
  }

  // ─── ASR final → SSE chat → TTS ──────────────────────────────────

  private async handleAsrFinal(text: string): Promise<void> {
    if (!this.sessionId) return;
    const routeToChat = this.routeCurrentAsrToChat;
    this.routeCurrentAsrToChat = true;
    // 清兜底超时
    if (this.asrFinalTimer) {
      clearTimeout(this.asrFinalTimer);
      this.asrFinalTimer = null;
    }
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
    this.chatAbort = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          sessionId: this.sessionId,
          text,
          asrResult: {
            latency: asrLatency,
            tokens: text.length,
          },
        }),
        signal: this.chatAbort.signal,
      });
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
      });
    } catch (e) {
      if ((e as any).name !== 'AbortError') {
        this.pendingActions = null;
        this.emit('error', { message: '我有点没反应过来…我们再聊一句?' });
        this.setState('awaiting');
      }
    }
  }

  private bindTtsHandlers(): void {
    if (this.ttsHandlersBound) return;
    this.ttsHandlersBound = true;
    this.tts.on('subtitle', (text: string) => {
      this.emit('subtitle', { text, source: 'ai' });
    });
    this.tts.on('pcm', (pcm: ArrayBuffer) => {
      // 打断保护:用户按空格切到 listening 后,豆包可能还有 inflight PCM 推过来,
      // 全部丢弃 — 否则 player.stop() 后又被新 enqueue 重新启动播放。
      // 等下一轮 AI 回应时,handleSseEvent 会切到 speaking,届时不再被 guard 拦。
      if (this.state === 'listening' || this.state === 'thinking') return;
      this.player.enqueue(pcm);
    });
    this.tts.on('session-finished', () => {
      if (this.speechFinishFallbackTimer) {
        clearTimeout(this.speechFinishFallbackTimer);
        this.speechFinishFallbackTimer = null;
      }
      this.speechStreamFinished = true;
      // Flush buffered actions now that TTS has finished speaking — this ensures
      // the card shown on screen matches the word the teacher just finished saying.
      if (this.pendingActions) {
        this.syncAsrSessionContextFromActions(this.pendingActions);
        this.emit('actions', this.pendingActions);
        this.pendingActions = null;
      }
      this.maybeReturnToAwaiting();
    });
    this.tts.on('error', (err: { message: string }) => {
      // On TTS error, release any buffered actions so the UI doesn't stay stale.
      if (this.pendingActions) {
        this.syncAsrSessionContextFromActions(this.pendingActions);
        this.emit('actions', this.pendingActions);
        this.pendingActions = null;
      }
      this.failStaticSpeech(new Error(err.message || 'TTS failed'));
      this.emit('error', err);
    });
  }

  // ─── SSE 消费(speech-delta → TTS, actions → emit)────────────────

  private async consumeSSE(body: ReadableStream<Uint8Array>, afterDone: () => void): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let ttsStarted = false;
    let firstSpeech = true;

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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
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
        let payload: any = {};
        try { payload = JSON.parse(data); } catch {}
        this.handleSseEvent(event, payload, ensureTtsSession, onFirstSpeech);
      }
    }
    afterDone();
  }

  private handleSseEvent(
    event: string,
    payload: any,
    ensureTtsSession: () => void,
    onFirstSpeech: () => void
  ): void {
    switch (event) {
      case 'speech-delta':
        ensureTtsSession();
        onFirstSpeech();
        this.tts.sendText(payload.text);
        break;
      case 'speech-end':
        // 不在这里 finishSession,等 actions 也来,然后 done 再 finish
        break;
      case 'actions':
        // Buffer actions until TTS session-finished so the UI card change is
        // in sync with what the teacher is saying, not 2-3 seconds ahead.
        this.pendingActions = payload.actions || [];
        break;
      case 'progress_snapshot':
        if (Array.isArray(payload.clearedCardIds)) {
          this.clearedCardIds = payload.clearedCardIds.filter(Boolean);
          this.syncAsrSessionContext();
        }
        this.emit('progress', payload);
        break;
      case 'done':
        this.tts.finishSession();
        this.armSpeechFinishFallback();
        break;
      case 'error':
        this.emit('error', { message: payload.message || 'unknown' });
        break;
    }
  }

  private maybeReturnToAwaiting(): void {
    if (!this.speechStreamFinished) return;
    if (!this.player.isIdle()) return;
    if (this.state === 'speaking' || this.state === 'greeting' || this.state === 'quiz-speaking') {
      this.setState('awaiting');
    }
    this.resolveStaticSpeech();
  }

  private armSpeechFinishFallback(): void {
    if (this.speechFinishFallbackTimer) clearTimeout(this.speechFinishFallbackTimer);
    this.speechFinishFallbackTimer = setTimeout(() => {
      this.speechFinishFallbackTimer = null;
      this.speechStreamFinished = true;
      this.maybeReturnToAwaiting();
    }, LessonController.SPEECH_FINISH_FALLBACK_MS);
  }

  private syncAsrSessionContextFromActions(actions: ToolAction[]): void {
    const lastShowCard = [...actions].reverse().find((action) => action.tool === 'show_card' && action.params.card_id);
    if (lastShowCard) {
      this.currentAsrCardId = lastShowCard.params.card_id;
    }
    this.syncAsrSessionContext();
  }

  private syncAsrSessionContext(): void {
    setAsrSessionContext({
      ...(this.courseId ? { courseId: this.courseId } : {}),
      ...(this.currentAsrCardId ? { cardId: this.currentAsrCardId } : {}),
      ...(this.clearedCardIds.length > 0 ? { clearedCardIds: this.clearedCardIds } : {}),
    });
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
    this.player.stop();
    if (this.state === 'quiz-speaking') {
      this.setState('awaiting');
    }
    pending.reject(error);
  }
}

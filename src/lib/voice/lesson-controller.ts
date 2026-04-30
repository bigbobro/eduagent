'use client';

import { v4 as uuidv4 } from 'uuid';
import { ToolAction } from '@/types/tools';
import { AsrClient } from './asr-client';
import { TtsClient } from './tts-client';
import { PcmPlayer } from '@/lib/audio/pcm-player';
import { startRecorder, RecorderHandle } from '@/lib/audio/recorder';

export type LessonStateName =
  | 'idle' | 'greeting' | 'awaiting' | 'listening' | 'thinking' | 'speaking' | 'ending';

type EventName =
  | 'state'
  | 'subtitle'           // { text: string, source: 'user' | 'ai' }
  | 'subtitle-clear'
  | 'actions'            // ToolAction[]
  | 'error';             // { message: string }

type Listener<T = any> = (data: T) => void;

export class LessonController {
  private state: LessonStateName = 'idle';
  private listeners = new Map<EventName, Set<Listener>>();
  private sessionId: string | null = null;

  private tts = new TtsClient();
  private asr: AsrClient | null = null;
  private player = new PcmPlayer(24000);
  private recorder: RecorderHandle | null = null;
  private chatAbort: AbortController | null = null;

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
    this.setState('greeting');
    // 1) 建 TTS 长连
    await this.tts.open();
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
    await this.stopRecording();
    this.player.stop();
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
    this.setState('idle');
  }

  // ─── 录音流程(空格键 / 长按按钮 调用)────────────────────────────

  async startListening(): Promise<void> {
    if (this.state === 'listening') return;
    // 在 speaking 状态触发 → 打断
    if (this.state === 'speaking') {
      this.player.stop();
      this.tts.cancelSession();
      this.emit('subtitle-clear');
    }
    if (this.state !== 'awaiting' && this.state !== 'speaking') return;

    this.setState('listening');
    this.emit('subtitle-clear');

    this.asr = new AsrClient();
    this.asr.on('partial', (text: string) => {
      this.emit('subtitle', { text, source: 'user' });
    });
    this.asr.on('final', (text: string) => {
      this.handleAsrFinal(text);
    });
    this.asr.on('error', (err: { message: string }) => {
      this.emit('error', err);
      this.setState('awaiting');
    });

    try {
      await this.asr.open();
    } catch {
      this.emit('error', { message: 'ASR 连接失败,请重试' });
      this.setState('awaiting');
      return;
    }

    try {
      this.recorder = await startRecorder({
        onChunk: (pcm) => this.asr?.sendPcm(pcm),
      });
    } catch (e) {
      this.emit('error', { message: '麦克风开不了哦,请允许权限' });
      this.asr?.close();
      this.setState('awaiting');
    }
  }

  async stopListening(): Promise<void> {
    if (this.state !== 'listening') return;
    await this.stopRecording();
    this.asr?.close();
    this.setState('thinking');
    // ASR final 事件会触发 handleAsrFinal → /api/chat
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
    if (!text || !text.trim()) {
      this.emit('subtitle', { text: '没听清呢~再说一次', source: 'ai' });
      this.setState('awaiting');
      return;
    }
    this.emit('subtitle', { text, source: 'user' });
    this.chatAbort = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', sessionId: this.sessionId, text }),
        signal: this.chatAbort.signal,
      });
      if (!res.ok || !res.body) {
        this.emit('error', { message: 'AI 没反应过来,再试一次' });
        this.setState('awaiting');
        return;
      }
      await this.consumeSSE(res.body, () => {
        // afterDone 不强制切状态;TTS session-finished 才回 awaiting
      });
    } catch (e) {
      if ((e as any).name !== 'AbortError') {
        this.emit('error', { message: '我有点没反应过来…我们再聊一句?' });
        this.setState('awaiting');
      }
    }
  }

  private bindTtsHandlers(): void {
    this.tts.on('subtitle', (text: string) => {
      this.emit('subtitle', { text, source: 'ai' });
    });
    this.tts.on('pcm', (pcm: ArrayBuffer) => {
      this.player.enqueue(pcm);
    });
    this.tts.on('session-finished', () => {
      if (this.state === 'speaking' || this.state === 'greeting') {
        this.setState('awaiting');
      }
    });
    this.tts.on('error', (err: { message: string }) => {
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
        this.emit('actions', payload.actions || []);
        break;
      case 'done':
        this.tts.finishSession();
        break;
      case 'error':
        this.emit('error', { message: payload.message || 'unknown' });
        break;
    }
  }
}

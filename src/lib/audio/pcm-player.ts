/**
 * 流式 PCM 播放器(Int16, mono, 24kHz)。
 * - enqueue 把一个 chunk 立刻排入,自动按累积 nextStartTime 衔接。
 * - stop 清空队列、停止所有正在响的源。
 */
export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private active = new Set<AudioBufferSourceNode>();
  private idleListeners = new Set<() => void>();
  private readonly sampleRate: number;

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: this.sampleRate });
      this.nextStartTime = this.ctx.currentTime;
    }
    return this.ctx;
  }

  /** 立刻把 PCM (Int16, little-endian) chunk 排入播放队列。 */
  enqueue(pcm: ArrayBuffer): void {
    const ctx = this.ensureContext();
    const i16 = new Int16Array(pcm);
    if (i16.length === 0) return;
    const buf = ctx.createBuffer(1, i16.length, this.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < i16.length; i++) {
      ch[i] = i16[i] / 0x8000;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const startAt = Math.max(this.nextStartTime, ctx.currentTime + 0.02);
    src.start(startAt);
    this.nextStartTime = startAt + buf.duration;
    this.active.add(src);
    src.onended = () => {
      this.active.delete(src);
      this.emitIdleIfNeeded();
    };
  }

  /** 立即停止所有正在响的 source,清空队列。 */
  stop(): void {
    this.active.forEach((src) => {
      try { src.stop(); } catch {}
    });
    this.active.clear();
    if (this.ctx) {
      this.nextStartTime = this.ctx.currentTime;
    }
    this.emitIdleIfNeeded();
  }

  isIdle(): boolean {
    return this.active.size === 0;
  }

  onIdle(fn: () => void): () => void {
    this.idleListeners.add(fn);
    return () => this.idleListeners.delete(fn);
  }

  private emitIdleIfNeeded(): void {
    if (this.active.size > 0) return;
    this.idleListeners.forEach((fn) => fn());
  }

  async dispose(): Promise<void> {
    this.stop();
    if (this.ctx) {
      try { await this.ctx.close(); } catch {}
      this.ctx = null;
    }
  }
}

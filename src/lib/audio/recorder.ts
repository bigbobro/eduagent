export interface RecorderHandle {
  stop: () => Promise<void>;
}

/** One classroom owns the mic/context; recording taps reuse them within that classroom. */
export class LessonRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private initializing: Promise<{ ctx: AudioContext; source: MediaStreamAudioSourceNode }> | null = null;
  private disposed = false;
  private taps = new Set<RecorderHandle>();

  private assertActive(): void {
    if (this.disposed) throw new DOMException('Recorder disposed', 'AbortError');
  }

  private async initialize(): Promise<{ ctx: AudioContext; source: MediaStreamAudioSourceNode }> {
    this.assertActive();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.ctx) void this.ctx.close().catch(() => {});
    const ctx = new AudioContext({ sampleRate: 16000 });
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    this.assertActive();
    await ctx.audioWorklet.addModule('/worklets/pcm-recorder.worklet.js');
    this.assertActive();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 16000 },
    });
    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      this.assertActive();
    }
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
    return { ctx, source: this.source };
  }

  private async resources(): Promise<{ ctx: AudioContext; source: MediaStreamAudioSourceNode }> {
    this.assertActive();
    if (this.ctx && this.source && this.stream?.getTracks().every((track) => track.readyState === 'live')) {
      return { ctx: this.ctx, source: this.source };
    }
    if (!this.initializing) this.initializing = this.initialize();
    const pending = this.initializing;
    try { return await pending; }
    finally { if (this.initializing === pending) this.initializing = null; }
  }

  async prewarm(): Promise<void> {
    await this.resources();
  }

  async start(opts: { onChunk: (pcm: ArrayBuffer) => void }): Promise<RecorderHandle> {
    const { ctx, source } = await this.resources();
    this.assertActive();
    const node = new AudioWorkletNode(ctx, 'pcm-recorder');
    source.connect(node);
    let flushAckReceived = false;
    let stopping: Promise<void> | null = null;
    node.port.onmessage = (event) => {
      const msg = event.data;
      if (msg && typeof msg === 'object' && msg.type === 'flush-ack') flushAckReceived = true;
      else if (!this.disposed) opts.onChunk(msg as ArrayBuffer);
    };
    const handle: RecorderHandle = {
      stop: () => {
        if (stopping) return stopping;
        stopping = (async () => {
          try {
            // Preserve tail PCM -> flush ack -> disconnect ordering (100ms fallback).
            try { node.port.postMessage({ type: 'flush' }); } catch {}
            const deadline = Date.now() + 100;
            while (!flushAckReceived && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
          } finally {
            node.port.onmessage = null;
            try { source.disconnect(node); } catch {}
            try { node.disconnect(); } catch {}
            this.taps.delete(handle);
          }
        })();
        return stopping;
      },
    };
    this.taps.add(handle);
    return handle;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const ctx = this.ctx;
    const source = this.source;
    const stream = this.stream;
    this.ctx = null;
    this.source = null;
    this.stream = null;
    try { source?.disconnect(); } catch {}
    stream?.getTracks().forEach((track) => track.stop());
    await Promise.all([
      ...Array.from(this.taps, (tap) => tap.stop()),
      ctx?.close().catch(() => {}),
    ]);
  }
}

export interface RecorderHandle {
  stop: () => Promise<void>;
}

/**
 * 启动一次录音会话。每 200ms 把 Int16 PCM (mono, 16kHz) 通过 onChunk 回调送出。
 * 调用方负责拿到 chunk 后转给 WebSocket / 其它消费者。
 * stop() 关闭流并等 worklet 完全断开。
 */
export async function startRecorder(opts: {
  onChunk: (pcm: ArrayBuffer) => void;
  workletUrl?: string;
}): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 16000,
    },
  });

  const ctx = new AudioContext({ sampleRate: 16000 });
  const url = opts.workletUrl ?? '/worklets/pcm-recorder.worklet.js';
  await ctx.audioWorklet.addModule(url);

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-recorder');
  source.connect(node);
  // 不连 destination — 否则会引起反馈
  node.port.onmessage = (e) => {
    opts.onChunk(e.data as ArrayBuffer);
  };

  return {
    stop: async () => {
      try {
        node.port.onmessage = null;
        node.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        await ctx.close();
      } catch (e) {
        console.warn('Recorder stop error:', e);
      }
    },
  };
}

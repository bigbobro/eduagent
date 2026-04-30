let sharedCtx: AudioContext | null = null;
let workletAdded = false;
let sharedStream: MediaStream | null = null;
let sharedSource: MediaStreamAudioSourceNode | null = null;

async function ensureStream(): Promise<MediaStream> {
  if (sharedStream && sharedStream.getTracks().every((t) => t.readyState === 'live')) {
    return sharedStream;
  }
  // 已死的 stream 释放,重新拿
  sharedStream?.getTracks().forEach((t) => t.stop());
  sharedSource = null;
  sharedStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 16000,
    },
  });
  return sharedStream;
}

async function ensureCtx(): Promise<AudioContext> {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext({ sampleRate: 16000 });
    workletAdded = false;
    sharedSource = null; // ctx 换了,旧的 source 失效
  }
  if (sharedCtx.state === 'suspended') {
    await sharedCtx.resume();
  }
  if (!workletAdded) {
    await sharedCtx.audioWorklet.addModule('/worklets/pcm-recorder.worklet.js');
    workletAdded = true;
  }
  return sharedCtx;
}

async function ensureSource(): Promise<MediaStreamAudioSourceNode> {
  const ctx = await ensureCtx();
  const stream = await ensureStream();
  if (!sharedSource) {
    sharedSource = ctx.createMediaStreamSource(stream);
  }
  return sharedSource;
}

export interface RecorderHandle {
  stop: () => Promise<void>;
}

/**
 * 课开始时预热:把权限框 + AudioContext + Worklet + MediaStream 全提前启好。
 * 之后按住说话只剩 new AudioWorkletNode + connect(< 5ms),用户按下立刻能录。
 */
export async function prewarmRecorder(): Promise<void> {
  try {
    await ensureSource();
  } catch (e) {
    console.warn('[recorder] prewarm failed:', e);
    throw e;
  }
}

/**
 * 启动一次录音 tap。每 200ms 把 Int16 PCM (mono, 16kHz) 通过 onChunk 送出。
 * 假定已预热(prewarmRecorder)。stop() 只断开 worklet 节点,stream/ctx/source 留着复用。
 */
export async function startRecorder(opts: {
  onChunk: (pcm: ArrayBuffer) => void;
}): Promise<RecorderHandle> {
  const ctx = await ensureCtx();
  const source = await ensureSource();
  const node = new AudioWorkletNode(ctx, 'pcm-recorder');
  source.connect(node);
  // 不连 destination — 否则会回灌
  node.port.onmessage = (e) => {
    opts.onChunk(e.data as ArrayBuffer);
  };
  return {
    stop: async () => {
      try {
        // 通知 worklet flush 残余 PCM(< 200ms),让 onChunk 多收一个尾包,
        // 然后等一帧 (50ms) 让 message 处理完,再断 onmessage 防止竞态。
        // 没这个的话,用户松手时 worklet 当前 buffer 里 0-199ms 数据被丢,体感是"尾字截断"。
        try { node.port.postMessage({ type: 'flush' }); } catch {}
        await new Promise((r) => setTimeout(r, 50));
        node.port.onmessage = null;
        node.disconnect();
        // 不 disconnect source — 留着给下次 startRecorder 复用
      } catch (e) {
        console.warn('[recorder] stop error:', e);
      }
    },
  };
}

/** lesson 结束时彻底释放 mic 与 audio 资源。 */
export async function disposeRecorder(): Promise<void> {
  try {
    sharedSource?.disconnect();
  } catch {}
  sharedSource = null;
  sharedStream?.getTracks().forEach((t) => t.stop());
  sharedStream = null;
  if (sharedCtx) {
    try { await sharedCtx.close(); } catch {}
    sharedCtx = null;
    workletAdded = false;
  }
}

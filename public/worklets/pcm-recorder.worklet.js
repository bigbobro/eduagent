// PCM 录音 worklet。AudioContext 已是 16kHz,所以直接量化即可。
// 200ms × 16000Hz = 3200 samples 一包(每 sample 2 字节,共 6400 字节)
const SAMPLES_PER_CHUNK = 3200;

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Int16Array(SAMPLES_PER_CHUNK);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      // Float32 [-1, 1] → Int16 [-32768, 32767]
      let s = Math.max(-1, Math.min(1, channel[i]));
      this._buf[this._offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;

      if (this._offset >= SAMPLES_PER_CHUNK) {
        // postMessage 转移所有权
        const out = this._buf.buffer;
        this.port.postMessage(out, [out]);
        this._buf = new Int16Array(SAMPLES_PER_CHUNK);
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-recorder', PcmRecorder);

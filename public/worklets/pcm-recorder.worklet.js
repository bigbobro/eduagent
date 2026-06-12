// PCM 录音 worklet。AudioContext 已是 16kHz,所以直接量化即可。
// 200ms × 16000Hz = 3200 samples 一包(每 sample 2 字节,共 6400 字节)
const SAMPLES_PER_CHUNK = 3200;

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Int16Array(SAMPLES_PER_CHUNK);
    this._offset = 0;
    // main thread 用 {type:'flush'} 通知 worklet 把残余 PCM(< 200ms)立刻吐出来。
    // 没这个的话,用户松手时 worklet 当前 buffer 里 0-199ms 的数据会被 disconnect 直接丢,
    // 体感是"最后一两个字被截掉"。
    this.port.onmessage = (e) => {
      const msg = e && e.data;
      if (msg && msg.type === 'flush') {
        if (this._offset > 0) {
          const out = new Int16Array(this._offset);
          out.set(this._buf.subarray(0, this._offset));
          this.port.postMessage(out.buffer, [out.buffer]);
          this._buf = new Int16Array(SAMPLES_PER_CHUNK);
          this._offset = 0;
        }
        // Send ack to confirm flush completed
        this.port.postMessage({ type: 'flush-ack' });
      }
    };
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

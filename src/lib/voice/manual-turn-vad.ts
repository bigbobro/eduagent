'use client';

import { MANUAL_TURN } from '@/lib/realtime/manual-turn';

export interface ManualTurnVad {
  /** Stop reporting (classroom paused). Any speech in progress is dropped without an `end`. */
  pause(): void;
  resume(): void;
  /** Release the model and the audio graph. Never stops the caller's stream. */
  destroy(): void;
}
export interface ManualTurnVadHandlers {
  onStart(): void;
  /** `voicedMs`: time from `start` to the last voiced frame (the detector's end hangover excluded). */
  onEnd(voicedMs: number): void;
}

/** Assets live in public/vad (scripts/copy-vad-assets.mjs) and are served by the app itself, in dev and in the packaged app. */
const ASSET_BASE = '/vad/';

/**
 * Silero VAD on the classroom's own microphone stream (no second capture). Loaded lazily, only in manual-turn mode.
 * Resolves once the model is running; rejects if the assets cannot be loaded.
 */
export async function startManualTurnVad(stream: MediaStream, handlers: ManualTurnVadHandlers): Promise<ManualTurnVad> {
  const { MicVAD } = await import('@ricky0123/vad-web');
  const { minSpeechMs, redemptionMs, positiveSpeechThreshold, negativeSpeechThreshold } = MANUAL_TURN.vad;
  const audioContext = new AudioContext();
  await audioContext.resume().catch(() => {});
  let realStartAt = 0;
  let announced = false;
  let enabled = true;
  let vad: Awaited<ReturnType<typeof MicVAD.new>>;
  try {
    vad = await MicVAD.new({
      model: 'v5', baseAssetPath: ASSET_BASE, onnxWASMBasePath: ASSET_BASE, audioContext,
      // One thread: no SharedArrayBuffer / cross-origin isolation needed.
      ortConfig: (runtime) => { runtime.env.logLevel = 'error'; runtime.env.wasm.numThreads = 1; },
      minSpeechMs, redemptionMs, positiveSpeechThreshold, negativeSpeechThreshold,
      // The library would stop the shared stream on pause; the classroom owns it.
      getStream: async () => stream, pauseStream: async () => {}, resumeStream: async () => stream,
      onSpeechRealStart: () => { if (!enabled) return; announced = true; realStartAt = performance.now(); handlers.onStart(); },
      onVADMisfire: () => {},
      onSpeechEnd: () => {
        if (!announced) return;
        announced = false;
        if (enabled) handlers.onEnd(Math.max(0, performance.now() - realStartAt - redemptionMs));
      },
    });
  } catch (error) { void audioContext.close().catch(() => {}); throw error; }
  return {
    pause() { enabled = false; announced = false; },
    resume() { enabled = true; },
    destroy() { enabled = false; announced = false; void vad.destroy().catch(() => {}).finally(() => { void audioContext.close().catch(() => {}); }); },
  };
}

'use client';

/**
 * Word-battle sound effects. They must play through the page's own Web Audio: the browser's echo cancellation then
 * removes them from the always-open lesson microphone, so the provider does not mistake them for the child speaking
 * (measured 2026-11-10). Never play lesson sounds from outside the page, and never open a second microphone capture.
 */
export type BattleSfx = 'hit' | 'crit' | 'graze' | 'collect' | 'tame' | 'enter' | 'steal';
const NAMES: BattleSfx[] = ['hit', 'crit', 'graze', 'collect', 'tame', 'enter', 'steal'];
const GAIN = 0.5; // below the teacher's voice
let ctx: AudioContext | null = null;
let loading: Promise<void> | null = null;
const buffers = new Map<BattleSfx, AudioBuffer>();

export function preloadBattleSfx(): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined' || loading) return;
  try { ctx = new AudioContext(); } catch { return; }
  const context = ctx;
  loading = Promise.all(NAMES.map(async (name) => {
    try { buffers.set(name, await context.decodeAudioData(await (await fetch(`/sounds/battle/${name}.mp3`)).arrayBuffer())); }
    catch { /* a missing effect is silent; the battle and the lesson go on */ }
  })).then(() => undefined);
}
export function playBattleSfx(name: BattleSfx, delaySeconds = 0): void {
  const buffer = buffers.get(name);
  if (!ctx || !buffer) return;
  try {
    void ctx.resume();
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = GAIN;
    source.connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime + delaySeconds);
  } catch { /* silent */ }
}

'use client';

import { loadPageSound, pageAudioContext, playPageBuffer } from '@/lib/voice/page-audio';

/**
 * Word-battle sound effects. They must play through the page's own Web Audio (the shared page AudioContext): the
 * browser's echo cancellation then removes them from the always-open lesson microphone, so the provider does not
 * mistake them for the child speaking (measured 2026-11-10). Never play lesson sounds from outside the page, and never
 * open a second microphone capture.
 */
export type BattleSfx = 'hit' | 'crit' | 'graze' | 'collect' | 'tame' | 'enter' | 'steal';
const NAMES: BattleSfx[] = ['hit', 'crit', 'graze', 'collect', 'tame', 'enter', 'steal'];
let loading: Promise<void> | null = null;
const buffers = new Map<BattleSfx, AudioBuffer>();

export function preloadBattleSfx(): void {
  if (loading || !pageAudioContext()) return;
  // A missing effect is silent (no warning); the battle and the lesson go on.
  loading = Promise.all(NAMES.map(async (name) => {
    const buffer = await loadPageSound(`/sounds/battle/${name}.mp3`, false);
    if (buffer) buffers.set(name, buffer);
  })).then(() => undefined);
}
export function playBattleSfx(name: BattleSfx, delaySeconds = 0): void {
  const buffer = buffers.get(name);
  if (!buffer && loading) { void loading.then(() => { if (buffers.has(name)) playBattleSfx(name, 0); }); return; } // still decoding (the opening)
  if (buffer) playPageBuffer(buffer, delaySeconds);
}

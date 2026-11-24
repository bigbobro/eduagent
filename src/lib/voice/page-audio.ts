'use client';

/**
 * The page's one AudioContext for every app-made lesson sound (word-battle effects, word-card sounds). Lesson sounds
 * always play through the page's own Web Audio, never from outside the page, and never through a second microphone
 * capture or a second AudioContext.
 */
export const PAGE_SOUND_GAIN = 0.5; // below the teacher's voice
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const warned = new Set<string>();

export function pageAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  try { ctx = new AudioContext(); } catch { return null; }
  return ctx;
}

/** Fetches and decodes once per URL. A missing or undecodable file resolves to null; `warn` logs that once per URL (the URL only). */
export function loadPageSound(url: string, warn = true): Promise<AudioBuffer | null> {
  let entry = buffers.get(url);
  if (!entry) {
    const context = pageAudioContext();
    entry = !context ? Promise.resolve(null) : (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await context.decodeAudioData(await response.arrayBuffer());
      } catch (error) {
        if (warn && !warned.has(url)) { warned.add(url); console.warn(`[page-audio] sound unavailable: ${url} (${error instanceof Error ? error.message : 'error'})`); }
        return null;
      }
    })();
    buffers.set(url, entry);
  }
  return entry;
}

/** Starts a decoded buffer on the shared context; null when it could not start. */
export function playPageBuffer(buffer: AudioBuffer, delaySeconds = 0): AudioBufferSourceNode | null {
  const context = ctx;
  if (!context) return null;
  try {
    void context.resume().catch(() => {});
    const source = context.createBufferSource(); source.buffer = buffer;
    const gain = context.createGain(); gain.gain.value = PAGE_SOUND_GAIN;
    source.connect(gain).connect(context.destination);
    source.start(context.currentTime + delaySeconds);
    return source;
  } catch { return null; }
}

export function preloadCardSounds(urls: readonly string[]): void { urls.forEach((url) => { void loadPageSound(url); }); }

/**
 * Plays a word card's own sound once and resolves when it ended. Missing file, decode failure or an unavailable audio
 * device resolve silently: the lesson goes on. A bounded wait guards against a context whose clock never advances.
 */
export async function playCardSound(url: string): Promise<void> {
  const buffer = await loadPageSound(url);
  if (!buffer) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
    const timer = setTimeout(finish, buffer.duration * 1000 + 1500);
    const source = playPageBuffer(buffer);
    if (!source) { finish(); return; }
    source.onended = finish;
  });
}

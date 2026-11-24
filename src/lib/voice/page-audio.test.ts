import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Source = { buffer: unknown; onended: (() => void) | null; connect: (n: unknown) => unknown; start: ReturnType<typeof vi.fn> };
let contexts: number; let sources: Source[]; let decode: ReturnType<typeof vi.fn<(data: ArrayBuffer) => Promise<unknown>>>;
class FakeContext {
  currentTime = 0; destination = {};
  constructor() { contexts++; }
  resume = vi.fn(async () => {});
  decodeAudioData = (data: ArrayBuffer) => decode(data);
  createGain() { return { gain: { value: 1 }, connect: (n: unknown) => n }; }
  createBufferSource() { const source: Source = { buffer: null, onended: null, connect: (n) => n, start: vi.fn() }; sources.push(source); return source; }
}
async function load() { vi.resetModules(); return import('./page-audio'); }
beforeEach(() => {
  contexts = 0; sources = [];
  decode = vi.fn(async (_data: ArrayBuffer): Promise<unknown> => ({ duration: 2 }));
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('missing') ? new Response('', { status: 404 }) : new Response(new ArrayBuffer(8))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('page audio', () => {
  it('resolves a missing word sound at once, without throwing, and warns once with the URL only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { playCardSound } = await load();
    await expect(playCardSound('/sounds/words/instruments/missing.mp3')).resolves.toBeUndefined();
    await playCardSound('/sounds/words/instruments/missing.mp3');
    expect(sources).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('/sounds/words/instruments/missing.mp3');
  });
  it('resolves on a decode failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    decode = vi.fn(async (_data: ArrayBuffer): Promise<unknown> => { throw new Error('bad data'); });
    const { playCardSound } = await load();
    await expect(playCardSound('/sounds/words/instruments/drum.mp3')).resolves.toBeUndefined();
  });
  it('resolves only when playback ended, on the one shared context, decoding each file once', async () => {
    const { playCardSound, preloadCardSounds, pageAudioContext } = await load();
    preloadCardSounds(['/sounds/words/instruments/drum.mp3']);
    let ended = false; const done = playCardSound('/sounds/words/instruments/drum.mp3').then(() => { ended = true; });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20)); expect(ended).toBe(false);
    sources[0].onended?.(); await done; expect(ended).toBe(true);
    expect(decode).toHaveBeenCalledTimes(1);
    pageAudioContext(); expect(contexts).toBe(1);
  });
  it('resolves after a bounded wait when the context never reports the end', async () => {
    const { playCardSound } = await load();
    vi.useFakeTimers();
    const done = playCardSound('/sounds/words/instruments/drum.mp3');
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(3600);
    await expect(done).resolves.toBeUndefined();
  });
  it('shares the context with the battle effects', async () => {
    const { pageAudioContext } = await load();
    const { preloadBattleSfx, playBattleSfx } = await import('@/components/lesson/battle/sfx');
    preloadBattleSfx(); pageAudioContext();
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(7));
    playBattleSfx('hit');
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(contexts).toBe(1);
  });
});

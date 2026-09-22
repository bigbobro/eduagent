import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PcmPlayer } from './pcm-player';

const contexts: FakeContext[] = [];
class FakeContext {
  state = 'running';
  currentTime = 5;
  destination = {};
  nodes: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: null | (() => void) }> = [];
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  createBuffer(_channels: number, length: number, rate: number) {
    return { duration: length / rate, getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    const node = { buffer: null as unknown, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void) };
    this.nodes.push(node);
    return node;
  }
  constructor() { contexts.push(this); }
}
beforeEach(() => { contexts.length = 0; vi.stubGlobal('AudioContext', FakeContext); });
afterEach(() => vi.unstubAllGlobals());

describe('PCM player lifecycle', () => {
  it('ignores late PCM after disposal without recreating an AudioContext', async () => {
    const player = new PcmPlayer(); await player.prewarm();
    player.enqueue(new ArrayBuffer(48000));
    await player.dispose();
    player.enqueue(new ArrayBuffer(48000));
    expect(contexts).toHaveLength(1);
    expect(contexts[0].nodes).toHaveLength(1);
    expect(contexts[0].nodes[0].stop).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite the timing of playback started while stop settles', async () => {
    const player = new PcmPlayer(); await player.prewarm();
    player.enqueue(new ArrayBuffer(48000));
    const stop = player.stop();
    player.enqueue(new ArrayBuffer(48000));
    await stop;
    player.enqueue(new ArrayBuffer(48000));
    expect(contexts[0].nodes[1].start).toHaveBeenCalledWith(5.02);
    expect(contexts[0].nodes[2].start).toHaveBeenCalledWith(6.02);
    await player.dispose();
  });

  it('does not clear a reopened context when an old close settles', async () => {
    const player = new PcmPlayer(); await player.prewarm();
    let closed!: () => void;
    contexts[0].close.mockImplementationOnce(() => new Promise<void>((resolve) => { closed = resolve; }));
    const ending = player.dispose();
    await player.prewarm();
    closed(); await ending;
    player.enqueue(new ArrayBuffer(2));
    expect(contexts).toHaveLength(2);
    expect(contexts[1].nodes).toHaveLength(1);
    await player.dispose();
  });
});

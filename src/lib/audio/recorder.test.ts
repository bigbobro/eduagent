import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonRecorder } from './recorder';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const contexts: FakeContext[] = [];
const contextSetup: Array<(ctx: FakeContext) => void> = [];
class FakeContext {
  state = 'running';
  source = { connect: vi.fn(), disconnect: vi.fn() };
  audioWorklet = { addModule: vi.fn(async () => {}) };
  resume = vi.fn(async () => {});
  close = vi.fn(async () => { this.state = 'closed'; });
  createMediaStreamSource = vi.fn(() => this.source);
  constructor() { contexts.push(this); contextSetup.shift()?.(this); }
}
const nodes: FakeWorklet[] = [];
class FakeWorklet {
  port = { onmessage: null as null | ((event: { data: unknown }) => void), postMessage: vi.fn(() => {}) };
  disconnect = vi.fn();
  constructor() { nodes.push(this); }
}
function media() {
  const track = { readyState: 'live', stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}
const getUserMedia = vi.fn();
beforeEach(() => {
  contexts.length = 0; contextSetup.length = 0; nodes.length = 0; getUserMedia.mockReset();
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorklet);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('classroom-owned recorder', () => {
  it('releases late media from an ended classroom without touching a new classroom', async () => {
    const late = deferred<MediaStream>();
    const oldMedia = media(); const newMedia = media();
    getUserMedia.mockReturnValueOnce(late.promise).mockResolvedValueOnce(newMedia.stream);
    const old = new LessonRecorder();
    const opening = old.prewarm();
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    await old.dispose();
    const current = new LessonRecorder();
    await current.prewarm();
    late.resolve(oldMedia.stream);
    await rejected;
    expect(oldMedia.track.stop).toHaveBeenCalledTimes(1);
    expect(newMedia.track.stop).not.toHaveBeenCalled();
    await current.prewarm();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    await current.dispose();
  });

  it('keeps a new context and source after the old close completes', async () => {
    const oldMedia = media(); const newMedia = media();
    getUserMedia.mockResolvedValueOnce(oldMedia.stream).mockResolvedValueOnce(newMedia.stream);
    const old = new LessonRecorder(); await old.prewarm();
    const closed = deferred<void>();
    contexts[0].close.mockImplementationOnce(() => closed.promise);
    const ending = old.dispose();
    const current = new LessonRecorder(); await current.prewarm();
    closed.resolve(); await ending;
    await current.prewarm();
    expect(contexts).toHaveLength(2);
    expect(contexts[1].source.disconnect).not.toHaveBeenCalled();
    expect(newMedia.track.stop).not.toHaveBeenCalled();
    await current.dispose();
  });

  it.each(['resume', 'worklet'])('does not publish old %s initialization after disposal', async (stage) => {
    const loading = deferred<void>();
    contextSetup.push((ctx) => {
      if (stage === 'resume') { ctx.state = 'suspended'; ctx.resume.mockImplementation(() => loading.promise); }
      else ctx.audioWorklet.addModule.mockImplementation(() => loading.promise);
    });
    const old = new LessonRecorder();
    const opening = old.prewarm();
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    await old.dispose();
    const mic = media(); getUserMedia.mockResolvedValueOnce(mic.stream);
    const current = new LessonRecorder(); await current.prewarm();
    loading.resolve();
    await rejected;
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(mic.track.stop).not.toHaveBeenCalled();
    await current.dispose();
  });

  it('shares prewarming within a classroom and preserves tail PCM before disconnect', async () => {
    vi.useFakeTimers();
    const mic = media(); getUserMedia.mockResolvedValue(mic.stream);
    const recorder = new LessonRecorder();
    await Promise.all([recorder.prewarm(), recorder.prewarm()]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const chunks = vi.fn();
    const handle = await recorder.start({ onChunk: chunks });
    const stopped = handle.stop();
    expect(handle.stop()).toBe(stopped);
    const tail = new ArrayBuffer(8);
    nodes[0].port.onmessage?.({ data: tail });
    expect(chunks).toHaveBeenCalledWith(tail);
    expect(nodes[0].disconnect).not.toHaveBeenCalled();
    nodes[0].port.onmessage?.({ data: { type: 'flush-ack' } });
    await vi.advanceTimersByTimeAsync(10);
    await stopped;
    expect(nodes[0].disconnect).toHaveBeenCalledTimes(1);
    expect(contexts[0].source.disconnect).toHaveBeenCalledWith(nodes[0]);
    expect(mic.track.stop).not.toHaveBeenCalled();
    await recorder.dispose();
    expect(mic.track.stop).toHaveBeenCalledTimes(1);
  });
});

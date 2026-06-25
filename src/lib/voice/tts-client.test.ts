import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtsClient } from './tts-client';

// Minimal controllable WebSocket stand-in: tts-client constructs `new WebSocket(url)` directly,
// so stub the global and drive open/close/error from the test.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readyState = 0;
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  triggerOpen() {
    this.readyState = this.OPEN;
    this.onopen?.();
  }
  triggerClose() {
    this.readyState = 3;
    this.onclose?.();
  }
}

type Ev = { e: string; d: any };

function track(client: TtsClient): Ev[] {
  const events: Ev[] = [];
  (['open', 'close', 'reconnecting', 'reconnected', 'error', 'session-lost'] as const).forEach((e) =>
    client.on(e, (d) => events.push({ e, d })),
  );
  return events;
}

async function openClient(client: TtsClient) {
  const p = client.open();
  FakeWebSocket.instances.at(-1)!.triggerOpen();
  await p;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as any);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TtsClient reconnect backoff', () => {
  it('reconnects after an unintentional close with a 500ms first delay', async () => {
    const client = new TtsClient();
    const events = track(client);
    await openClient(client);

    FakeWebSocket.instances[0].triggerClose();
    expect(events.filter((x) => x.e === 'reconnecting').at(-1)!.d).toEqual({ attempt: 1, maxRetries: 3 });

    await vi.advanceTimersByTimeAsync(499);
    expect(FakeWebSocket.instances.length).toBe(1); // not yet
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances.length).toBe(2); // reconnect dialed at exactly 500ms

    FakeWebSocket.instances[1].triggerOpen();
    await Promise.resolve();
    expect(events.some((x) => x.e === 'reconnected')).toBe(true);
  });

  it('escalates the delay (500 → 1000 → 2000) and gives up after 3 retries', async () => {
    const client = new TtsClient();
    const events = track(client);
    await openClient(client);

    FakeWebSocket.instances[0].triggerClose(); // attempt 1, 500ms
    await vi.advanceTimersByTimeAsync(500);
    FakeWebSocket.instances[1].triggerClose(); // attempt 2, 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    FakeWebSocket.instances[2].triggerClose(); // attempt 3, 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    FakeWebSocket.instances[3].triggerClose(); // attempt would be 4 → give up

    const attempts = events.filter((x) => x.e === 'reconnecting').map((x) => x.d.attempt);
    expect(attempts).toEqual([1, 2, 3]);
    expect(events.some((x) => x.e === 'error' && x.d.code === 'reconnect-failed')).toBe(true);
  });

  it('resets the attempt counter after a successful reconnect', async () => {
    const client = new TtsClient();
    const events = track(client);
    await openClient(client);

    FakeWebSocket.instances[0].triggerClose(); // attempt 1
    await vi.advanceTimersByTimeAsync(500);
    FakeWebSocket.instances[1].triggerOpen(); // success → counter reset
    await Promise.resolve();

    FakeWebSocket.instances[1].triggerClose(); // a fresh disconnect must start back at attempt 1
    const attempts = events.filter((x) => x.e === 'reconnecting').map((x) => x.d.attempt);
    expect(attempts).toEqual([1, 1]);
  });

  it('emits session-lost with the active sessionId on disconnect', async () => {
    const client = new TtsClient();
    const events = track(client);
    await openClient(client);

    client.startSession('s-42');
    FakeWebSocket.instances[0].triggerClose();

    expect(events.find((x) => x.e === 'session-lost')!.d).toEqual({ sessionId: 's-42' });
  });

  it('does not reconnect after an intentional close()', async () => {
    const client = new TtsClient();
    const events = track(client);
    await openClient(client);

    client.close();
    FakeWebSocket.instances[0].triggerClose();
    await vi.advanceTimersByTimeAsync(5000);

    expect(events.some((x) => x.e === 'reconnecting')).toBe(false);
    expect(FakeWebSocket.instances.length).toBe(1);
  });
});

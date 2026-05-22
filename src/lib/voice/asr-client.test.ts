import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsrClient, buildAsrUrl, setAsrSessionContext } from './asr-client';

const sockets: MockWebSocket[] = [];

class MockWebSocket {
  static OPEN = 1;
  OPEN = 1;
  readyState = MockWebSocket.OPEN;
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(public url: string) {
    sockets.push(this);
    queueMicrotask(() => this.onopen?.());
  }
}

describe('AsrClient session URL context', () => {
  beforeEach(() => {
    sockets.length = 0;
    setAsrSessionContext({});
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    setAsrSessionContext({});
    vi.unstubAllGlobals();
  });

  it('omits cardId when only courseId is set', async () => {
    setAsrSessionContext({ courseId: 'animals' });

    await new AsrClient().open();

    expect(sockets[0].url).toContain('/api/voice/asr?courseId=animals');
    expect(sockets[0].url).not.toContain('cardId=');
  });

  it('includes cardId and clearedCardIds when present', async () => {
    setAsrSessionContext({
      courseId: 'animals',
      cardId: 'dog',
      clearedCardIds: ['cat', ''],
    });

    await new AsrClient().open();

    expect(sockets[0].url).toContain('courseId=animals');
    expect(sockets[0].url).toContain('cardId=dog');
    expect(sockets[0].url).toContain('clearedCardIds=cat');
  });

  it('builds targetWords query values only when non-empty', () => {
    expect(buildAsrUrl({ courseId: 'colors', targetWords: [] })).toContain('/api/voice/asr?courseId=colors');
    expect(buildAsrUrl({ courseId: 'colors', targetWords: [] })).not.toContain('targetWords=');
    expect(buildAsrUrl({ courseId: 'colors', targetWords: ['red', 'blue'] })).toContain('targetWords=red%2Cblue');
  });
});

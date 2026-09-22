import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsrClient, buildAsrUrl } from './asr-client';

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
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps two classroom context snapshots separate', async () => {
    const words = ['cat'];
    const first = new AsrClient({ courseId: 'animals', clearedCardIds: words });
    const second = new AsrClient({ courseId: 'food', cardId: 'apple' });
    words.push('dog');
    await second.open();
    await first.open();
    expect(sockets[0].url).toContain('courseId=food');
    expect(sockets[1].url).toContain('courseId=animals');
    expect(sockets[1].url).toContain('clearedCardIds=cat');
    expect(sockets[1].url).not.toContain('dog');
  });

  it('settles pending open on close and ignores late open', async () => {
    const client = new AsrClient();
    const opened = vi.fn();
    client.on('open', opened);
    const pending = client.open();
    client.close();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(opened).not.toHaveBeenCalled();
  });

  it('omits cardId when only courseId is set', async () => {
    await new AsrClient({ courseId: 'animals' }).open();

    expect(sockets[0].url).toContain('/api/voice/asr?courseId=animals');
    expect(sockets[0].url).not.toContain('cardId=');
  });

  it('includes cardId and clearedCardIds when present', async () => {
    await new AsrClient({
      courseId: 'animals',
      cardId: 'dog',
      clearedCardIds: ['cat', ''],
    }).open();

    expect(sockets[0].url).toContain('courseId=animals');
    expect(sockets[0].url).toContain('cardId=dog');
    expect(sockets[0].url).toContain('clearedCardIds=cat');
  });

  it('builds targetWords query values only when non-empty', () => {
    expect(buildAsrUrl({ courseId: 'colors', targetWords: [] })).toContain('/api/voice/asr?courseId=colors');
    expect(buildAsrUrl({ courseId: 'colors', targetWords: [] })).not.toContain('targetWords=');
    expect(buildAsrUrl({ courseId: 'colors', targetWords: ['red', 'blue'] })).toContain('targetWords=red%2Cblue');
  });

  it('appends one sentenceText param per quiz sentence (no comma joining)', () => {
    const url = buildAsrUrl({
      courseId: 'sports',
      sentenceTexts: ['I play tennis.', 'I like swimming.'],
    });
    expect(url).toContain('sentenceText=I+play+tennis.');
    expect(url).toContain('sentenceText=I+like+swimming.');
    expect(buildAsrUrl({ courseId: 'sports', sentenceTexts: [] })).not.toContain('sentenceText=');
  });
});

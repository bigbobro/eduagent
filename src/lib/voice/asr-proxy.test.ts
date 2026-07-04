import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { bridge, buildAsrRequestPayload, parseAsrSessionInfoFromUrl } from './asr-proxy';
import { decodeServerFrame, MessageType, Flags } from './doubao-codec';

// Fake WS mirrors the shape tts-proxy.test.ts uses: an EventEmitter that records
// everything sent so we can decode the client→upstream frames the bridge emits.
class FakeWs extends EventEmitter {
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState = this.OPEN;
  sent: Array<string | Buffer> = [];

  send(data: string | Buffer) {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string) {
    this.readyState = this.CLOSED;
    this.emit('close');
  }
}

function emitPcm(client: FakeWs, pcm: Buffer): void {
  client.emit('message', pcm, true);
}

function emitFinish(client: FakeWs): void {
  client.emit('message', Buffer.from(JSON.stringify({ type: 'finish' })), false);
}

function upstreamFrames(upstream: FakeWs) {
  return upstream.sent.filter(Buffer.isBuffer).map((frame) => decodeServerFrame(frame));
}

function hotWordsOf(session: Parameters<typeof buildAsrRequestPayload>[0]): string[] {
  const context = buildAsrRequestPayload(session).request.corpus?.context;
  return context ? JSON.parse(context).hotwords.map((h: { word: string }) => h.word) : [];
}

describe('asr hot-word context (07-03-sentence-asr-context)', () => {
  it('keeps the word-round card-window hot words unchanged (zero regression, no sentences)', () => {
    const session = parseAsrSessionInfoFromUrl('/api/voice/asr?courseId=sports&cardId=tennis');
    const words = hotWordsOf(session);

    // Current card + next uncleared word — the pre-existing W2 window, nothing else.
    expect(words).toEqual(['tennis', 'swimming']);
    expect(words.some((word) => word.includes(' '))).toBe(false);
  });

  it('parses one sentenceText query param per sentence without splitting on punctuation', () => {
    const session = parseAsrSessionInfoFromUrl(
      '/api/voice/asr?courseId=sports&sentenceText=I%20play%20tennis.&sentenceText=I%20like%20swimming.',
    );
    expect(session.sentenceTexts).toEqual(['I play tennis.', 'I like swimming.']);
  });

  it('injects the quiz sentence (whole phrase + content words) ahead of the course-word fallback', () => {
    const session = parseAsrSessionInfoFromUrl(
      '/api/voice/asr?courseId=sports&sentenceText=I%20play%20tennis.&sentenceText=I%20like%20swimming.',
    );
    const words = hotWordsOf(session);

    // Current sentence first: whole phrase (terminal punctuation stripped) then its content words.
    expect(words.slice(0, 3)).toEqual(['I play tennis', 'play', 'tennis']);
    // Adjacent quiz-group sentence as secondary candidates.
    expect(words).toContain('I like swimming');
    expect(words).toContain('like');
    // The 2026-06-21 reinforcement fallback (whole course vocabulary) is preserved after them.
    expect(words).toContain('soccer');
    expect(words).toContain('badminton');
    // Dedupe: "tennis"/"swimming" appear once even though they are also course words.
    expect(words.filter((word) => word === 'tennis')).toHaveLength(1);
    expect(words.filter((word) => word === 'swimming')).toHaveLength(1);
  });
});

describe('asr-proxy bridge', () => {
  it('buffers handshake-period PCM and flushes it after upstream opens', () => {
    const client = new FakeWs();
    const upstream = new FakeWs();
    bridge(client as any, {}, { createUpstream: () => upstream as any });

    // Client starts sending PCM while the Doubao handshake is still in flight.
    emitPcm(client, Buffer.from([1, 2, 3, 4]));
    emitPcm(client, Buffer.from([5, 6, 7, 8]));
    expect(upstream.sent).toHaveLength(0); // nothing leaks to upstream before it is ready

    upstream.emit('open');

    // First the full client request (config), then the two buffered PCM packets.
    expect(upstreamFrames(upstream).map((f) => f.messageType)).toEqual([
      MessageType.FullClientRequest,
      MessageType.AudioOnlyRequest,
      MessageType.AudioOnlyRequest,
    ]);
  });

  it('defers the finish packet when the client releases before the handshake completes', () => {
    const client = new FakeWs();
    const upstream = new FakeWs();
    bridge(client as any, {}, { createUpstream: () => upstream as any });

    // Fast key-release: one PCM packet then finish, both before upstream open.
    emitPcm(client, Buffer.from([1, 2, 3, 4]));
    emitFinish(client);
    expect(upstream.sent).toHaveLength(0);

    upstream.emit('open');

    const frames = upstreamFrames(upstream);
    expect(frames.map((f) => f.messageType)).toEqual([
      MessageType.FullClientRequest,
      MessageType.AudioOnlyRequest, // buffered PCM
      MessageType.AudioOnlyRequest, // deferred finish (empty last packet)
    ]);
    // The deferred finish is the terminal negative-sequence packet.
    expect(frames[1].flags).toBe(Flags.PositiveSequence);
    expect(frames[2].flags).toBe(Flags.NegativeSequenceLast);
  });

  it('rejects the connection when handshake-buffered PCM overflows the cap', () => {
    const client = new FakeWs();
    const upstream = new FakeWs();
    bridge(client as any, {}, { createUpstream: () => upstream as any });

    // One packet just over the 10MB pending-PCM ceiling, still before upstream open.
    emitPcm(client, Buffer.alloc(10 * 1024 * 1024 + 1));

    expect(client.readyState).toBe(client.CLOSED);
    expect(upstream.readyState).toBe(upstream.CLOSED);
  });
});

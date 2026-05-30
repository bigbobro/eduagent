import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { bridge } from './tts-proxy';
import { decodeTtsFrame, encodeTtsEvent } from './doubao-codec';

class FakeWs extends EventEmitter {
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState = this.OPEN;
  sent: Array<string | Buffer> = [];

  send(data: string | Buffer) {
    this.sent.push(data);
  }

  close() {
    this.readyState = this.CLOSED;
    this.emit('close');
  }
}

function emitJson(client: FakeWs, payload: object): void {
  client.emit('message', Buffer.from(JSON.stringify(payload)), false);
}

function emitConnectionStarted(upstream: FakeWs): void {
  upstream.emit('message', encodeTtsEvent({
    event: 50,
    sessionId: 'connection-1',
    payload: Buffer.from('{}', 'utf8'),
  }));
}

function upstreamEvents(upstream: FakeWs): number[] {
  return upstream.sent
    .filter(Buffer.isBuffer)
    .map((frame) => decodeTtsFrame(frame).event);
}

describe('tts-proxy bridge', () => {
  it('buffers session controls until the upstream connection is ready', () => {
    const client = new FakeWs();
    const upstream = new FakeWs();
    bridge(client as any, { createUpstream: () => upstream as any });

    upstream.emit('open');
    emitJson(client, { type: 'session-start', sessionId: 'session-1' });
    emitJson(client, { type: 'text-chunk', text: 'hello' });
    emitJson(client, { type: 'session-finish' });

    expect(upstreamEvents(upstream)).toEqual([1]);

    emitConnectionStarted(upstream);

    expect(upstreamEvents(upstream)).toEqual([1, 100, 200, 102]);
    const textFrame = upstream.sent.filter(Buffer.isBuffer).map((frame) => decodeTtsFrame(frame))[2];
    expect(JSON.parse(textFrame.payload.toString('utf8')).req_params.text).toBe('hello');
    expect(client.sent).toContain(JSON.stringify({ type: 'connection-started' }));
  });

  it('preserves queued session cancel order after upstream readiness', () => {
    const client = new FakeWs();
    const upstream = new FakeWs();
    bridge(client as any, { createUpstream: () => upstream as any });

    upstream.emit('open');
    emitJson(client, { type: 'session-start', sessionId: 'session-2' });
    emitJson(client, { type: 'text-chunk', text: 'cancel me' });
    emitJson(client, { type: 'session-cancel' });

    emitConnectionStarted(upstream);

    expect(upstreamEvents(upstream)).toEqual([1, 100, 200, 101]);
  });
});

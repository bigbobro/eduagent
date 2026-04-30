import { describe, it, expect } from 'vitest';
import {
  encodeFullClientRequest,
  encodeAudioOnlyRequest,
  encodeAudioOnlyLast,
  decodeServerFrame,
  encodeTtsEvent,
  decodeTtsFrame,
  MessageType,
  Flags,
  Serialization,
  Compression,
} from './doubao-codec';

describe('doubao-codec — ASR direction', () => {
  it('encodes full-client request as JSON with positive sequence 1', () => {
    const payload = { user: { uid: 'u1' } };
    const buf = encodeFullClientRequest(payload, 1);

    // header: version=1, header_size=1, type=Full, flags=PositiveSeq, ser=JSON, compress=None
    expect(buf[0]).toBe(0x11);
    expect(buf[1]).toBe(0x11); // 0001 0001
    expect(buf[2]).toBe(0x10); // 0001 0000
    expect(buf[3]).toBe(0x00);

    // sequence (4 bytes, big-endian)
    const seq = buf.readInt32BE(4);
    expect(seq).toBe(1);

    // payload size (4 bytes, big-endian)
    const size = buf.readUInt32BE(8);
    const json = JSON.parse(buf.subarray(12, 12 + size).toString('utf8'));
    expect(json).toEqual(payload);
  });

  it('encodes audio-only request with positive sequence', () => {
    const audio = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const buf = encodeAudioOnlyRequest(audio, 7);

    expect(buf[1] & 0xf0).toBe(0x20); // type = AudioOnly
    expect(buf[1] & 0x0f).toBe(0x01); // flags = PositiveSeq
    expect(buf[2] & 0xf0).toBe(0x00); // ser = Raw
    expect(buf.readInt32BE(4)).toBe(7);
    expect(buf.readUInt32BE(8)).toBe(4);
    expect(buf.subarray(12)).toEqual(audio);
  });

  it('encodes negative-sequence last audio packet', () => {
    const buf = encodeAudioOnlyLast(Buffer.alloc(0), -10);
    expect(buf[1] & 0x0f).toBe(0x03); // flags = NegativeSeqLast
    expect(buf.readInt32BE(4)).toBe(-10);
    expect(buf.readUInt32BE(8)).toBe(0);
  });

  it('decodes a server JSON response frame', () => {
    const payload = JSON.stringify({ result: { text: 'hello' } });
    const payloadBuf = Buffer.from(payload, 'utf8');
    const frame = Buffer.alloc(4 + 4 + 4 + payloadBuf.length);
    frame[0] = 0x11;
    frame[1] = 0x91; // type=FullServerResponse(1001), flags=PositiveSeq(0001)
    frame[2] = 0x10; // ser=JSON
    frame[3] = 0x00;
    frame.writeInt32BE(5, 4); // seq
    frame.writeUInt32BE(payloadBuf.length, 8);
    payloadBuf.copy(frame, 12);

    const decoded = decodeServerFrame(frame);
    expect(decoded.messageType).toBe(MessageType.FullServerResponse);
    expect(decoded.sequence).toBe(5);
    expect(decoded.serialization).toBe(Serialization.JSON);
    expect(decoded.payload.toString('utf8')).toBe(payload);
  });

  it('decodes an error frame', () => {
    const errPayload = Buffer.from('{"error":"x"}', 'utf8');
    const frame = Buffer.alloc(4 + 4 + errPayload.length);
    frame[0] = 0x11;
    frame[1] = 0xf0; // type=Error(1111), no flags
    frame[2] = 0x10;
    frame[3] = 0x00;
    frame.writeUInt32BE(errPayload.length, 4);
    errPayload.copy(frame, 8);

    const decoded = decodeServerFrame(frame);
    expect(decoded.messageType).toBe(MessageType.Error);
    expect(decoded.payload.toString('utf8')).toBe('{"error":"x"}');
  });
});

describe('doubao-codec — TTS direction', () => {
  it('encodes StartConnection event (event=1, no session)', () => {
    const buf = encodeTtsEvent({ event: 1, payload: Buffer.from('{}', 'utf8') });
    // header: type=Full(0001), flags=Event(0100)
    expect(buf[1] & 0xf0).toBe(0x10);
    expect(buf[1] & 0x0f).toBe(0x04); // flags = Event
    expect(buf.readInt32BE(4)).toBe(1); // event
    expect(buf.readUInt32BE(8)).toBe(2); // payload size
    expect(buf.subarray(12).toString('utf8')).toBe('{}');
  });

  it('encodes StartSession event (event=100, with sessionId)', () => {
    const sid = 'abc-123';
    const payload = Buffer.from('{"k":"v"}', 'utf8');
    const buf = encodeTtsEvent({ event: 100, sessionId: sid, payload });

    // flags = EventWithSession (0101)
    expect(buf[1] & 0x0f).toBe(0x05);
    let off = 4;
    expect(buf.readInt32BE(off)).toBe(100); // event
    off += 4;
    const sidLen = buf.readUInt32BE(off);
    off += 4;
    expect(sidLen).toBe(Buffer.byteLength(sid, 'utf8'));
    expect(buf.subarray(off, off + sidLen).toString('utf8')).toBe(sid);
    off += sidLen;
    expect(buf.readUInt32BE(off)).toBe(payload.length);
    off += 4;
    expect(buf.subarray(off).toString('utf8')).toBe('{"k":"v"}');
  });

  it('decodes server TTSResponse frame (event=352, binary PCM)', () => {
    const sid = 's-1';
    const sidBuf = Buffer.from(sid, 'utf8');
    const pcm = Buffer.from([0x10, 0x20, 0x30, 0x40]);
    // header(4) + event(4) + sidLen(4) + sid + payloadSize(4) + pcm
    const frame = Buffer.alloc(4 + 4 + 4 + sidBuf.length + 4 + pcm.length);
    frame[0] = 0x11;
    frame[1] = 0x95; // type=FullServerResponse(1001), flags=EventWithSession(0101)
    frame[2] = 0x00; // ser=Raw, comp=None
    frame[3] = 0x00;
    let off = 4;
    frame.writeInt32BE(352, off); off += 4;
    frame.writeUInt32BE(sidBuf.length, off); off += 4;
    sidBuf.copy(frame, off); off += sidBuf.length;
    frame.writeUInt32BE(pcm.length, off); off += 4;
    pcm.copy(frame, off);

    const decoded = decodeTtsFrame(frame);
    expect(decoded.event).toBe(352);
    expect(decoded.sessionId).toBe(sid);
    expect(decoded.payload).toEqual(pcm);
  });

  it('decodes a TTS server JSON event (e.g. SessionStarted=150)', () => {
    const sid = 's-2';
    const sidBuf = Buffer.from(sid, 'utf8');
    const json = Buffer.from('{"ok":true}', 'utf8');
    const frame = Buffer.alloc(4 + 4 + 4 + sidBuf.length + 4 + json.length);
    frame[0] = 0x11;
    frame[1] = 0x95;
    frame[2] = 0x10; // ser=JSON
    frame[3] = 0x00;
    let off = 4;
    frame.writeInt32BE(150, off); off += 4;
    frame.writeUInt32BE(sidBuf.length, off); off += 4;
    sidBuf.copy(frame, off); off += sidBuf.length;
    frame.writeUInt32BE(json.length, off); off += 4;
    json.copy(frame, off);

    const decoded = decodeTtsFrame(frame);
    expect(decoded.event).toBe(150);
    expect(decoded.sessionId).toBe(sid);
    expect(decoded.serialization).toBe(Serialization.JSON);
    expect(JSON.parse(decoded.payload.toString('utf8'))).toEqual({ ok: true });
  });
});

describe('doubao-codec — constants', () => {
  it('exports protocol constants', () => {
    expect(MessageType.FullClientRequest).toBe(0x01);
    expect(MessageType.AudioOnlyRequest).toBe(0x02);
    expect(MessageType.FullServerResponse).toBe(0x09);
    expect(MessageType.Error).toBe(0x0f);
    expect(Flags.NoSequence).toBe(0x00);
    expect(Flags.PositiveSequence).toBe(0x01);
    expect(Flags.NegativeSequenceLast).toBe(0x03);
    expect(Flags.Event).toBe(0x04);
    expect(Flags.EventWithSession).toBe(0x05);
    expect(Serialization.Raw).toBe(0x00);
    expect(Serialization.JSON).toBe(0x01);
    expect(Compression.None).toBe(0x00);
    expect(Compression.Gzip).toBe(0x01);
  });
});

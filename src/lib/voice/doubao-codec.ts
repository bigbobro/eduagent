// 豆包二进制协议编解码,大端序整数。
// See project protocol summaries in docs/DOUBAO Protocol/.

export const MessageType = {
  FullClientRequest: 0x01,
  AudioOnlyRequest: 0x02,
  FullServerResponse: 0x09,
  Error: 0x0f,
} as const;

export const Flags = {
  NoSequence: 0x00,
  PositiveSequence: 0x01,
  NegativeSequenceLast: 0x03,
  Event: 0x04,
} as const;

export const Serialization = {
  Raw: 0x00,
  JSON: 0x01,
} as const;

export const Compression = {
  None: 0x00,
  Gzip: 0x01,
} as const;

const PROTOCOL_VERSION = 0x01;
const HEADER_SIZE = 0x01; // 1 * 4 = 4 bytes

function buildHeader(messageType: number, flags: number, serialization: number, compression: number): Buffer {
  const h = Buffer.alloc(4);
  h[0] = (PROTOCOL_VERSION << 4) | HEADER_SIZE;
  h[1] = ((messageType & 0x0f) << 4) | (flags & 0x0f);
  h[2] = ((serialization & 0x0f) << 4) | (compression & 0x0f);
  h[3] = 0x00;
  return h;
}

// ─── ASR direction ─────────────────────────────────────────────────────

export function encodeFullClientRequest(payload: object, sequence: number = 1): Buffer {
  const header = buildHeader(
    MessageType.FullClientRequest,
    Flags.PositiveSequence,
    Serialization.JSON,
    Compression.None
  );
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(sequence, 0);
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, seq, size, body]);
}

export function encodeAudioOnlyRequest(pcm: Buffer, sequence: number): Buffer {
  const header = buildHeader(
    MessageType.AudioOnlyRequest,
    Flags.PositiveSequence,
    Serialization.Raw,
    Compression.None
  );
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(sequence, 0);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(pcm.length, 0);
  return Buffer.concat([header, seq, size, pcm]);
}

export function encodeAudioOnlyLast(pcm: Buffer, sequence: number): Buffer {
  // sequence 应为负数,标记最后一包
  const header = buildHeader(
    MessageType.AudioOnlyRequest,
    Flags.NegativeSequenceLast,
    Serialization.Raw,
    Compression.None
  );
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(sequence, 0);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(pcm.length, 0);
  return Buffer.concat([header, seq, size, pcm]);
}

export interface ServerFrame {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  sequence?: number;
  payload: Buffer;
}

export function decodeServerFrame(buf: Buffer): ServerFrame {
  if (buf.length < 8) {
    throw new Error(`Frame too short: ${buf.length}`);
  }
  const messageType = (buf[1] >> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  const serialization = (buf[2] >> 4) & 0x0f;
  const compression = buf[2] & 0x0f;

  let off = 4;
  let sequence: number | undefined;
  if (flags === Flags.PositiveSequence || flags === Flags.NegativeSequenceLast) {
    sequence = buf.readInt32BE(off);
    off += 4;
  }
  const payloadSize = buf.readUInt32BE(off);
  off += 4;
  const payload = buf.subarray(off, off + payloadSize);
  return { messageType, flags, serialization, compression, sequence, payload };
}

// ─── TTS direction ─────────────────────────────────────────────────────

export interface TtsEventInput {
  event: number;
  sessionId?: string;
  payload?: Buffer;
  serialization?: number; // default JSON
}

export function encodeTtsEvent(input: TtsEventInput): Buffer {
  const ser = input.serialization ?? Serialization.JSON;
  // 豆包 V3 双向 TTS:flag 永远 0x04 (with event number)。是否带 sessionId 由 event_id 决定,
  // 不影响 flag。早先用 0x05 (EventWithSession) 是误读,豆包 V1 协议会把它当 sequence 帧解析。
  const header = buildHeader(MessageType.FullClientRequest, Flags.Event, ser, Compression.None);

  const eventBuf = Buffer.alloc(4);
  eventBuf.writeInt32BE(input.event, 0);

  const parts: Buffer[] = [header, eventBuf];

  if (input.sessionId) {
    const sid = Buffer.from(input.sessionId, 'utf8');
    const sidLen = Buffer.alloc(4);
    sidLen.writeUInt32BE(sid.length, 0);
    parts.push(sidLen, sid);
  }

  const payload = input.payload ?? Buffer.alloc(0);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length, 0);
  parts.push(size, payload);

  return Buffer.concat(parts);
}

export interface TtsServerFrame {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  event: number;
  sessionId?: string;
  payload: Buffer;
}

export function decodeTtsFrame(buf: Buffer): TtsServerFrame {
  if (buf.length < 8) {
    throw new Error(`TTS frame too short: ${buf.length}`);
  }
  const messageType = (buf[1] >> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  const serialization = (buf[2] >> 4) & 0x0f;
  const compression = buf[2] & 0x0f;

  let off = 4;
  const event = buf.readInt32BE(off);
  off += 4;

  // 豆包 V3 双向 TTS:event ∈ {1, 2} 的请求帧没有 connection/session 字段。
  // 其他事件(connection_id 50/51/52,session_id ≥100 全部数据类)都有 4 字节长度 + 字符串。
  // 注意:错误帧(messageType=0xf)走错误码字段,不在这里处理。
  let sessionId: string | undefined;
  if (messageType !== MessageType.Error && event !== 1 && event !== 2) {
    const sidLen = buf.readUInt32BE(off);
    off += 4;
    sessionId = buf.subarray(off, off + sidLen).toString('utf8');
    off += sidLen;
  }

  const payloadSize = buf.readUInt32BE(off);
  off += 4;
  const payload = buf.subarray(off, off + payloadSize);
  return { messageType, flags, serialization, compression, event, sessionId, payload };
}

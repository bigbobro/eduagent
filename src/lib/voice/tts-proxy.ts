import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { WebSocket as WsClient, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import {
  encodeTtsEvent,
  decodeTtsFrame,
  Serialization,
} from './doubao-codec';

const DOUBAO_TTS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';

const wss = new WebSocketServer({ noServer: true });

export function handleTTSUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
  if (process.env.VOICE_MOCK === 'true') {
    return handleMockTTS(req, socket, head);
  }
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    bridge(clientWs);
  });
}

interface PendingSession {
  sessionId: string;
}

function bridge(clientWs: WsClient): void {
  const connectId = randomUUID();
  const headers: Record<string, string> = {
    'X-Api-App-Id': process.env.DOUBAO_APP_ID || '',
    'X-Api-Access-Key': process.env.DOUBAO_ACCESS_KEY || '',
    'X-Api-Resource-Id': process.env.DOUBAO_TTS_RESOURCE_ID || 'seed-tts-2.0',
    'X-Api-Connect-Id': connectId,
  };

  const upstream = new WsClient(DOUBAO_TTS_URL, { headers });
  let connectionReady = false;
  let currentSession: PendingSession | null = null;
  let closed = false;

  const closeAll = (code: number = 1000) => {
    if (closed) return;
    closed = true;
    try { clientWs.close(code); } catch {}
    try { upstream.close(); } catch {}
  };

  upstream.on('open', () => {
    upstream.send(encodeTtsEvent({ event: 1, payload: Buffer.from('{}', 'utf8') }));
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState !== clientWs.OPEN) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    let frame;
    try { frame = decodeTtsFrame(buf); } catch (e) {
      clientWs.send(JSON.stringify({ type: 'error', code: 'decode', message: (e as Error).message }));
      return;
    }

    switch (frame.event) {
      case 50: // ConnectionStarted
        connectionReady = true;
        clientWs.send(JSON.stringify({ type: 'connection-started' }));
        break;
      case 150: // SessionStarted
        clientWs.send(JSON.stringify({ type: 'session-started', sessionId: frame.sessionId }));
        break;
      case 152: // SessionFinished
        clientWs.send(JSON.stringify({ type: 'session-finished', sessionId: frame.sessionId }));
        currentSession = null;
        break;
      case 350: { // TTSSentenceStart
        const json = safeParse(frame.payload.toString('utf8'));
        clientWs.send(JSON.stringify({ type: 'subtitle', text: json?.text ?? '' }));
        break;
      }
      case 351: // TTSSentenceEnd
        clientWs.send(JSON.stringify({ type: 'sentence-end' }));
        break;
      case 352: // TTSResponse - binary PCM
        clientWs.send(frame.payload, { binary: true });
        break;
      default: {
        // 错误事件或未知事件
        const json = frame.serialization === Serialization.JSON
          ? safeParse(frame.payload.toString('utf8'))
          : null;
        if (json?.error) {
          clientWs.send(JSON.stringify({ type: 'error', code: 'upstream', message: JSON.stringify(json) }));
        }
      }
    }
  });

  upstream.on('error', (err) => {
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify({ type: 'error', code: 'upstream', message: err.message }));
    }
    closeAll();
  });

  upstream.on('close', () => {
    closeAll();
  });

  clientWs.on('message', (data, isBinary) => {
    if (isBinary) return; // 前端到代理只接受 JSON 控制帧
    void connectionReady; // 引用变量,等连接 ready 再处理但不阻塞 — 实际发出会失败,记录但不致命
    const text = data.toString();
    const msg = safeParse(text);
    if (!msg) return;

    switch (msg.type) {
      case 'session-start': {
        const sessionId = msg.sessionId || randomUUID();
        currentSession = { sessionId };
        const reqParams = {
          speaker: process.env.DOUBAO_TTS_DEFAULT_SPEAKER,
          model: 'seed-tts-2.0-standard',
          audio_params: {
            format: 'pcm',
            sample_rate: 24000,
            speech_rate: -10,
            loudness_rate: 0,
          },
          // 豆包文档规定 additions 是 jsonstring(序列化后的 JSON 字符串),不是 object。
          // Go 示例:additions = fmt.Sprintf("{\"disable_default_bit_rate\":true}")
          additions: JSON.stringify({
            disable_markdown_filter: false,
            cache_config: { text_type: 1, use_cache: true, use_segment_cache: true },
          }),
        };
        const payload = JSON.stringify({
          event: 100,
          namespace: 'BidirectionalTTS',
          req_params: reqParams,
        });
        upstream.send(encodeTtsEvent({ event: 100, sessionId, payload: Buffer.from(payload, 'utf8') }));
        break;
      }
      case 'text-chunk': {
        if (!currentSession) return;
        // 豆包文档:TaskRequest 的 text 在 req_params.text 里,不是顶层
        const payload = JSON.stringify({
          event: 200,
          namespace: 'BidirectionalTTS',
          req_params: { text: msg.text },
        });
        upstream.send(encodeTtsEvent({ event: 200, sessionId: currentSession.sessionId, payload: Buffer.from(payload, 'utf8') }));
        break;
      }
      case 'session-finish': {
        if (!currentSession) return;
        upstream.send(encodeTtsEvent({ event: 102, sessionId: currentSession.sessionId, payload: Buffer.from('{}', 'utf8') }));
        break;
      }
      case 'session-cancel': {
        if (!currentSession) return;
        upstream.send(encodeTtsEvent({ event: 101, sessionId: currentSession.sessionId, payload: Buffer.from('{}', 'utf8') }));
        currentSession = null;
        break;
      }
    }
  });

  clientWs.on('close', () => {
    if (upstream.readyState === upstream.OPEN) {
      try {
        upstream.send(encodeTtsEvent({ event: 2, payload: Buffer.from('{}', 'utf8') }));
      } catch {}
    }
    closeAll();
  });

  clientWs.on('error', () => closeAll());
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

// ─── Mock(VOICE_MOCK=true)─────────────────────────────────────────────

function handleMockTTS(req: IncomingMessage, socket: Socket, head: Buffer): void {
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    clientWs.send(JSON.stringify({ type: 'connection-started' }));
    clientWs.on('message', (data, isBinary) => {
      if (isBinary) return;
      const msg = safeParse(data.toString());
      if (!msg) return;
      if (msg.type === 'session-start') {
        clientWs.send(JSON.stringify({ type: 'session-started', sessionId: msg.sessionId }));
      } else if (msg.type === 'text-chunk') {
        clientWs.send(JSON.stringify({ type: 'subtitle', text: msg.text }));
        // 推 200ms 模拟 PCM 静音(24000Hz * 0.2s * 2byte = 9600 字节)
        clientWs.send(Buffer.alloc(9600), { binary: true });
        clientWs.send(JSON.stringify({ type: 'sentence-end' }));
      } else if (msg.type === 'session-finish') {
        clientWs.send(JSON.stringify({ type: 'session-finished' }));
      }
    });
  });
}

import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { WebSocket as WsClient, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import {
  encodeFullClientRequest,
  encodeAudioOnlyRequest,
  encodeAudioOnlyLast,
  decodeServerFrame,
  MessageType,
  Serialization,
} from './doubao-codec';

const DOUBAO_ASR_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';

const wss = new WebSocketServer({ noServer: true });

export function handleASRUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
  if (process.env.VOICE_MOCK === 'true') {
    return handleMockASR(req, socket, head);
  }
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    bridge(clientWs);
  });
}

function bridge(clientWs: WsClient): void {
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    'X-Api-App-Key': process.env.DOUBAO_APP_ID || '',
    'X-Api-Access-Key': process.env.DOUBAO_ACCESS_KEY || '',
    'X-Api-Resource-Id': process.env.DOUBAO_ASR_RESOURCE_ID || 'volc.seedasr.sauc.duration',
    'X-Api-Request-Id': requestId,
    'X-Api-Sequence': '-1',
  };

  const upstream = new WsClient(DOUBAO_ASR_URL, { headers });
  let sequence = 1;
  let upstreamReady = false;
  let closed = false;

  const closeAll = (code: number = 1000, reason: string = '') => {
    if (closed) return;
    closed = true;
    try { clientWs.close(code, reason); } catch {}
    try { upstream.close(); } catch {}
  };

  upstream.on('open', () => {
    upstreamReady = true;
    const payload = {
      user: { uid: `eduagent-${requestId}`, platform: 'web' },
      audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
      request: {
        model_name: 'bigmodel',
        enable_punc: true,
        enable_ddc: true,
        result_type: 'single',
      },
    };
    upstream.send(encodeFullClientRequest(payload, sequence++));
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState !== clientWs.OPEN) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    let frame;
    try {
      frame = decodeServerFrame(buf);
    } catch (e) {
      clientWs.send(JSON.stringify({ type: 'error', code: 'decode', message: (e as Error).message }));
      return;
    }
    if (frame.messageType === MessageType.Error) {
      const text = frame.payload.toString('utf8');
      clientWs.send(JSON.stringify({ type: 'error', code: 'upstream', message: text }));
      closeAll();
      return;
    }
    if (frame.serialization !== Serialization.JSON) return;
    const json = safeParse(frame.payload.toString('utf8'));
    if (!json) return;
    // 豆包 SAUC 返回结构:{ result: { text: "...", utterances: [{ definite: true|false, text }] } }
    const text = json?.result?.text ?? '';
    const utterances = json?.result?.utterances ?? [];
    const isFinal =
      utterances.length > 0 &&
      utterances.every((u: any) => u.definite === true);
    clientWs.send(JSON.stringify({ type: isFinal ? 'final' : 'partial', text }));
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
    if (!upstreamReady) return;
    if (!isBinary) return; // ASR 通道只接受二进制 PCM
    const pcm = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    upstream.send(encodeAudioOnlyRequest(pcm, sequence++));
  });

  clientWs.on('close', () => {
    if (upstreamReady && upstream.readyState === upstream.OPEN) {
      // 发负包标记结束
      try {
        upstream.send(encodeAudioOnlyLast(Buffer.alloc(0), -sequence));
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

function handleMockASR(req: IncomingMessage, socket: Socket, head: Buffer): void {
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    let timer: NodeJS.Timeout | null = null;
    let finalSent = false;
    const phrases = ['Hello', 'Hello, what', 'Hello, what is this?'];
    let i = 0;

    const tick = () => {
      if (clientWs.readyState !== clientWs.OPEN) return;
      if (i < phrases.length) {
        clientWs.send(JSON.stringify({ type: 'partial', text: phrases[i++] }));
      }
      if (i === phrases.length && !finalSent) {
        finalSent = true;
        setTimeout(() => {
          if (clientWs.readyState === clientWs.OPEN) {
            clientWs.send(JSON.stringify({ type: 'final', text: 'Hello, what is this?' }));
          }
        }, 200);
      }
    };

    clientWs.on('message', (_data, isBinary) => {
      if (!isBinary) return;
      if (!timer) {
        timer = setInterval(tick, 300);
      }
    });
    clientWs.on('close', () => {
      if (timer) clearInterval(timer);
    });
  });
}

import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { WebSocket as WsClient, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { getCourseById } from '../../data/courses';
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

export interface AsrSessionInfo {
  courseId?: string;
  targetWords?: string[];
  cardId?: string;
}

interface AsrRequestPayload {
  user: { uid: string; platform: string };
  audio: { format: 'pcm'; rate: 16000; bits: 16; channel: 1 };
  request: {
    model_name: 'bigmodel';
    enable_punc: boolean;
    enable_ddc: boolean;
    show_utterances: boolean;
    result_type: 'full';
    end_window_size: number;
    corpus?: {
      context: string;
    };
  };
}

export function handleASRUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
  if (process.env.VOICE_MOCK === 'true') {
    return handleMockASR(req, socket, head);
  }
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    bridge(clientWs, parseAsrSessionInfoFromUrl(req.url));
  });
}

export function parseAsrSessionInfoFromUrl(reqUrl: string | undefined): AsrSessionInfo {
  const url = new URL(reqUrl || '/api/voice/asr', 'ws://localhost');
  const courseId = cleanWord(url.searchParams.get('courseId') || undefined);
  const cardId = cleanWord(url.searchParams.get('cardId') || undefined);
  const queryTargetWords = url.searchParams
    .getAll('targetWords')
    .flatMap(splitWords)
    .map(cleanWord)
    .filter((word): word is string => Boolean(word));
  const courseTargetWords = courseId ? getCourseTargetWords(courseId) : [];
  const targetWords = dedupeWords(queryTargetWords.length > 0 ? queryTargetWords : courseTargetWords);
  return {
    ...(courseId ? { courseId } : {}),
    ...(targetWords.length > 0 ? { targetWords } : {}),
    ...(cardId ? { cardId } : {}),
  };
}

export function buildAsrRequestPayload(session: AsrSessionInfo = {}, uid: string = 'eduagent-test'): AsrRequestPayload {
  const hotWords = buildHotWords(session);
  const payload: AsrRequestPayload = {
    user: { uid, platform: 'web' },
    audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
    request: {
      model_name: 'bigmodel',
      enable_punc: true,
      enable_ddc: false,
      show_utterances: true,
      result_type: 'full',
      end_window_size: 800,
    },
  };

  if (hotWords.length > 0) {
    payload.request.corpus = {
      context: JSON.stringify({
        hotwords: hotWords.map((word) => ({ word })),
      }),
    };
  }

  return payload;
}

function buildHotWords(session: AsrSessionInfo): string[] {
  const words = [...(session.targetWords || [])];
  const cardWord = getCardHotWord(session.courseId, session.cardId);
  if (cardWord) words.push(cardWord);
  return dedupeWords(words.map(cleanWord).filter((word): word is string => Boolean(word)));
}

function getCourseTargetWords(courseId: string): string[] {
  const course = getCourseById(courseId);
  if (!course) return [];
  return course.cards
    .filter((card) => card.kind === 'word')
    .map((card) => card.english);
}

function getCardHotWord(courseId: string | undefined, cardId: string | undefined): string | null {
  if (!courseId || !cardId) return null;
  const course = getCourseById(courseId);
  const card = course?.cards.find((item) => item.id === cardId);
  return card?.english || null;
}

function splitWords(value: string): string[] {
  return value.split(/[,，|]/g);
}

function cleanWord(value: string | undefined): string | undefined {
  const word = value?.trim();
  return word || undefined;
}

function dedupeWords(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result;
}

function bridge(clientWs: WsClient, session: AsrSessionInfo): void {
  const requestId = randomUUID();
  const tag = `[asr ${requestId.slice(0, 8)}]`;
  console.log(`${tag} bridge open`);
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
  let pcmCount = 0;
  let finalSeen = false;
  let finishedSent = false;
  // upstream 握手期间的 PCM 缓存。client WS 几十 ms 就 open 了,但 proxy → 豆包还要 1-3s。
  // 没这个 buffer,用户按住瞬间到 upstream open 这段时间的 PCM 全部丢失,导致前几个字识别不出。
  const pendingPcm: Buffer[] = [];
  let pendingFinish = false;

  const closeAll = (code: number = 1000, reason: string = '') => {
    if (closed) return;
    closed = true;
    console.log(`${tag} closeAll (pcmCount=${pcmCount}, finalSeen=${finalSeen})`);
    try { clientWs.close(code, reason); } catch {}
    try { upstream.close(); } catch {}
  };

  upstream.on('open', () => {
    upstreamReady = true;
    console.log(`${tag} upstream open`);
    const payload = buildAsrRequestPayload(session, `eduagent-${requestId}`);
    if (payload.request.corpus) {
      console.log(`${tag} hot_words ${payload.request.corpus.context}`);
    }
    upstream.send(encodeFullClientRequest(payload, sequence++));
    // flush 握手期间缓存的 PCM
    if (pendingPcm.length > 0) {
      console.log(`${tag} flush ${pendingPcm.length} buffered pcm packets`);
      for (const pcm of pendingPcm) {
        upstream.send(encodeAudioOnlyRequest(pcm, sequence++));
      }
      pendingPcm.length = 0;
    }
    // 如果客户端在 upstream open 之前就发了 finish,现在发负包结束
    if (pendingFinish) {
      console.log(`${tag} finish (deferred, sent ${pcmCount} pcm)`);
      try {
        upstream.send(encodeAudioOnlyLast(Buffer.alloc(0), -sequence));
      } catch (e) {
        console.log(`${tag} deferred finish error:`, (e as Error).message);
      }
    }
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState !== clientWs.OPEN) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    let frame;
    try {
      frame = decodeServerFrame(buf);
    } catch (e) {
      console.log(`${tag} decode error:`, (e as Error).message);
      clientWs.send(JSON.stringify({ type: 'error', code: 'decode', message: (e as Error).message }));
      return;
    }
    if (frame.messageType === MessageType.Error) {
      const text = frame.payload.toString('utf8');
      console.log(`${tag} upstream error frame:`, text);
      clientWs.send(JSON.stringify({ type: 'error', code: 'upstream', message: text }));
      closeAll();
      return;
    }
    if (frame.serialization !== Serialization.JSON) return;
    const json = safeParse(frame.payload.toString('utf8'));
    if (!json) return;
    const text = json?.result?.text ?? '';
    const utterances = json?.result?.utterances ?? [];
    const isFinal =
      utterances.length > 0 &&
      utterances.every((u: any) => u.definite === true);
    if (isFinal) {
      finalSeen = true;
      console.log(`${tag} final: "${text}" (${utterances.length} utts)`);
    }
    clientWs.send(JSON.stringify({ type: isFinal ? 'final' : 'partial', text }));
  });

  upstream.on('error', (err) => {
    console.log(`${tag} upstream error:`, err.message);
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify({ type: 'error', code: 'upstream', message: err.message }));
    }
    closeAll();
  });

  upstream.on('close', () => {
    console.log(`${tag} upstream close`);
    closeAll();
  });

  clientWs.on('message', (data, isBinary) => {
    if (isBinary) {
      const pcm = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      pcmCount += 1;
      if (upstreamReady) {
        upstream.send(encodeAudioOnlyRequest(pcm, sequence++));
      } else {
        // upstream 握手中,先缓存
        pendingPcm.push(pcm);
      }
      return;
    }
    const msg = safeParse(data.toString());
    if (msg?.type === 'finish' && !finishedSent) {
      finishedSent = true;
      if (upstreamReady) {
        console.log(`${tag} finish (sent ${pcmCount} pcm packets)`);
        try {
          upstream.send(encodeAudioOnlyLast(Buffer.alloc(0), -sequence));
        } catch (e) {
          console.log(`${tag} finish send error:`, (e as Error).message);
        }
      } else {
        // 用户超快松手,upstream 还在握手 — 等 upstream open 后再发负包
        console.log(`${tag} finish queued (upstream not ready, ${pcmCount} pcm pending)`);
        pendingFinish = true;
      }
    }
  });

  clientWs.on('close', () => {
    console.log(`${tag} clientWs close`);
    if (upstreamReady && upstream.readyState === upstream.OPEN && !finishedSent) {
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

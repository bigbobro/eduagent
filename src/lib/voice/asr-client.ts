type AsrEventName = 'partial' | 'final' | 'error' | 'open' | 'close';
type Listener<T = any> = (data: T) => void;

export interface AsrClientSessionContext {
  courseId?: string;
  targetWords?: string[];
  cardId?: string;
}

interface AsrPartial { type: 'partial'; text: string }
interface AsrFinal { type: 'final'; text: string }
interface AsrError { type: 'error'; code: string; message: string }

type AsrServerMsg = AsrPartial | AsrFinal | AsrError;

let sessionContext: AsrClientSessionContext = {};

export function setAsrSessionContext(context: AsrClientSessionContext): void {
  sessionContext = {
    ...context,
    targetWords: context.targetWords?.filter(Boolean),
  };
}

export class AsrClient {
  private ws: WebSocket | null = null;
  private listeners: Map<AsrEventName, Set<Listener>> = new Map();

  on(event: AsrEventName, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: AsrEventName, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: AsrEventName, data?: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  async open(): Promise<void> {
    const url = buildAsrUrl(sessionContext);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => { this.emit('open'); resolve(); };
      ws.onmessage = (e) => this.handleMessage(e);
      ws.onclose = () => { this.emit('close'); };
      ws.onerror = (e) => {
        this.emit('error', { code: 'ws', message: 'WebSocket error' });
        reject(e);
      };
    });
  }

  sendPcm(pcm: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(pcm);
    }
  }

  /** 通知 proxy 录音结束,等上游 final 后再 close。比直接 close 多一个 round trip,
   *  但避免上游 ASR session 被立刻撕掉、final 永远收不到。 */
  finish(): void {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      try { this.ws.send(JSON.stringify({ type: 'finish' })); } catch {}
    }
  }

  close(): void {
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }

  private handleMessage(e: MessageEvent): void {
    if (typeof e.data !== 'string') return;
    let msg: AsrServerMsg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'partial') this.emit('partial', msg.text);
    else if (msg.type === 'final') this.emit('final', msg.text);
    else if (msg.type === 'error') this.emit('error', { code: msg.code, message: msg.message });
  }
}

function buildAsrUrl(context: AsrClientSessionContext): string {
  const base =
    (typeof window !== 'undefined'
      ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
      : '') + '/api/voice/asr';
  const params = new URLSearchParams();
  if (context.courseId) params.set('courseId', context.courseId);
  if (context.cardId) params.set('cardId', context.cardId);
  if (context.targetWords && context.targetWords.length > 0) {
    params.set('targetWords', context.targetWords.join(','));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

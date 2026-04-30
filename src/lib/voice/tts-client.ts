type TtsEventName =
  | 'open'
  | 'close'
  | 'error'
  | 'connection-started'
  | 'session-started'
  | 'session-finished'
  | 'subtitle'
  | 'sentence-end'
  | 'pcm';
type Listener<T = any> = (data: T) => void;

export class TtsClient {
  private ws: WebSocket | null = null;
  private listeners: Map<TtsEventName, Set<Listener>> = new Map();
  private currentSessionId: string | null = null;

  on(event: TtsEventName, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: TtsEventName, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: TtsEventName, data?: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  async open(): Promise<void> {
    const url =
      (typeof window !== 'undefined'
        ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
        : '') + '/api/voice/tts';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let opened = false;
      ws.onopen = () => { this.emit('open'); opened = true; resolve(); };
      ws.onmessage = (e) => this.handleMessage(e);
      ws.onclose = () => { this.emit('close'); };
      ws.onerror = (e) => {
        this.emit('error', { code: 'ws', message: 'WebSocket error' });
        if (!opened) reject(e);
      };
    });
  }

  startSession(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.send({ type: 'session-start', sessionId });
  }

  sendText(text: string): void {
    if (!this.currentSessionId) return;
    this.send({ type: 'text-chunk', text });
  }

  finishSession(): void {
    if (!this.currentSessionId) return;
    this.send({ type: 'session-finish' });
    this.currentSessionId = null;
  }

  cancelSession(): void {
    if (!this.currentSessionId) return;
    this.send({ type: 'session-cancel' });
    this.currentSessionId = null;
  }

  close(): void {
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }

  private send(obj: object): void {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private handleMessage(e: MessageEvent): void {
    if (e.data instanceof ArrayBuffer) {
      this.emit('pcm', e.data);
      return;
    }
    if (typeof e.data !== 'string') return;
    let msg: any;
    try { msg = JSON.parse(e.data); } catch { return; }
    switch (msg.type) {
      case 'connection-started': this.emit('connection-started'); break;
      case 'session-started':    this.emit('session-started', msg.sessionId); break;
      case 'session-finished':   this.emit('session-finished'); break;
      case 'subtitle':           this.emit('subtitle', msg.text); break;
      case 'sentence-end':       this.emit('sentence-end'); break;
      case 'error':              this.emit('error', { code: msg.code, message: msg.message }); break;
    }
  }
}

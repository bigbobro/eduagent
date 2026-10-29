import { WebSocket } from 'ws';

/** Settings connection test only: proves a real Realtime session can be created and configured, without generating a response. */
export class RealtimeConnection {
  private socket: WebSocket;
  private queue: Array<{ type: string; error?: { code?: string } }> = [];
  private wake: (() => void) | null = null;
  private failure: Error | null = null;
  private readonly onAbort = () => this.close();

  constructor(apiKey: string, model: string, private lifetime: AbortSignal, url?: string) {
    lifetime.throwIfAborted();
    this.socket = new WebSocket(url ?? `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, handshakeTimeout: 10000, maxPayload: 4 * 1024 * 1024,
    });
    lifetime.addEventListener('abort', this.onAbort, { once: true });
    this.socket.on('message', (data) => {
      try {
        const event: unknown = JSON.parse(data.toString());
        if (!event || typeof event !== 'object' || !('type' in event) || typeof event.type !== 'string') throw new Error('PROVIDER_PROTOCOL');
        if (this.queue.length >= 4096) throw new Error('PROVIDER_EVENT_LIMIT');
        this.queue.push(event as { type: string }); this.wake?.();
      } catch { this.fail(new Error('PROVIDER_PROTOCOL')); }
    });
    this.socket.on('unexpected-response', (_request, response) => {
      const code = response.statusCode === 401 || response.statusCode === 403 ? 'REALTIME_AUTH_FAILED' : response.statusCode === 404 ? 'REALTIME_MODEL_UNAVAILABLE' : response.statusCode === 429 ? 'REALTIME_RATE_LIMITED' : 'PROVIDER_CONNECTION';
      response.resume(); this.fail(new Error(code));
    });
    this.socket.on('error', () => this.fail(new Error('PROVIDER_CONNECTION')));
    this.socket.on('close', () => this.fail(new Error('PROVIDER_DISCONNECTED')));
  }
  close(): void {
    this.lifetime.removeEventListener('abort', this.onAbort);
    this.failure ??= new Error('PROVIDER_CLOSED');
    this.wake?.();
    if (this.socket.readyState === WebSocket.CONNECTING) this.socket.terminate();
    else if (this.socket.readyState !== WebSocket.CLOSED) this.socket.close();
  }
  private fail(error: Error): void { this.failure ??= error; this.close(); }
  private async until(type: string, signal: AbortSignal): Promise<void> {
    for (;;) {
      signal.throwIfAborted(); this.lifetime.throwIfAborted();
      if (this.failure) throw this.failure;
      if (!this.queue.length) await new Promise<void>((resolve, reject) => {
        const cancel = () => { this.wake = null; reject(new Error('PROVIDER_TIMEOUT_OR_CANCELLED')); };
        this.wake = () => { signal.removeEventListener('abort', cancel); this.wake = null; resolve(); };
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      });
      if (this.failure) throw this.failure;
      const event = this.queue.shift();
      if (event?.type === 'error') throw new Error(`PROVIDER_${(event.error?.code && /^[a-z0-9_]{1,80}$/i.test(event.error.code) ? event.error.code : 'unknown').toUpperCase()}`);
      if (event?.type === type) return;
    }
  }
  async probe(signal: AbortSignal): Promise<void> {
    await this.until('session.created', signal);
    if (this.socket.readyState !== WebSocket.OPEN) throw this.failure ?? new Error('PROVIDER_CONNECTION');
    this.socket.send(JSON.stringify({ type: 'session.update', session: { type: 'realtime', audio: { input: { turn_detection: null } } } }));
    await this.until('session.updated', signal);
  }
}

import { WebSocket } from 'ws';
import { z } from 'zod';
import { realtimeAssessmentSchema, realtimeUsageSchema, type RealtimeUsage } from '@/lib/realtime-protocol';

interface ProviderEvent {
  type: string; response_id?: string; item_id?: string; delta?: string;
  error?: { code?: string };
  response?: { id: string; status: string; metadata?: { turnId?: string }; usage?: unknown;
    status_details?: { reason?: string; error?: { code?: string } };
    output?: Array<{ type: string; name?: string; call_id?: string; arguments?: string }> };
}
export interface ProviderTurn {
  turnId: string; targetId?: string; instructions: string; pcm?: Buffer;
  signal: AbortSignal;
  assess?: (argumentsValue: unknown) => unknown;
  audio: (pcm: Buffer) => void;
  transcript: (text: string) => void;
  started?: () => void;
  usage: (usage: RealtimeUsage | null) => void;
}
export interface RealtimeProvider {
  turn(options: ProviderTurn): Promise<void>;
  close(): void;
}
function safeCode(code: string | undefined): string { return code && /^[a-z0-9_]{1,80}$/i.test(code) ? code : 'unknown'; }

/** One official server-side socket per classroom. Turns are serialized by its owner. */
export class RealtimeConnection implements RealtimeProvider {
  private socket: WebSocket;
  private queue: ProviderEvent[] = [];
  private wake: (() => void) | null = null;
  private failure: Error | null = null;
  private ready = false;
  private responses = 0;
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
        this.queue.push(event as ProviderEvent); this.wake?.();
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
  private send(event: object): void {
    this.lifetime.throwIfAborted();
    if (this.failure || this.socket.readyState !== WebSocket.OPEN) throw this.failure ?? new Error('PROVIDER_CONNECTION');
    this.socket.send(JSON.stringify(event));
  }
  private async next(signal: AbortSignal): Promise<ProviderEvent> {
    signal.throwIfAborted(); this.lifetime.throwIfAborted();
    if (this.failure) throw this.failure;
    if (!this.queue.length) await new Promise<void>((resolve, reject) => {
      const cancel = () => { this.wake = null; reject(new Error('PROVIDER_TIMEOUT_OR_CANCELLED')); };
      this.wake = () => { signal.removeEventListener('abort', cancel); this.wake = null; resolve(); };
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    signal.throwIfAborted();
    if (this.failure) throw this.failure;
    const event = this.queue.shift();
    if (!event) throw new Error('PROVIDER_PROTOCOL');
    if (event.type === 'error') throw new Error(`PROVIDER_${safeCode(event.error?.code).toUpperCase()}`);
    return event;
  }
  private async until(type: string, signal: AbortSignal): Promise<ProviderEvent> {
    for (;;) { const event = await this.next(signal); if (event.type === type) return event; }
  }
  async probe(signal: AbortSignal): Promise<void> {
    await this.until('session.created', signal); this.ready = true;
    this.send({ type: 'session.update', session: { type: 'realtime', audio: { input: { turn_detection: null } } } });
    await this.until('session.updated', signal);
  }
  async turn(options: ProviderTurn): Promise<void> {
    const signal = AbortSignal.any([options.signal, this.lifetime, AbortSignal.timeout(45000)]);
    const cancel = () => this.close();
    signal.addEventListener('abort', cancel, { once: true });
    let awaitingUsage = false;
    try {
      if (!this.ready) { await this.until('session.created', signal); this.ready = true; }
      if (this.responses >= 500) throw new Error('PROVIDER_SESSION_LIMIT');
      this.send({ type: 'session.update', session: { type: 'realtime', instructions: options.instructions,
        audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: null }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'marin' } },
        max_output_tokens: 1200,
        tools: options.assess ? [{ type: 'function', name: 'record_assessment', description: 'Submit the assessment and proposed teaching operations. The application returns actual persisted state.', parameters: z.toJSONSchema(realtimeAssessmentSchema) }] : [],
      } });
      await this.until('session.updated', signal);
      if (options.pcm) {
        if (options.pcm.length < 4800 || options.pcm.length > 1_440_000 || options.pcm.length % 2) throw new Error('INVALID_PCM');
        for (let i = 0; i < options.pcm.length; i += 24000) this.send({ type: 'input_audio_buffer.append', audio: options.pcm.subarray(i, i + 24000).toString('base64') });
        this.send({ type: 'input_audio_buffer.commit' });
        await this.until('input_audio_buffer.committed', signal);
      }
      const request = (assessment: boolean) => {
        options.started?.();
        this.responses++; awaitingUsage = true;
        this.send({ type: 'response.create', response: { metadata: { turnId: options.turnId },
          output_modalities: assessment ? ['text'] : ['audio'],
          tool_choice: assessment ? { type: 'function', name: 'record_assessment' } : 'none',
        } });
      };
      let assessing = Boolean(options.assess);
      request(assessing);
      const completed = new Set<string>(); const calls = new Map<string, unknown>();
      let audioBytes = 0;
      let activeResponseId: string | undefined;
      for (;;) {
        const event = await this.next(signal);
        if (event.type === 'response.created') {
          if (event.response?.metadata?.turnId !== options.turnId) throw new Error('PROVIDER_TURN_MISMATCH');
          activeResponseId = event.response.id;
        }
        if (event.type === 'response.output_audio.delta' || event.type === 'response.output_audio_transcript.delta') {
          if (!activeResponseId || event.response_id !== activeResponseId) throw new Error('PROVIDER_TURN_MISMATCH');
        }
        if (event.type === 'response.output_audio.delta') {
          if (assessing) throw new Error('PROVIDER_PREMATURE_AUDIO');
          const audio = Buffer.from(event.delta ?? '', 'base64'); audioBytes += audio.length;
          if (audioBytes > 2_880_000 || audio.length % 2) throw new Error('PROVIDER_AUDIO_LIMIT');
          options.audio(audio);
        }
        if (event.type === 'response.output_audio_transcript.delta') options.transcript(event.delta ?? '');
        if (event.type !== 'response.done') continue;
        const response = event.response;
        if (!response || response.metadata?.turnId !== options.turnId) throw new Error('PROVIDER_TURN_MISMATCH');
        if (completed.has(response.id)) continue;
        completed.add(response.id); awaitingUsage = false;
        const usage = realtimeUsageSchema.safeParse(response.usage);
        options.usage(usage.success ? usage.data : null);
        if (response.status !== 'completed') throw new Error(`PROVIDER_RESPONSE_${safeCode(response.status).toUpperCase()}_${safeCode(response.status_details?.reason ?? response.status_details?.error?.code).toUpperCase()}`);
        const tools = (response.output ?? []).filter((item) => item.type === 'function_call');
        if (!assessing) {
          if (tools.length) throw new Error('PROVIDER_UNEXPECTED_TOOL');
          if (!audioBytes) throw new Error('PROVIDER_MISSING_AUDIO');
          return;
        }
        if (!tools.length) throw new Error('PROVIDER_MISSING_ASSESSMENT');
        for (const tool of tools) {
          if (tool.name !== 'record_assessment' || !tool.call_id) throw new Error('PROVIDER_INVALID_TOOL');
          if (!calls.has(tool.call_id)) {
            let args: unknown; try { args = JSON.parse(tool.arguments ?? ''); } catch { throw new Error('PROVIDER_INVALID_ARGUMENTS'); }
            calls.set(tool.call_id, options.assess!(args));
          }
          this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: tool.call_id, output: JSON.stringify(calls.get(tool.call_id)) } });
        }
        assessing = false; request(false);
      }
    } catch (error) {
      if (awaitingUsage) options.usage(null);
      this.close();
      throw error;
    } finally { signal.removeEventListener('abort', cancel); }
  }
}

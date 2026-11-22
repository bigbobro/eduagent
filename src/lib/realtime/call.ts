// Smoke gate test: comment-only change, do not merge.
import { WebSocket } from 'ws';
import { createLogger } from '@/lib/logger';
import type { ProviderMessage } from './conversation';

const log = createLogger('realtime-call');
export interface RealtimeCall {
  /** Sideband command; queued until the sideband socket is open. */
  send(event: object): void;
  /** Ends media and sideband. Idempotent. */
  close(): void;
}
export interface CallOptions {
  sdp: string | null;
  session: object;
  signal: AbortSignal;
  onEvent(event: ProviderMessage): void;
  /** Provider ended or broke the call without a local close. */
  onClose(code: string): void;
}
export type CallFactory = (options: CallOptions) => Promise<{ answer: string | null; call: RealtimeCall }>;

function statusCode(status: number): string {
  return status === 401 || status === 403 ? 'REALTIME_AUTH_FAILED' : status === 404 ? 'REALTIME_MODEL_UNAVAILABLE' : status === 429 ? 'REALTIME_RATE_LIMITED' : 'PROVIDER_CONNECTION';
}

/**
 * Official unified WebRTC interface: the browser's SDP offer is combined with the session on the server, so the
 * long-lived key never reaches the browser. Tools and state run on a server sideband socket for the same call.
 */
export function openAiCallFactory(apiKey: string, base = 'https://api.openai.com', socketBase = 'wss://api.openai.com'): CallFactory {
  return async ({ sdp, session, signal, onEvent, onClose }) => {
    if (!sdp) throw new Error('INVALID_SDP');
    const form = new FormData();
    form.set('sdp', sdp); form.set('session', JSON.stringify(session));
    const response = await fetch(`${base}/v1/realtime/calls`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) {
      if (response.status === 429) {
        const problem = await response.json().catch(() => null);
        if (problem?.error?.code === 'insufficient_quota' || problem?.error?.type === 'insufficient_quota') throw new Error('REALTIME_INSUFFICIENT_QUOTA');
      } else await response.body?.cancel().catch(() => {});
      throw new Error(statusCode(response.status));
    }
    const callId = response.headers.get('location')?.split('/').pop() ?? '';
    const answer = await response.text();
    if (!/^rtc_[A-Za-z0-9_-]{1,200}$/.test(callId) || !answer || answer.length > 64_000) throw new Error('PROVIDER_PROTOCOL');
    let closed = false; const pending: string[] = [];
    const hangup = () => {
      // Closing the sideband does not end WebRTC media; the documented hangup does. The browser closing its
      // peer also ends the call, so this is the server-side guarantee when the page cannot.
      void fetch(`${base}/v1/realtime/calls/${callId}/hangup`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) })
        .then((result) => { log.info(result.status === 404 ? 'hangup: call already ended' : 'hangup', { status: result.status }); return result.body?.cancel(); })
        .catch((error: unknown) => log.warn('hangup failed', { error: error instanceof Error ? `${error.name}:${String((error as { cause?: { code?: string } }).cause?.code ?? '')}` : 'unknown' }));
    };
    const socket = new WebSocket(`${socketBase}/v1/realtime?call_id=${callId}`, { headers: { Authorization: `Bearer ${apiKey}` }, handshakeTimeout: 10_000, maxPayload: 4 * 1024 * 1024 });
    const call: RealtimeCall = {
      send(event) {
        if (closed) return;
        const data = JSON.stringify(event);
        if (socket.readyState === WebSocket.OPEN) socket.send(data); else if (pending.length < 256) pending.push(data);
      },
      close() {
        if (closed) return;
        closed = true; signal.removeEventListener('abort', abort);
        if (socket.readyState === WebSocket.CONNECTING) socket.terminate(); else socket.close();
        hangup();
      },
    };
    const abort = () => call.close();
    signal.addEventListener('abort', abort, { once: true });
    const fail = (code: string) => { if (closed) return; call.close(); onClose(code); };
    socket.on('open', () => { for (const data of pending.splice(0)) socket.send(data); log.info('sideband open', {}); });
    socket.on('message', (data) => {
      let event: ProviderMessage;
      try { event = JSON.parse(data.toString()); } catch { fail('PROVIDER_PROTOCOL'); return; }
      if (!event || typeof event.type !== 'string') { fail('PROVIDER_PROTOCOL'); return; }
      try { onEvent(event); } catch (error) { log.warn('event handler failed', { type: event.type, error: error instanceof Error ? error.message.slice(0, 100) : 'unknown' }); }
    });
    socket.on('unexpected-response', (_request, res) => { res.resume(); log.warn('sideband rejected', { status: res.statusCode ?? 0 }); fail(statusCode(res.statusCode ?? 0)); });
    socket.on('error', (error: unknown) => { log.warn('sideband error', { code: String((error as { code?: unknown })?.code ?? (error instanceof Error ? error.name : 'unknown')).slice(0, 60) }); fail('PROVIDER_CONNECTION'); });
    socket.on('close', () => fail('PROVIDER_DISCONNECTED'));
    if (signal.aborted) call.close();
    return { answer, call };
  };
}

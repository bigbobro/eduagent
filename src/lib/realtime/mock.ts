import type { Session } from '@/lib/agent/session-store';
import type { MockUtterance } from '@/lib/realtime-protocol';
import type { CallOptions, RealtimeCall } from './call';
import type { ProviderMessage } from './conversation';

const usage = { input_tokens: 0, output_tokens: 0, input_token_details: { text_tokens: 0, audio_tokens: 0, cached_tokens: 0 }, output_token_details: { text_tokens: 0, audio_tokens: 0 } };

/**
 * Deterministic offline provider for wiring and browser smoke only. It is not a speech recognizer and its
 * fixed "correct" decisions are not model-quality evidence. Event shapes follow the real sideband.
 */
export class MockRealtimeCall implements RealtimeCall {
  private closed = false;
  private responses = 0; private items = 0;
  private active: { id: string; metadata: Record<string, string> | null; timers: ReturnType<typeof setTimeout>[] } | null = null;
  private playing: string | null = null;
  private chain = Promise.resolve();
  private interruptResponse: boolean;
  /** What the model would have decided for an input the provider skipped; used by the app's reply to that input. */
  private skipped: ReturnType<MockRealtimeCall['decide']>;
  constructor(private session: Session, private options: Pick<CallOptions, 'onEvent'> & { session?: object }, private step = 40) {
    // Same switch as the real provider: with interrupt_response false, speech neither cancels the response nor clears audio.
    const detection = (options.session as { audio?: { input?: { turn_detection?: { interrupt_response?: boolean } } } } | undefined)?.audio?.input?.turn_detection;
    this.interruptResponse = detection?.interrupt_response !== false;
  }
  send(event: { type?: string; response?: { metadata?: Record<string, string> } }): void {
    if (this.closed) return;
    if (event.type === 'response.create') {
      const metadata = event.response?.metadata ?? null;
      const decision = metadata?.kind === 'reply' ? this.skipped : undefined;
      if (metadata?.kind === 'reply') this.skipped = undefined;
      this.respond(metadata, decision);
    }
    if (event.type === 'response.cancel') {
      if (this.active) this.cancel();
      else this.emit({ type: 'error', error: { code: 'response_cancel_not_active' } });
    }
    // Sent by the browser over WebRTC in the real system (the server calls this on its behalf offline).
    if (event.type === 'output_audio_buffer.clear' && this.playing) { this.emit({ type: 'output_audio_buffer.cleared', response_id: this.playing }); this.playing = null; }
  }
  close(): void { this.closed = true; if (this.active) this.active.timers.forEach(clearTimeout); this.active = null; }
  /** The test "child" speaks. Interrupts like server VAD only when the session has interrupt_response on. */
  speak(utterance: MockUtterance): void {
    this.queue(async () => {
      const item = `mock_item_${++this.items}`;
      this.emit({ type: 'input_audio_buffer.speech_started', item_id: item });
      if (this.interruptResponse) {
        if (this.active) this.cancel();
        if (this.playing) { this.emit({ type: 'output_audio_buffer.cleared', response_id: this.playing }); this.playing = null; }
      }
      await this.wait();
      this.emit({ type: 'input_audio_buffer.speech_stopped', item_id: item });
      this.emit({ type: 'input_audio_buffer.committed', item_id: item });
      // Without auto-interrupt, a response already running makes the provider skip the auto response silently.
      if (this.interruptResponse || !this.active) this.respond(null, this.decide(utterance)); else this.skipped = this.decide(utterance);
    });
  }
  private decide(utterance: MockUtterance): { name: string; arguments: string } | undefined {
    const memory = this.session.memory;
    if (utterance.kind === 'chat') return undefined;
    if (utterance.kind === 'request') return { name: 'show_card', arguments: JSON.stringify({ card_id: utterance.cardId }) };
    if (this.session.currentPhase === 'interactive') {
      const next = this.session.course.cards.find((card) => card.kind === 'word' && card.id !== memory.currentCardId && !memory.clearedCardIds.includes(card.id));
      return { name: 'record_assessment', arguments: JSON.stringify({ target_id: memory.currentCardId, result: 'correct', heard: '[offline mock input]', evidence: 'offline fixture, not model judgment',
        mastered: true, next_action: 'advance', next_card_id: next?.id ?? null, next_phase: next ? null : 'reinforcement' }) };
    }
    const quiz = this.session.course.phases.reinforcement.quizzes.find((q) => q.type === 'repeat-after-me' && !memory.passedQuizIds.includes(q.id));
    return quiz ? { name: 'record_assessment', arguments: JSON.stringify({ target_id: quiz.id, result: 'correct', heard: '[offline mock input]', evidence: 'offline fixture, not model judgment',
      mastered: false, next_action: 'advance', next_card_id: null, next_phase: null }) } : undefined;
  }
  private respond(metadata: Record<string, string> | null, call?: { name: string; arguments: string }): void {
    if (this.active) { setTimeout(() => this.emit({ type: 'error', error: { code: 'conversation_already_has_active_response', event_id: metadata?.request } }), 0); return; }
    const id = `mock_resp_${++this.responses}`;
    const active = { id, metadata, timers: [] as ReturnType<typeof setTimeout>[] };
    this.active = active;
    const later = (ms: number, fn: () => void) => active.timers.push(setTimeout(() => { if (!this.closed) fn(); }, ms));
    later(0, () => this.emit({ type: 'response.created', response: { id, status: 'in_progress', metadata } }));
    if (call) {
      later(this.step, () => {
        this.active = null;
        this.emit({ type: 'response.done', response: { id, status: 'completed', metadata, usage, output: [{ type: 'function_call', name: call.name, call_id: `mock_call_${id}`, arguments: call.arguments }] } });
      });
      return;
    }
    later(this.step, () => {
      this.playing = id;
      this.emit({ type: 'output_audio_buffer.started', response_id: id });
      this.emit({ type: 'response.output_audio_transcript.delta', response_id: id, delta: '离线测试示范。' });
    });
    later(this.step * 2, () => { this.active = null; this.emit({ type: 'response.done', response: { id, status: 'completed', metadata, usage, output: [{ type: 'message' }] } }); });
    later(this.step * 4, () => { if (this.playing === id) { this.playing = null; this.emit({ type: 'output_audio_buffer.stopped', response_id: id }); } });
  }
  private cancel(): void {
    const active = this.active!; active.timers.forEach(clearTimeout); this.active = null;
    if (this.playing === active.id) { this.emit({ type: 'output_audio_buffer.cleared', response_id: active.id }); this.playing = null; }
    this.emit({ type: 'response.done', response: { id: active.id, status: 'cancelled', metadata: active.metadata, usage, output: [] } });
  }
  private emit(event: ProviderMessage): void { if (!this.closed) this.options.onEvent(event); }
  private wait(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, this.step)); }
  private queue(work: () => Promise<void>): void { this.chain = this.chain.then(work).catch(() => {}); }
}

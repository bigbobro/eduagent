import type { Session } from '@/lib/agent/session-store';
import type { ProviderTurn, RealtimeProvider } from './connection';

/** Deterministic offline wiring only. This is not a speech recognizer or model-quality evidence. */
export class MockRealtimeProvider implements RealtimeProvider {
  private closed = false;
  constructor(private session: Session) {}
  close(): void { this.closed = true; }
  async turn(turn: ProviderTurn): Promise<void> {
    if (this.closed) throw new Error('PROVIDER_CLOSED');
    turn.signal.throwIfAborted();
    turn.started?.();
    if (turn.assess) {
      const next = this.session.course.cards.find((card) => card.kind === 'word'
        && card.id !== turn.targetId && !this.session.memory.clearedCardIds.includes(card.id));
      turn.assess({ target_id: turn.targetId, result: 'correct', heard: '[offline mock input]', evidence: 'offline fixture, not model judgment',
        mastered: true, next_action: 'advance', next_card_id: this.session.currentPhase === 'interactive' ? next?.id ?? null : null,
        next_phase: this.session.currentPhase === 'interactive' && !next ? 'reinforcement' : null });
    }
    turn.transcript('离线测试示范。');
    turn.audio(Buffer.alloc(4800));
    turn.usage({ input_tokens: 0, output_tokens: 0, input_token_details: { text_tokens: 0, audio_tokens: 0, cached_tokens: 0 }, output_token_details: { text_tokens: 0, audio_tokens: 0 } });
  }
}

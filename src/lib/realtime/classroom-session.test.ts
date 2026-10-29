import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sessionStore } from '@/lib/agent/session-store';
import { RealtimeClassroomSession, registerClassroom, realtimeClassrooms } from './classroom-session';
import type { ProviderTurn, RealtimeProvider } from './connection';
import { changePhase } from './teaching';
const active: RealtimeClassroomSession[] = [];
afterEach(() => active.splice(0).forEach((c) => { c.session.lifetime.abort(); sessionStore.delete(c.session.id); }));
const pcm = Buffer.alloc(4800, 1).toString('base64');
function setup(run: (turn: ProviderTurn) => Promise<void>) {
  const factory = vi.fn((): RealtimeProvider => ({ turn: vi.fn(run), close: vi.fn() }));
  const classroom = new RealtimeClassroomSession('food', 'test-learner', true, factory); active.push(classroom);
  changePhase(classroom.session, 'interactive');
  return { classroom, factory };
}
describe('classroom input ownership and retry boundary', () => {
  it('retries failed feedback without reassessing or awarding a committed input again', async () => {
    let first = true;
    const { classroom, factory } = setup(async (turn) => {
      if (turn.assess) turn.assess({ target_id: 'apple', result: 'correct', heard: 'apple', evidence: 'clear', mastered: true, next_action: 'advance', next_card_id: 'milk', next_phase: null });
      if (first) { first = false; throw new Error('PROVIDER_DISCONNECTED'); }
      expect(turn.assess).toBeUndefined(); expect(turn.pcm).toBeUndefined();
      turn.audio(Buffer.alloc(4800));
    });
    const intent = { kind: 'audio' as const, targetId: 'apple', pcm }; const turnId = randomUUID();
    await expect(classroom.turn(turnId, intent, () => {}, new AbortController().signal)).rejects.toThrow();
    await classroom.turn(turnId, intent, () => {}, new AbortController().signal);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(classroom.session.memory.wordPerformance.get('apple')?.attempts).toBe(1);
  });
  it('never connects or assesses a digital-zero recording', async () => {
    const { classroom, factory } = setup(async () => {});
    await classroom.turn(randomUUID(), { kind: 'audio', targetId: 'apple', pcm: Buffer.alloc(4800).toString('base64') }, () => {}, new AbortController().signal);
    expect(factory).not.toHaveBeenCalled(); expect(classroom.session.lessonInteractionCount).toBe(0);
  });
  it('serializes concurrent turns and prevents turn-id reuse with different audio', async () => {
    let release!: () => void;
    const { classroom } = setup(() => new Promise<void>((resolve) => { release = resolve; }));
    const turnId = randomUUID(); const signal = new AbortController().signal;
    const pending = classroom.turn(turnId, { kind: 'repeat', cardId: 'apple' }, () => {}, signal);
    await expect(classroom.turn(randomUUID(), { kind: 'repeat', cardId: 'milk' }, () => {}, signal)).rejects.toThrow('TURN_BUSY');
    release(); await pending;
    await expect(classroom.turn(turnId, { kind: 'repeat', cardId: 'milk' }, () => {}, signal)).rejects.toThrow('TURN_REUSED');
  });
  it('rejects speech for a quiz that has not actually been presented', async () => {
    const { classroom, factory } = setup(async () => {});
    changePhase(classroom.session, 'reinforcement');
    await expect(classroom.turn(randomUUID(), { kind: 'audio', targetId: 'q5', pcm }, () => {}, new AbortController().signal)).rejects.toThrow('INVALID_INPUT_ASSOCIATION');
    expect(factory).not.toHaveBeenCalled();
  });
});

it('expires both global registries when a cancelled stream has no subsequent end request', () => {
  const { classroom } = setup(async () => {}); registerClassroom(classroom);
  classroom.expire();
  expect(classroom.session.lifetime.signal.aborted).toBe(true);
  expect(realtimeClassrooms.has(classroom.session.id)).toBe(false);
  expect(sessionStore.get(classroom.session.id)).toBeUndefined();
});

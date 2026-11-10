import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/lib/agent/session-store';
import { resetConfig } from '@/lib/config';
import type { RealtimeEvent } from '@/lib/realtime-protocol';
import { RealtimeClassroomSession, registerClassroom, realtimeClassrooms } from './classroom-session';
import type { CallOptions } from './call';
import { summarizeRealtimeUsage } from './usage';
const active: RealtimeClassroomSession[] = [];
afterEach(() => { active.splice(0).forEach((c) => { c.session.lifetime.abort(); sessionStore.delete(c.session.id); }); vi.unstubAllEnvs(); resetConfig(); });
function setup() {
  const provider = { options: null as CallOptions | null, sent: [] as Array<Record<string, any>>, close: vi.fn() };
  const classroom = new RealtimeClassroomSession('food', 'test-learner', true, async (options) => {
    provider.options = options;
    return { answer: 'v=0 answer', call: { send: (event) => provider.sent.push(event as Record<string, any>), close: provider.close } };
  });
  active.push(classroom); registerClassroom(classroom);
  const events: RealtimeEvent[] = [];
  return { classroom, provider, events, connect: () => classroom.connect('v=0 offer', (event) => events.push(event)) };
}

describe('Realtime classroom call ownership', () => {
  it('connects once, moves past the intro and asks the model to open the lesson', async () => {
    const { provider, events, connect } = setup();
    expect(await connect()).toBe('v=0 answer');
    expect(provider.options?.session).toMatchObject({ audio: { input: { turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true } } } });
    expect((provider.options?.session as { audio: { input: object } }).audio.input).not.toHaveProperty('transcription');
    expect(provider.options?.session).toMatchObject({ truncation: { type: 'retention_ratio', retention_ratio: 0.8 } });
    // Opening state follows the fixed (cacheable) instructions as an [app] message, before the opening request.
    const items = provider.sent.filter((e) => e.type === 'conversation.item.create' || e.type === 'response.create');
    expect(items[0]?.item?.content?.[0]?.text).toContain('phase interactive');
    expect((provider.options?.session as { instructions: string }).instructions).not.toContain('phase interactive');
    expect(events[0]).toMatchObject({ type: 'receipt', receipt: { progress: { currentPhase: 'interactive' } } });
    expect(provider.sent.find((e) => e.type === 'response.create')?.response.metadata.kind).toBe('opening');
    await expect(connect()).rejects.toThrow('CALL_EXISTS');
  });
  it('forwards only conversation state events to the browser', async () => {
    const { provider, events, connect } = setup(); await connect(); events.length = 0;
    provider.options!.onEvent({ type: 'input_audio_buffer.speech_started', item_id: 'i1' });
    provider.options!.onEvent({ type: 'rate_limits.updated' });
    provider.options!.onEvent({ type: 'response.function_call_arguments.delta', delta: '{"secret' });
    expect(events).toEqual([{ type: 'provider', event: { type: 'input_audio_buffer.speech_started', item_id: 'i1' } }]);
  });
  it('reports a provider loss, marks usage incomplete and expires both registries', async () => {
    const { classroom, provider, events, connect } = setup(); await connect();
    provider.options!.onEvent({ type: 'response.created', response: { id: 'r1' } });
    provider.options!.onClose('PROVIDER_DISCONNECTED');
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'PROVIDER_DISCONNECTED' });
    expect(summarizeRealtimeUsage(classroom.session.tokenUsage.realtime).complete).toBe(false);
    expect(provider.close).toHaveBeenCalled();
    expect(realtimeClassrooms.has(classroom.session.id)).toBe(false); expect(sessionStore.get(classroom.session.id)).toBeUndefined();
    expect(() => classroom.presented({ kind: 'card', id: 'apple' })).toThrow('SESSION_EXPIRED');
  });
  it('ignores late provider events after the classroom ended', async () => {
    const { classroom, provider, events, connect } = setup(); await connect();
    classroom.expire(); events.length = 0;
    provider.options!.onEvent({ type: 'response.done', response: { id: 'late', status: 'completed', output: [{ type: 'function_call', name: 'show_card', call_id: 'c', arguments: '{"card_id":"milk"}' }] } });
    expect(events).toEqual([]); expect(classroom.session.memory.currentCardId).toBe('apple');
  });
});

it('starts a word-battle call with the game rules and a seeded collection', async () => {
  const provider = { options: null as CallOptions | null };
  const classroom = new RealtimeClassroomSession('food', 'test-learner', true, async (options) => {
    provider.options = options; return { answer: 'v=0 answer', call: { send: () => {}, close: () => {} } };
  }, true);
  active.push(classroom); registerClassroom(classroom);
  expect(Array.isArray(classroom.session.collectedCardIds)).toBe(true);
  await classroom.connect('v=0 offer', () => {});
  expect((provider.options?.session as { instructions: string }).instructions).toContain('WORD BATTLE');
});
describe('sitting end push', () => {
  afterEach(() => { vi.useRealTimers(); delete (globalThis as { __eduagentTestSittingUsed?: boolean }).__eduagentTestSittingUsed; });
  it('tells the browser the sitting ended with the test timing, and only for the first call', async () => {
    vi.stubEnv('REALTIME_TEST_SITTING_MS', '40,80'); resetConfig();
    const first = setup(); await first.connect();
    await expect.poll(() => first.events.some((e) => e.type === 'sitting-ended'), { timeout: 2000 }).toBe(true);
    const second = setup(); await second.connect();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(second.events.some((e) => e.type === 'sitting-ended')).toBe(false);
  });
});

it('runs the controlled offline provider through the same conversation path', async () => {
  vi.stubEnv('VOICE_MOCK', 'true'); resetConfig();
  const classroom = new RealtimeClassroomSession('food', 'test-learner', true); active.push(classroom);
  expect(classroom.transport).toBe('mock');
  const events: RealtimeEvent[] = [];
  expect(await classroom.connect(null, (event) => events.push(event))).toBeNull();
  classroom.presented({ kind: 'card', id: 'apple' });
  await expect.poll(() => events.some((e) => e.type === 'provider' && e.event.type === 'output_audio_buffer.stopped'), { timeout: 3000 }).toBe(true);
  classroom.mockSpeech({ kind: 'attempt' });
  await expect.poll(() => classroom.session.memory.clearedCardIds, { timeout: 3000 }).toEqual(['apple']);
  expect(events.some((e) => e.type === 'receipt' && e.receipt.assessment?.target_id === 'apple')).toBe(true);
});

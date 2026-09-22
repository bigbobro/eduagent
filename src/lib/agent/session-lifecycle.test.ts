import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { POST } from '@/app/api/chat/route';
import { getDb } from '@/lib/db';
import * as llm from '@/lib/llm';
import { createSession, endSession, getSession, setSessionPhase, streamUserInput } from './session';

const post = (body: unknown) => POST({ json: async () => body } as any);
function snapshot(id: string) {
  const db = getDb();
  return {
    lesson: db.prepare('SELECT * FROM lesson_logs WHERE id = ?').get(id),
    interactions: db.prepare('SELECT * FROM interaction_logs WHERE lesson_id = ?').all(id),
    progress: db.prepare('SELECT * FROM course_progress WHERE course_id = ?').get(foodCourse.id),
  };
}
const reply = JSON.stringify({ speech: 'Hello!', actions: [], state_update: {} });
beforeEach(() => { vi.stubEnv('VOICE_MOCK', 'true'); vi.stubEnv('LLM_API_KEY', 'test-placeholder'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('session lifetime', () => {
  it.each(['start', 'message'])('aborts a delayed %s and never writes after end even if the provider ignores cancellation', async (action) => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let signal: AbortSignal | undefined;
    vi.spyOn(llm, 'streamLLM').mockImplementation(async function* (_prompt, _messages, inputSignal) {
      signal = inputSignal;
      await barrier;
      yield { done: false, delta: reply };
      yield { done: true, fullText: reply, usage: { inputTokens: 1, outputTokens: 1 }, latency: 1 };
    });
    const initial = action === 'message' ? createSession(foodCourse) : null;
    const res = await post(action === 'start' ? { action, courseId: foodCourse.id } : { action, sessionId: initial!.id, text: 'apple' });
    const id = initial?.id ?? res.headers.get('X-Session-Id')!;
    await vi.waitFor(() => expect(signal).toBeDefined());
    await post({ action: 'end', sessionId: id });
    expect(signal!.aborted).toBe(true);
    expect(getSession(id)).toBeUndefined();
    const ended = snapshot(id);
    release();
    expect(await res.text()).not.toContain('event: done');
    expect(snapshot(id)).toEqual(ended);
  });

  it.each(['intro', 'reinforcement'] as const)('does not commit a %s generator paused at yield when ended', async (phase) => {
    vi.spyOn(llm, 'streamLLM').mockImplementation(async function* () { yield { done: false, delta: reply }; });
    const session = createSession(foodCourse);
    setSessionPhase(session.id, phase);
    const stream = streamUserInput(session.id, 'apple');
    expect((await stream.next()).value?.type).toBe('speech-delta');
    expect((await stream.next()).value?.type).toBe('speech-end');
    expect((await stream.next()).value?.type).toBe('actions');
    endSession(session.id);
    const ended = snapshot(session.id);
    const rest = [];
    for await (const event of stream) rest.push(event);
    expect(rest).toEqual([]);
    expect(snapshot(session.id)).toEqual(ended);
  });

  it('cancels the provider on reader cancel without writing or closing the stream twice', async () => {
    let release!: () => void;
    let finished = false;
    let signal: AbortSignal | undefined;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(llm, 'streamLLM').mockImplementation(async function* (_prompt, _messages, inputSignal) {
      signal = inputSignal;
      try { await barrier; inputSignal?.throwIfAborted(); yield { done: false, delta: reply }; }
      finally { finished = true; }
    });
    const res = await post({ action: 'start', courseId: foodCourse.id });
    const id = res.headers.get('X-Session-Id')!;
    await vi.waitFor(() => expect(signal).toBeDefined());
    const before = snapshot(id);
    await res.body!.cancel();
    expect(signal!.aborted).toBe(true);
    release();
    await vi.waitFor(() => expect(finished).toBe(true));
    expect(snapshot(id)).toEqual(before);
    endSession(id);
  });

  it('preserves a completed turn when end follows its successful commit', async () => {
    vi.spyOn(llm, 'streamLLM').mockImplementation(async function* () { yield { done: false, delta: reply }; });
    const res = await post({ action: 'start', courseId: foodCourse.id });
    const id = res.headers.get('X-Session-Id')!;
    expect(await res.text()).toContain('event: done');
    const interactions = snapshot(id).interactions;
    expect(interactions).toHaveLength(1);
    endSession(id);
    expect(snapshot(id).interactions).toEqual(interactions);
  });
});

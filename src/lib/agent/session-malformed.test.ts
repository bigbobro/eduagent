/**
 * id-7: when the LLM output is unparseable AND no speech was recovered, streamUserInput must yield
 * a recoverable `error` event instead of silently completing a turn where the teacher says nothing.
 * Paired with the bug-3 finalize change: if speech WAS recovered (best-effort), the turn proceeds.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, endSession, streamUserInput } from './session';
import type { StreamEvent } from '@/lib/llm';

vi.mock('@/lib/llm', () => ({ streamLLM: vi.fn() }));
import { streamLLM } from '@/lib/llm';
const mockStreamLLM = vi.mocked(streamLLM);

async function* yieldRaw(text: string): AsyncGenerator<StreamEvent> {
  yield { delta: text, done: false } as StreamEvent;
  yield {
    done: true,
    fullText: text,
    usage: { inputTokens: 10, outputTokens: 5 },
    latency: 50,
  } as StreamEvent;
}

describe('id-7: malformed LLM output → recoverable error, not a silent turn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('yields an error event when output is unparseable and no speech was recovered', async () => {
    const session = createSession(foodCourse);
    mockStreamLLM.mockReturnValue(yieldRaw('totally not json — malformed garbage'));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, 'apple')) {
      events.push(ev);
    }

    expect(events).toContainEqual(expect.objectContaining({ type: 'error' }));
    // Must NOT emit a silent (speech-less) completed turn.
    expect(events.find((e) => e.type === 'done')).toBeUndefined();
    expect(events.find((e) => e.type === 'speech-end')).toBeUndefined();
    endSession(session.id);
  });

  it('still completes the turn when malformed but speech was recovered (best-effort)', async () => {
    const session = createSession(foodCourse);
    // speech streams fine, trailing JSON is broken → malformed=true but speech is present
    mockStreamLLM.mockReturnValue(yieldRaw('{"speech":"我们一起来玩吧","actions":[oops'));

    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, 'apple')) {
      events.push(ev);
    }

    expect(events.find((e) => e.type === 'error')).toBeUndefined();
    expect(events.find((e) => e.type === 'done')).toBeTruthy();
    expect(events.find((e) => e.type === 'speech-delta')).toBeTruthy();
    endSession(session.id);
  });
});

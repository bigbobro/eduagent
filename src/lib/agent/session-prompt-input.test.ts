import { beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import type { StreamEvent } from '@/lib/mimo/llm';

vi.mock('@/lib/db/queries', () => ({
  createLessonLog: vi.fn(),
  finishLessonLog: vi.fn(),
  touchLessonLog: vi.fn(),
  insertInteraction: vi.fn(),
  upsertWordPerformance: vi.fn(),
}));

vi.mock('@/lib/mimo/llm', () => ({
  streamLLM: vi.fn(),
}));

import { insertInteraction } from '@/lib/db/queries';
import { streamLLM } from '@/lib/mimo/llm';
import { createSession, endSession, streamUserInput } from './session';

const mockInsertInteraction = vi.mocked(insertInteraction);
const mockStreamLLM = vi.mocked(streamLLM);

async function* streamResponse(): AsyncGenerator<StreamEvent> {
  const json = JSON.stringify({
    speech: 'Good. Say apple again.',
    actions: [{ tool: 'show_card', params: { card_id: 'apple' } }],
    state_update: {
      current_word: 'apple',
      attempt_assessment: {
        card_id: 'apple',
        result: 'correct',
        should_advance: false,
        evidence: 'heard apple',
      },
    },
  });

  yield { delta: json, done: false } as StreamEvent;
  yield {
    done: true,
    fullText: json,
    usage: { inputTokens: 1000, outputTokens: 50 },
    latency: 25,
  } as StreamEvent;
}

describe('streamUserInput prompt input measurement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists inputBreakdown aligned with the actual LLM request', async () => {
    const session = createSession(foodCourse);
    mockStreamLLM.mockReturnValue(streamResponse());

    for await (const _event of streamUserInput(session.id, 'Apple.')) {
      // consume stream
    }

    const [systemPrompt, messages] = mockStreamLLM.mock.calls[0];
    const [, log] = mockInsertInteraction.mock.calls[0];
    const breakdown = log.modelCalls.llm.inputBreakdown;

    expect(breakdown).toBeDefined();
    expect(breakdown?.inputTokens).toBe(1000);
    expect(breakdown?.systemChars).toBe(systemPrompt.length);
    expect(breakdown?.messageChars).toBe(messages.reduce((sum, message) => sum + message.content.length, 0));
    expect(breakdown?.totalChars).toBe((breakdown?.systemChars || 0) + (breakdown?.messageChars || 0));
    expect(breakdown?.buckets.find((bucket) => bucket.key === 'history')?.chars).toBe('Apple.'.length);
    expect(breakdown?.buckets.some((bucket) => bucket.key === 'course_definition' && bucket.estimatedTokens)).toBe(true);

    endSession(session.id);
  });
});

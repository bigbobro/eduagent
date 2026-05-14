import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, endSession, streamUserInput } from './session';

describe('progress_snapshot SSE event', () => {
  it('emits a progress_snapshot event with clearedCardIds and totalAttempts', async () => {
    if (process.env.VOICE_MOCK !== 'true') return;

    const session = createSession(foodCourse);
    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, '(课堂开始)')) {
      events.push(ev);
    }

    const snapshot = events.find((event) => event.type === 'progress_snapshot');
    expect(snapshot).toBeDefined();
    expect(snapshot.clearedCardIds).toBeInstanceOf(Array);
    expect(typeof snapshot.totalAttempts).toBe('number');
    expect(snapshot.currentPhase).toBe('intro');
    endSession(session.id);
  });
});

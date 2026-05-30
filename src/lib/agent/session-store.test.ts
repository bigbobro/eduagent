import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createMemory, initializeCardProgress } from './memory';
import { InMemorySessionStore, Session } from './session-store';

function makeSession(id: string): Session {
  return {
    id,
    courseId: foodCourse.id,
    course: foodCourse,
    memory: initializeCardProgress(createMemory(), foodCourse),
    tokenUsage: {
      asr: { requests: 0, tokens: 0 },
      llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
      tts: { requests: 0, characters: 0 },
    },
    startTime: new Date('2026-05-30T00:00:00.000Z'),
    currentPhase: 'intro',
  };
}

describe('InMemorySessionStore', () => {
  it('saves and returns active sessions by id', () => {
    const store = new InMemorySessionStore();
    const session = makeSession('session-1');

    store.save(session);

    expect(store.get('session-1')).toBe(session);
    expect(store.get('missing')).toBeUndefined();
  });

  it('deletes sessions', () => {
    const store = new InMemorySessionStore();
    store.save(makeSession('session-1'));

    expect(store.delete('session-1')).toBe(true);
    expect(store.get('session-1')).toBeUndefined();
    expect(store.delete('session-1')).toBe(false);
  });
});

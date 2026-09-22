import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { POST } from '@/app/api/chat/route';
import { getDb } from '@/lib/db';
import * as llm from '@/lib/llm';
import { createSession, endSession, getSession, recordQuizAnswer, setSessionPhase, streamUserInput } from './session';
import { sessionStore, type Session } from './session-store';
import { streamUserInputToSSE } from './orchestrator';

const quizId = foodCourse.phases.reinforcement.quizzes[0].id;
const reply = JSON.stringify({ speech: 'Say apple again.', actions: [{ tool: 'show_card', params: { card_id: 'apple' } }], state_update: { current_word: 'apple', attempt_assessment: { card_id: 'apple', result: 'correct', should_advance: false, evidence: 'apple' } } });
const sessions: Session[] = [];
beforeEach(() => {
  vi.stubEnv('VOICE_MOCK', 'true'); vi.stubEnv('LLM_API_KEY', 'mock-key');
  getDb().exec('DELETE FROM interaction_logs; DELETE FROM word_performance; DELETE FROM lesson_logs; DELETE FROM course_progress');
  vi.spyOn(llm, 'streamLLM').mockImplementation(async function* () {
    yield { done: false, delta: reply };
    yield { done: true, fullText: reply, usage: { inputTokens: 12, outputTokens: 8 }, latency: 1 };
  });
});
afterEach(() => {
  getDb().exec('DROP TRIGGER IF EXISTS reject_write');
  sessions.splice(0).forEach((session) => { session.lifetime.abort(); sessionStore.delete(session.id); });
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});
function prepare(kind = 'normal') {
  const session = createSession(foodCourse); sessions.push(session);
  recordQuizAnswer(session.id, quizId, 'first', false);
  session.memory = { ...session.memory, currentCardId: 'apple', currentWord: 'apple' };
  setSessionPhase(session.id, kind === 'normal' ? 'interactive' : 'reinforcement');
  return session;
}
function persisted() {
  return Object.fromEntries(['lesson_logs', 'interaction_logs', 'word_performance', 'course_progress'].map((table) => [table, getDb().prepare(`SELECT * FROM ${table}`).all()]));
}
function memory(session: Session) {
  return structuredClone({ memory: session.memory, usage: session.tokenUsage, count: session.lessonInteractionCount });
}
function failWrite(table: string, operation: string) {
  getDb().exec(`CREATE TEMP TRIGGER reject_write BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`);
}
async function operate(session: Session, kind: string) {
  if (kind === 'quiz') {
    const response = await POST({ json: async () => ({ action: 'quiz-answer', sessionId: session.id, quizId, answer: 'apple', correct: true }) } as any);
    return response.ok;
  }
  const result = await new Response(streamUserInputToSSE(session.id, 'apple')).text();
  return result.includes('event: done');
}

describe('atomic lesson commits', () => {
  for (const kind of ['normal', 'quiz', 'fixed']) {
    it.each([['interaction_logs', 'INSERT'], ['lesson_logs', 'UPDATE'], ['course_progress', 'UPDATE']])(`${kind}: rolls back %s failure and permits a clean retry`, async (table, operation) => {
      const session = prepare(kind);
      const before = persisted(); const beforeMemory = memory(session);
      failWrite(table, operation);
      expect(await operate(session, kind)).toBe(false);
      expect(persisted()).toEqual(before);
      expect(memory(session)).toEqual(beforeMemory);
      getDb().exec('DROP TRIGGER reject_write');
      expect(await operate(session, kind)).toBe(true);
      expect(session.lessonInteractionCount).toBe(2);
      expect(session.memory.totalInteractions).toBe(2);
      expect(getDb().prepare('SELECT COUNT(*) AS n FROM interaction_logs WHERE lesson_id = ?').get(session.id)).toEqual({ n: 2 });
      expect(JSON.parse((getDb().prepare('SELECT snapshot FROM course_progress WHERE course_id = ?').get(foodCourse.id) as { snapshot: string }).snapshot).totalInteractions).toBe(2);
      if (kind === 'normal') {
        expect(getDb().prepare('SELECT attempts, correct, rc_correct FROM word_performance WHERE lesson_id = ? AND word = ?').get(session.id, 'apple')).toEqual({ attempts: 1, correct: 1, rc_correct: 1 });
        expect(session.tokenUsage.llm).toEqual({ requests: 1, inputTokens: 12, outputTokens: 8 });
      }
    });
  }

  it.each(['INSERT', 'UPDATE OF rc_correct'])('rolls back word performance %s failure before publishing memory', async (operation) => {
    const session = prepare(); const before = persisted(); const beforeMemory = memory(session);
    failWrite('word_performance', operation);
    expect(await operate(session, 'normal')).toBe(false);
    expect(persisted()).toEqual(before); expect(memory(session)).toEqual(beforeMemory);
  });

  it('publishes no session if initial lesson insertion fails', () => {
    const save = vi.spyOn(sessionStore, 'save');
    failWrite('lesson_logs', 'INSERT');
    expect(() => createSession(foodCourse)).toThrow('injected');
    expect(save).not.toHaveBeenCalled();
  });

  it.each(['lesson_logs', 'course_progress'])('keeps failed end closed and retryable with no partial %s write', (table) => {
    const session = prepare(); const before = persisted();
    failWrite(table, 'UPDATE');
    expect(() => endSession(session.id)).toThrow('injected');
    expect(session.lifetime.signal.aborted).toBe(true);
    expect(getSession(session.id)).toBeUndefined();
    expect(persisted()).toEqual(before);
    getDb().exec('DROP TRIGGER reject_write');
    endSession(session.id);
    expect((getDb().prepare('SELECT ended_gracefully FROM lesson_logs WHERE id = ?').get(session.id) as { ended_gracefully: number }).ended_gracefully).toBe(1);
    expect(sessionStore.get(session.id)).toBeUndefined();
  });

  it('does not publish a pending or failed user message into live memory', async () => {
    const session = prepare(); const before = memory(session);
    let release!: () => void;
    vi.mocked(llm.streamLLM).mockImplementationOnce(async function* () { await new Promise<void>((resolve) => { release = resolve; }); throw new Error('provider failed'); });
    const stream = streamUserInput(session.id, '我喜欢苹果吗?');
    const pending = stream.next();
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(memory(session)).toEqual(before);
    release();
    expect((await pending).value?.type).toBe('error');
    expect(memory(session)).toEqual(before);
  });

  it.each(['quiz', 'phase'])('rejects a stale LLM result after another %s operation', async (operation) => {
    const session = prepare();
    let release!: () => void;
    vi.mocked(llm.streamLLM).mockImplementationOnce(async function* () { await new Promise<void>((resolve) => { release = resolve; }); yield { done: false, delta: reply }; });
    const pending = operate(session, 'normal');
    await vi.waitFor(() => expect(release).toBeDefined());
    if (operation === 'quiz') recordQuizAnswer(session.id, quizId, 'apple', true);
    else setSessionPhase(session.id, 'reinforcement');
    const afterOther = persisted(); const afterMemory = memory(session);
    release();
    expect(await pending).toBe(false);
    expect(persisted()).toEqual(afterOther); expect(memory(session)).toEqual(afterMemory);
  });
});

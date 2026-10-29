import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession } from '@/lib/agent/session';
import { sessionStore, type Session } from '@/lib/agent/session-store';
import { getDb } from '@/lib/db';
import { summarizeRealtimeUsage } from './usage';
import { changePhase, type TeachingReceipt } from './teaching';
import { NaturalConversation, type ProviderMessage } from './conversation';

const usage = { input_tokens: 5, output_tokens: 5, input_token_details: { text_tokens: 5, audio_tokens: 0, cached_tokens: 0 }, output_token_details: { text_tokens: 5, audio_tokens: 0 } };
let session: Session; let sent: Array<Record<string, any>>; let published: TeachingReceipt[]; let conversation: NaturalConversation;
beforeEach(() => {
  session = createSession(foodCourse, 'test-learner', 'realtime');
  session.tokenUsage.realtime = { model: 'gpt-realtime-2.1', usage: [], complete: true };
  changePhase(session, 'interactive'); session.memory.currentCardId = 'apple';
  sent = []; published = [];
  conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt) });
  conversation.setPresented({ kind: 'card', id: 'apple' });
  sent.length = 0;
});
afterEach(() => { conversation.close(); session.lifetime.abort(); sessionStore.delete(session.id); });

const feed = (...events: ProviderMessage[]) => events.forEach((event) => conversation.handle(event));
const speech = (item: string) => feed({ type: 'input_audio_buffer.speech_started', item_id: item }, { type: 'input_audio_buffer.speech_stopped', item_id: item }, { type: 'input_audio_buffer.committed', item_id: item });
const created = (id: string, metadata: Record<string, string> | null = null) => feed({ type: 'response.created', response: { id, status: 'in_progress', metadata } });
const call = (name: string, args: object) => ({ type: 'function_call', name, call_id: `call_${name}_${JSON.stringify(args).length}`, arguments: JSON.stringify(args) });
const done = (id: string, output: object[] = [], status = 'completed', metadata: Record<string, string> | null = null) => feed({ type: 'response.done', response: { id, status, metadata, usage, output: output as never } });
const assess = (target: string, extra: object = {}) => call('record_assessment', { target_id: target, result: 'correct', heard: target, evidence: 'clear', mastered: true, next_action: 'advance', next_card_id: null, next_phase: null, ...extra });
const outputs = () => sent.filter((e) => e.type === 'conversation.item.create' && e.item.type === 'function_call_output').map((e) => JSON.parse(e.item.output));
const creates = () => sent.filter((e) => e.type === 'response.create');
const attempts = (word: string) => session.memory.wordPerformance.get(word)?.attempts ?? 0;

describe('natural conversation input binding and tool execution', () => {
  it('switches to the requested card mid-explanation without counting a failed attempt for the interrupted card', () => {
    created('r1'); // teacher explaining apple
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'i1' });
    done('r1', [], 'cancelled'); // interrupt_response cancels generation
    feed({ type: 'input_audio_buffer.speech_stopped', item_id: 'i1' }, { type: 'input_audio_buffer.committed', item_id: 'i1' });
    created('r2'); done('r2', [call('show_card', { card_id: 'milk' })]);
    expect(published.at(-1)?.cardId).toBe('milk');
    expect(attempts('apple')).toBe(0); expect(session.memory.clearedCardIds).toEqual([]);
    expect(outputs()[0]).toMatchObject({ ok: true, displayed_card: 'milk' });
    expect(creates().at(-1)?.response.metadata).toMatchObject({ kind: 'followup', parent: 'r2' });
  });
  it('binds speech to the card rendered at speech start, not to a newer server card', () => {
    conversation.setPresented({ kind: 'card', id: 'apple' });
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'i1' });
    conversation.setPresented({ kind: 'card', id: 'milk' });
    feed({ type: 'input_audio_buffer.committed', item_id: 'i1' });
    created('r1'); done('r1', [assess('milk')]);
    expect(outputs()[0]).toMatchObject({ ok: false, error: 'INVALID_INPUT_ASSOCIATION' });
    expect(attempts('milk')).toBe(0);
    created('r2', { kind: 'followup', parent: 'r1', request: creates().at(-1)?.response.metadata.request }); done('r2', [assess('apple')]);
    expect(attempts('apple')).toBe(1); expect(session.memory.clearedCardIds).toEqual(['apple']);
  });
  it('never executes tools from a cancelled response and settles a re-reported response only once', () => {
    speech('i1'); created('r1'); done('r1', [assess('apple')], 'cancelled');
    expect(published).toEqual([]); expect(attempts('apple')).toBe(0);
    speech('i2'); created('r2'); done('r2', [assess('apple')]);
    done('r2', [assess('apple')], 'cancelled'); // interrupted during playback after completing
    expect(attempts('apple')).toBe(1); expect(published).toHaveLength(1);
    expect(session.tokenUsage.realtime?.usage).toHaveLength(2);
  });
  it('awards one assessment per child input even when the model repeats the call', () => {
    speech('i1'); created('r1'); done('r1', [assess('apple', { next_action: 'retry', mastered: false, result: 'close' })]);
    created('r2', { kind: 'followup', parent: 'r1', request: creates().at(-1)?.response.metadata.request }); done('r2', [assess('apple')]);
    expect(attempts('apple')).toBe(1); expect(outputs()[1]).toMatchObject({ duplicate: true, result: 'close' });
    expect(session.memory.clearedCardIds).toEqual([]);
  });
  it('rejects assessment in app-initiated speech that has no child input', () => {
    conversation.repeat('apple'); const request = creates()[0].response.metadata.request;
    created('r1', { kind: 'repeat', request }); done('r1', [assess('apple')]);
    expect(outputs()[0]).toMatchObject({ ok: false, error: 'NO_CHILD_INPUT' }); expect(attempts('apple')).toBe(0);
  });
  it('does not count questions, requests or chat that the model answers without a tool', () => {
    speech('i1'); created('r1'); done('r1', [{ type: 'message' }]);
    expect(attempts('apple')).toBe(0); expect(published).toEqual([]);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM interaction_logs WHERE lesson_id = ?').get(session.id)).toEqual({ n: 0 });
  });
  it('drops a pending follow-up when the child starts talking and keeps committed state', () => {
    speech('i1');
    created('r1'); feed({ type: 'input_audio_buffer.speech_started', item_id: 'i2' }); // child talks before the tool response finishes
    done('r1', [assess('apple', { next_card_id: 'milk' })]);
    expect(session.memory.currentCardId).toBe('milk');
    expect(creates()).toHaveLength(0);
    feed({ type: 'input_audio_buffer.committed', item_id: 'i2' });
    expect(creates()).toHaveLength(0); // provider VAD answers the new turn itself
  });
  it('serializes app responses behind active speech and requeues one that lost a race to VAD', () => {
    changePhase(session, 'reinforcement'); conversation.setPresented({ kind: 'quiz', id: 'q1' });
    created('vad'); conversation.presentQuiz('q1');
    expect(creates()).toHaveLength(0);
    done('vad'); expect(creates()).toHaveLength(1);
    const request = creates()[0];
    feed({ type: 'error', error: { code: 'conversation_already_has_active_response', event_id: request.event_id } });
    created('vad2'); done('vad2');
    expect(creates()).toHaveLength(2); expect(creates()[1].response.metadata).toMatchObject({ kind: 'present-quiz', quiz_id: 'q1' });
  });
  it('pauses by cancelling the active response and holding app speech until resume', () => {
    created('r1'); conversation.setPaused(true);
    expect(sent.at(-1)).toEqual({ type: 'response.cancel' });
    done('r1', [], 'cancelled'); conversation.repeat('apple');
    expect(creates()).toHaveLength(0);
    conversation.setPaused(false); conversation.repeat('apple');
    expect(creates()).toHaveLength(1);
  });
  it('checks picture choices in the application once per tap and only for the displayed question', () => {
    changePhase(session, 'reinforcement');
    expect(() => conversation.pick('t1', 'q1', 'apple')).toThrow('INVALID_INPUT_ASSOCIATION');
    conversation.setPresented({ kind: 'quiz', id: 'q1' });
    const first = conversation.pick('t1', 'q1', 'apple');
    expect(conversation.pick('t1', 'q1', 'apple')).toBe(first);
    expect(session.lessonInteractionCount).toBe(1);
  });
  it('keeps usage incomplete when the call ends with a response that never reported usage', () => {
    created('r1'); done('r1'); created('r2');
    expect(summarizeRealtimeUsage(session.tokenUsage.realtime).complete).toBe(false);
    done('r2');
    expect(summarizeRealtimeUsage(session.tokenUsage.realtime).complete).toBe(true);
  });
  it('lets the model move to practice and refreshes its instructions with committed state', () => {
    speech('i1'); created('r1'); done('r1', [call('start_practice', {})]);
    expect(session.currentPhase).toBe('reinforcement');
    expect(sent.find((e) => e.type === 'session.update')?.session.instructions).toContain('phase reinforcement');
  });
  it('stops chaining tool-only responses after repeated tool calls', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) {
      const parent = creates().at(-1)?.response.metadata;
      created(`r${i}`, parent ? { ...parent } : null); done(`r${i}`, [call('show_card', { card_id: i % 2 ? 'apple' : 'milk' })]);
    }
    expect(creates().at(-1)?.response.tool_choice).toBe('none');
    vi.useRealTimers();
  });
});

it('answers the completing tool result before saying goodbye once', () => {
  changePhase(session, 'reinforcement');
  const sentences = foodCourse.phases.reinforcement.quizzes.filter((q) => q.type === 'repeat-after-me');
  session.memory.passedQuizIds = foodCourse.phases.reinforcement.quizzes.map((q) => q.id).filter((id) => id !== sentences[0].id);
  conversation.setPresented({ kind: 'quiz', id: sentences[0].id });
  speech('i1'); created('r1'); done('r1', [assess(sentences[0].id, { mastered: false })]);
  expect(session.currentPhase).toBe('done');
  const order = sent.filter((e) => ['response.create', 'conversation.item.create'].includes(e.type)).map((e) => e.type === 'response.create' ? e.response.metadata.kind : e.item.type);
  expect(order).toEqual(['function_call_output', 'followup']);
  created('r2', { kind: 'followup', parent: 'r1', request: creates()[0].response.metadata.request }); done('r2');
  expect(creates().map((e) => e.response.metadata.kind)).toEqual(['followup', 'goodbye']);
  conversation.changePhase('done'); // a late client completion after the tool already finished the lesson
  expect(creates().filter((e) => e.response.metadata.kind === 'goodbye')).toHaveLength(1);
});

it('holds a question prompt during pause and sends it on resume', () => {
  changePhase(session, 'reinforcement'); conversation.setPresented({ kind: 'quiz', id: 'q1' });
  created('r1'); conversation.presentQuiz('q1'); conversation.setPaused(true); done('r1', [], 'cancelled');
  expect(creates()).toHaveLength(0);
  conversation.setPaused(false);
  expect(creates()[0].response.metadata).toMatchObject({ kind: 'present-quiz', quiz_id: 'q1' });
});

it('removes a spoken preamble from the context after a tool turn so the model does not imitate it', () => {
  speech('i1'); created('r1');
  feed({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: '我先听一下' });
  done('r1', [{ type: 'message', id: 'msg_preamble' }, assess('apple')]);
  expect(sent).toContainEqual({ type: 'conversation.item.delete', item_id: 'msg_preamble' });
  expect(attempts('apple')).toBe(1); // the committed assessment itself stands
  speech('i2'); created('r2'); done('r2', [{ type: 'message', id: 'msg_plain' }]);
  expect(sent).not.toContainEqual({ type: 'conversation.item.delete', item_id: 'msg_plain' });
});

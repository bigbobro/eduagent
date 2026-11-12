import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { actionsCourse } from '@/data/courses/actions';
import { createSession } from '@/lib/agent/session';
import { sessionStore, type Session } from '@/lib/agent/session-store';
import { getDb } from '@/lib/db';
import { summarizeRealtimeUsage } from './usage';
import { changePhase, type TeachingReceipt } from './teaching';
import { getCourseProgress } from '@/lib/db/queries';
import { isResumableProgress } from '@/lib/agent/course-progress';
import { GAME_RULES, MANUAL_TURN, NaturalConversation, SILENCE, SITTING, type ProviderMessage } from './conversation';

const usage = { input_tokens: 5, output_tokens: 5, input_token_details: { text_tokens: 5, audio_tokens: 0, cached_tokens: 0 }, output_token_details: { text_tokens: 5, audio_tokens: 0 } };
let session: Session; let sent: Array<Record<string, any>>; let published: TeachingReceipt[]; let conversation: NaturalConversation;
let sittingEnds: number;
// Most tests are about other things; the nudge has its own describe block.
const NO_NUDGE = { nudgeAfterMs: SILENCE.nudgeAfterMs, maxNudges: 0 };
beforeEach(() => {
  session = createSession(foodCourse, 'test-learner', 'realtime');
  session.tokenUsage.realtime = { model: 'gpt-realtime-2.1', usage: [], complete: true };
  changePhase(session, 'interactive'); session.memory.currentCardId = 'apple';
  sent = []; published = []; sittingEnds = 0;
  conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt),
    sittingEnded: () => { sittingEnds++; } }, SITTING, { silence: NO_NUDGE });
  conversation.setPresented({ kind: 'card', id: 'apple' });
  sent.length = 0;
});
afterEach(() => { conversation.close(); session.lifetime.abort(); sessionStore.delete(session.id); });

const feed = (...events: ProviderMessage[]) => events.forEach((event) => conversation.handle(event));
const speech = (item: string) => feed({ type: 'input_audio_buffer.speech_started', item_id: item }, { type: 'input_audio_buffer.speech_stopped', item_id: item }, { type: 'input_audio_buffer.committed', item_id: item });
const created = (id: string, metadata: Record<string, string> | null = null) => feed({ type: 'response.created', response: { id, status: 'in_progress', metadata } });
const call = (name: string, args: object) => ({ type: 'function_call', name, call_id: `call_${name}_${JSON.stringify(args).length}`, arguments: JSON.stringify(args) });
const done = (id: string, output: object[] = [], status = 'completed', metadata: Record<string, string> | null = null) => feed({ type: 'response.done', response: { id, status, metadata, usage, output: output as never } });
/** The silent assessor requests (out-of-band responses), not the teacher's. */
const assessRequests = () => sent.filter((e) => e.type === 'response.create' && e.response.conversation === 'none');
/** Settles the latest assessor request for `input` the way the provider would: response.created, then response.done with the given output. */
const settle = (input: string, output: object[], status = 'completed', suffix = '') => {
  const request = assessRequests().filter((e) => e.response.metadata.input === input).at(-1);
  if (!request) throw new Error(`no assessor request for ${input}`);
  const id = `resp_${request.event_id}${suffix}`; const metadata = { ...request.response.metadata };
  created(id, metadata); done(id, output, status, metadata);
  return id;
};
const assessed = (input: string, report: object = {}, status = 'completed') =>
  settle(input, [call('record_assessment', { result: 'correct', heard: input, evidence: 'clear', mastered: true, next_action: 'advance', ...report })], status);
const outputs = () => sent.filter((e) => e.type === 'conversation.item.create' && e.item.type === 'function_call_output').map((e) => JSON.parse(e.item.output));
/** Teacher and app responses; the assessor's out-of-band requests are listed by assessRequests(). */
const creates = () => sent.filter((e) => e.type === 'response.create' && e.response.conversation !== 'none');
const states = () => sent.filter((e) => e.type === 'conversation.item.create' && e.item.type === 'message' && e.item.content[0].text.startsWith('[app] State:')).map((e) => e.item.content[0].text as string);
const attempts = (word: string) => session.memory.wordPerformance.get(word)?.attempts ?? 0;

describe('natural conversation input binding and tool execution', () => {
  it('keeps a correct first echo on the card, then clears it on a separate recall; the card only changes when the teacher shows another', () => {
    speech('echo');
    assessed('echo', { mastered: false, next_action: 'retry', evidence: 'Immediate imitation; check recall next.' });
    expect(session.memory.currentCardId).toBe('apple');
    expect(session.memory.clearedCardIds).toEqual([]);
    expect(states().at(-1)).toContain('"attempts":1,"correct":1');
    expect(published.at(-1)?.assessment).toMatchObject({ target_id: 'apple', mastered: false });
    created('cue'); done('cue');
    // The next cue is spoken feedback, not another assessment of the same audio.
    expect(attempts('apple')).toBe(1);
    speech('recall');
    assessed('recall', { evidence: 'Named apple from a meaning cue without another model.' });
    expect(session.memory.clearedCardIds).toEqual(['apple']);
    expect(attempts('apple')).toBe(2);
    expect(session.memory.currentCardId).toBe('apple'); // the assessor never moves the card
    created('move'); done('move', [call('show_card', { card_id: 'milk' })]);
    expect(session.memory.currentCardId).toBe('milk');
    expect(sent.some((event) => event.type === 'session.update')).toBe(false);
  });
  it.each(actionsCourse.phases.reinforcement.quizzes.filter((q) => q.type === 'repeat-after-me'))('saves sentence $cardId as question $id without another attempt', (quiz) => {
    if (quiz.type !== 'repeat-after-me') throw new Error('Expected sentence quiz');
    session.course = actionsCourse;
    changePhase(session, 'reinforcement');
    conversation.setPresented({ kind: 'quiz', id: quiz.id });
    speech('sentence-input');
    assessed('sentence-input', { heard: quiz.targetText });
    expect(published.at(-1)).toMatchObject({ quiz: { quizId: quiz.id, correct: true } });
    expect(session.memory.passedQuizIds).toContain(quiz.id);
    const rows = getDb().prepare('SELECT model_calls FROM interaction_logs WHERE lesson_id = ?').all(session.id) as Array<{ model_calls: string }>;
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].model_calls).assessment.target_id).toBe(quiz.id);
    expect(session.memory.clearedCardIds).not.toContain(quiz.cardId);
    assessed('sentence-input'); // the same assessor response reported again
    expect(session.lessonInteractionCount).toBe(1);
  });
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
  it('saves the assessment against the card rendered at speech start even when the teacher moved the server card first', () => {
    conversation.setPresented({ kind: 'card', id: 'apple' });
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'i1' });
    conversation.setPresented({ kind: 'card', id: 'milk' });
    feed({ type: 'input_audio_buffer.committed', item_id: 'i1' });
    created('r1'); done('r1', [call('show_card', { card_id: 'milk' })]);
    expect(session.memory.currentCardId).toBe('milk');
    assessed('i1');
    expect(published.at(-1)?.assessment).toMatchObject({ target_id: 'apple' });
    expect(attempts('apple')).toBe(1); expect(attempts('milk')).toBe(0);
    expect(session.memory.clearedCardIds).toEqual(['apple']); expect(session.memory.currentCardId).toBe('milk');
  });
  it('still saves the last word when its assessment lands just after start_practice', () => {
    speech('i1'); created('r1'); done('r1', [call('start_practice', {})]);
    expect(session.currentPhase).toBe('reinforcement');
    assessed('i1');
    expect(session.memory.clearedCardIds).toEqual(['apple']); expect(published.at(-1)?.assessment).toMatchObject({ target_id: 'apple' });
  });
  it('does not save anything for not_attempt and publishes nothing', () => {
    speech('i1'); created('r1'); done('r1', [{ type: 'message' }]);
    assessed('i1', { result: 'not_attempt', heard: '', mastered: false, next_action: 'retry' });
    expect(attempts('apple')).toBe(0); expect(published).toEqual([]);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM interaction_logs WHERE lesson_id = ?').get(session.id)).toEqual({ n: 0 });
  });
  it('sends one assessor request per committed input and none for app speech, pick-word questions, unbound inputs or a finished sitting', () => {
    speech('i1'); expect(assessRequests()).toHaveLength(1);
    speech('i2'); expect(assessRequests()).toHaveLength(2);
    expect(assessRequests().map((e) => e.response.metadata.input)).toEqual(['i1', 'i2']);
    expect(new Set(assessRequests().map((e) => e.event_id)).size).toBe(2);
    sent.length = 0;
    conversation.repeat('apple'); created('rep', { ...creates()[0].response.metadata }); done('rep');
    expect(assessRequests()).toHaveLength(0);
    // Speech while a pick-word question is on screen is never an attempt.
    changePhase(session, 'reinforcement'); conversation.setPresented({ kind: 'quiz', id: 'q1' }); sent.length = 0;
    speech('i3'); expect(assessRequests()).toHaveLength(0);
    // A card input whose phase moved on before the commit.
    conversation.close();
    session.currentPhase = 'interactive'; session.memory.passedQuizIds = [];
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt), sittingEnded: () => {} }, SITTING, { silence: NO_NUDGE });
    sent.length = 0;
    speech('i4'); expect(assessRequests()).toHaveLength(0); // nothing was presented
    conversation.setPresented({ kind: 'card', id: 'apple' });
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'i5' }); session.currentPhase = 'reinforcement';
    feed({ type: 'input_audio_buffer.committed', item_id: 'i5' }); expect(assessRequests()).toHaveLength(0);
    session.currentPhase = 'interactive';
    finishCourse(); sent.length = 0;
    speech('i6'); expect(assessRequests()).toHaveLength(0);
  });
  it.each([
    ['a cancelled response', [] as object[], 'cancelled'],
    ['a failed response', [] as object[], 'failed'],
    ['a response without a tool call', [{ type: 'message' }] as object[], 'completed'],
    ['a response with invalid arguments', [call('record_assessment', { result: 'great' })] as object[], 'completed'],
    ['a response with unparseable arguments', [{ type: 'function_call', name: 'record_assessment', call_id: 'c', arguments: '{nope' }] as object[], 'completed'],
  ])('retries %s once, then gives up', (_name, output, status) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      speech('i1'); expect(assessRequests()).toHaveLength(1);
      settle('i1', output, status); expect(assessRequests()).toHaveLength(2);
      expect(assessRequests()[1].response.metadata.input).toBe('i1'); expect(assessRequests()[1].event_id).not.toBe(assessRequests()[0].event_id);
      settle('i1', output, status); expect(assessRequests()).toHaveLength(2);
      expect(attempts('apple')).toBe(0); expect(published).toEqual([]);
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('assessment failed'));
    } finally { warning.mockRestore(); }
  });
  it('retries an assessor request the provider refused once, and not again', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      speech('i1');
      feed({ type: 'error', error: { code: 'rate_limit_exceeded', event_id: assessRequests()[0].event_id } });
      expect(assessRequests()).toHaveLength(2);
      feed({ type: 'error', error: { code: 'rate_limit_exceeded', event_id: assessRequests()[1].event_id } });
      expect(assessRequests()).toHaveLength(2);
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('assessment failed'));
    } finally { warning.mockRestore(); }
  });
  it('keeps the attempt when the assessor marks it mastered with a contradictory skip note', () => {
    speech('i1'); assessed('i1', { mastered: true, next_action: 'skip' });
    expect(attempts('apple')).toBe(1); expect(session.memory.clearedCardIds).toContain('apple');
    expect(published.at(-1)?.assessment).toMatchObject({ mastered: true, next_action: 'advance' });
  });
  it('retries once and saves the result of the retry', () => {
    speech('i1'); settle('i1', [], 'cancelled');
    assessed('i1');
    expect(attempts('apple')).toBe(1); expect(published).toHaveLength(1);
  });
  it('settles a duplicate response.done of one assessor response once, and saves one result per input', () => {
    speech('i1');
    assessed('i1', { result: 'close', mastered: false, next_action: 'retry' });
    assessed('i1'); // same response id again
    settle('i1', [call('record_assessment', { result: 'correct', heard: 'x', evidence: 'x', mastered: true, next_action: 'advance' })], 'completed', '_other'); // another response for the same input
    expect(attempts('apple')).toBe(1); expect(session.memory.clearedCardIds).toEqual([]); expect(published).toHaveLength(1);
    expect(session.tokenUsage.realtime?.usage).toHaveLength(2);
  });
  it('keeps the assessor result when the child starts speaking again while it runs', () => {
    speech('i1');
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'i2' });
    assessed('i1');
    expect(attempts('apple')).toBe(1); expect(published).toHaveLength(1);
    feed({ type: 'input_audio_buffer.speech_stopped', item_id: 'i2' }, { type: 'input_audio_buffer.committed', item_id: 'i2' });
    assessed('i2');
    expect(attempts('apple')).toBe(2);
  });
  it('does not forward assessor events to the browser and still forwards normal ones', () => {
    const meta = { kind: 'assess', request: 'assess_1', input: 'i1' };
    expect(NaturalConversation.forBrowser({ type: 'response.created', response: { id: 'a', status: 'in_progress', metadata: meta } })).toBeNull();
    expect(NaturalConversation.forBrowser({ type: 'response.done', response: { id: 'a', status: 'completed', metadata: meta } })).toBeNull();
    expect(NaturalConversation.forBrowser({ type: 'response.created', response: { id: 'r', status: 'in_progress', metadata: { kind: 'repeat' } } })).toMatchObject({ type: 'response.created', response: { id: 'r' } });
    expect(NaturalConversation.forBrowser({ type: 'response.done', response: { id: 'r', status: 'completed', metadata: null } })).toMatchObject({ type: 'response.done' });
  });
  it('does not treat the assessor as teacher activity: queued app speech is still sent and nothing is cancelled for it', () => {
    speech('i1'); // assessor running, no teacher response
    const assessor = assessRequests()[0].response.metadata;
    created('a1', { ...assessor });
    sent.length = 0;
    conversation.repeat('apple');
    expect(kinds()).toEqual(['repeat']);
    conversation.setPaused(true);
    expect(cancels()).toBe(0);
  });
  it('stores the assessor as a realtime_responses row with the report as text', () => {
    const rows = () => getDb().prepare('SELECT kind, status, text, tools FROM realtime_responses WHERE lesson_id = ? AND kind = ? ORDER BY id').all(session.id, 'assess') as Array<{ kind: string; status: string; text: string; tools: string }>;
    speech('i1');
    assessed('i1', { heard: 'ap-ple' });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ kind: 'assess', status: 'completed', tools: 'record_assessment' });
    expect(JSON.parse(rows()[0].text)).toMatchObject({ result: 'correct', heard: 'ap-ple', mastered: true });
    speech('i2'); settle('i2', [], 'cancelled');
    expect(rows()[1]).toMatchObject({ status: 'cancelled', text: '', tools: '' });
  });
  describe('spoken feedback of an assessed input', () => {
    const say = (response: string, text: string) => feed({ type: 'response.output_audio_transcript.delta', response_id: response, delta: text });
    const aiResponses = () => (getDb().prepare('SELECT ai_response FROM interaction_logs WHERE lesson_id = ?').all(session.id) as Array<{ ai_response: string }>).map((r) => r.ai_response);
    it('is stored when the teacher reply finishes before the assessor', () => {
      speech('i1'); created('r1'); say('r1', '对，apple！'); done('r1');
      expect(aiResponses()).toEqual([]);
      assessed('i1');
      expect(aiResponses()).toEqual(['对，apple！']);
    });
    it('is stored when the assessor finishes before the teacher reply', () => {
      speech('i1'); created('r1'); say('r1', '对，apple！');
      assessed('i1');
      expect(aiResponses()).toEqual(['']);
      done('r1');
      expect(aiResponses()).toEqual(['对，apple！']);
    });
    it('keeps only the first completed spoken reply, not a later follow-up', () => {
      speech('i1'); created('r1'); say('r1', '第一句'); done('r1', [call('show_card', { card_id: 'milk' })]);
      created('f1', { ...creates().at(-1)?.response.metadata }); say('f1', '第二句'); done('f1');
      assessed('i1');
      expect(aiResponses()).toEqual(['第一句']);
    });
  });
  it('rejects a teacher call to record_assessment as an unknown tool and changes nothing', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      speech('i1'); created('r1');
      done('r1', [call('record_assessment', { result: 'correct', heard: 'apple', evidence: 'x', mastered: true, next_action: 'advance' })]);
      expect(outputs()[0]).toMatchObject({ ok: false, error: 'UNKNOWN_TOOL' });
      expect(attempts('apple')).toBe(0); expect(published).toEqual([]); expect(session.memory.clearedCardIds).toEqual([]);
    } finally { warning.mockRestore(); }
  });
  it('gives the teacher only show_card, start_practice and end_sitting', () => {
    const config = conversation.sessionConfig('m') as { tools: Array<{ name: string }> };
    expect(config.tools.map((t) => t.name)).toEqual(['show_card', 'start_practice', 'end_sitting']);
  });
  it('sends the assessor as a forced text-only out-of-band response that ends with the bound target', () => {
    speech('i1');
    const request = assessRequests()[0];
    expect(request).toMatchObject({ type: 'response.create', event_id: request.response.metadata.request,
      response: { conversation: 'none', output_modalities: ['text'], tool_choice: 'required', metadata: { kind: 'assess', input: 'i1' } } });
    expect(request.response.tools).toHaveLength(1); expect(request.response.tools[0].name).toBe('record_assessment');
    expect(request.response.instructions.endsWith(`Screen target when the child spoke: card apple, the English word "apple" (${foodCourse.cards.find((c) => c.id === 'apple')!.chinese}).`)).toBe(true);
    session.course = actionsCourse; changePhase(session, 'reinforcement'); conversation.setPresented({ kind: 'quiz', id: 'q5' }); sent.length = 0;
    speech('i2');
    expect(assessRequests()[0].response.instructions.endsWith('Screen target when the child spoke: practice question q5, repeat the whole sentence "I can run.".')).toBe(true);
    expect(assessRequests()[0].response.metadata.input).toBe('i2');
  });
  it('stores one row per response with kind, status, text, tools and the reply wait', () => {
    const rows = () => getDb().prepare('SELECT kind, status, text, tools, reply_ms FROM realtime_responses WHERE lesson_id = ? ORDER BY id').all(session.id) as Array<{ kind: string; status: string; text: string; tools: string; reply_ms: number | null }>;
    const say = (id: string, text: string) => feed({ type: 'response.output_audio_transcript.delta', response_id: id, delta: text });
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'w1' }, { type: 'input_audio_buffer.speech_stopped', item_id: 'w1' }, { type: 'input_audio_buffer.committed', item_id: 'w1' });
    created('r1'); feed({ type: 'output_audio_buffer.started', response_id: 'r1' }); say('r1', 'Great apple!');
    done('r1');
    expect(rows()).toEqual([{ kind: 'speech', status: 'completed', text: 'Great apple!', tools: '', reply_ms: expect.any(Number) }]);
    // Re-reported as cancelled during playback: the single completed row stays.
    done('r1', [], 'cancelled');
    expect(rows()).toHaveLength(1);
    speech('w2'); created('r2'); say('r2', 'Say it'); done('r2', [], 'cancelled');
    expect(rows()[1]).toMatchObject({ kind: 'speech', status: 'cancelled', text: 'Say it', tools: '', reply_ms: null });
    speech('w3'); created('r3'); say('r3', 'Well done'); done('r3', [call('show_card', { card_id: 'milk' })]);
    expect(rows()[2]).toMatchObject({ status: 'completed', text: 'Well done', tools: 'show_card' });
  });
  it('never executes tools from a cancelled response and settles a re-reported response only once', () => {
    speech('i1'); created('r1'); done('r1', [call('show_card', { card_id: 'milk' })], 'cancelled');
    expect(published).toEqual([]); expect(session.memory.currentCardId).toBe('apple');
    speech('i2'); created('r2'); done('r2', [call('show_card', { card_id: 'milk' })]);
    done('r2', [call('show_card', { card_id: 'milk' })], 'cancelled'); // interrupted during playback after completing
    expect(session.memory.currentCardId).toBe('milk'); expect(published).toHaveLength(1);
    expect(session.tokenUsage.realtime?.usage).toHaveLength(2);
  });
  it('drops a pending follow-up when the child starts talking and keeps committed state', () => {
    speech('i1');
    created('r1'); feed({ type: 'input_audio_buffer.speech_started', item_id: 'i2' }); // child talks before the tool response finishes
    done('r1', [call('show_card', { card_id: 'milk' })]);
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
  it('lets the model move to practice and appends committed state without touching the cached instructions', () => {
    speech('i1'); created('r1'); done('r1', [call('start_practice', {})]);
    expect(session.currentPhase).toBe('reinforcement');
    expect(states().at(-1)).toContain('phase reinforcement');
    expect(sent.some((e) => e.type === 'session.update')).toBe(false);
  });
  it('writes a screen change during teacher speech once that response settles, and never repeats an unchanged state', () => {
    created('r1');
    conversation.setPresented({ kind: 'card', id: 'milk' });
    expect(states()).toEqual([]);
    done('r1');
    expect(states()).toHaveLength(1); expect(states()[0]).toContain('screen card milk');
    conversation.setPresented({ kind: 'card', id: 'apple' }); conversation.setPresented({ kind: 'card', id: 'milk' });
    created('r2'); done('r2');
    expect(states()).toHaveLength(3);
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

it('queues the completion goodbye once when the last repeat-after-me question is assessed correct', () => {
  changePhase(session, 'reinforcement');
  const sentences = foodCourse.phases.reinforcement.quizzes.filter((q) => q.type === 'repeat-after-me');
  session.memory.passedQuizIds = foodCourse.phases.reinforcement.quizzes.map((q) => q.id).filter((id) => id !== sentences[0].id);
  conversation.setPresented({ kind: 'quiz', id: sentences[0].id }); sent.length = 0;
  speech('i1'); assessed('i1', { mastered: false });
  expect(session.currentPhase).toBe('done');
  expect(creates().map((e) => e.response.metadata.kind)).toEqual(['goodbye']); expect(creates()[0].response.tool_choice).toBe('none');
  conversation.changePhase('done'); // a late client completion after the assessment already finished the lesson
  expect(creates().filter((e) => e.response.metadata.kind === 'goodbye')).toHaveLength(1);
});

it('holds a question prompt during pause and sends it on resume', () => {
  changePhase(session, 'reinforcement'); conversation.setPresented({ kind: 'quiz', id: 'q1' });
  created('r1'); conversation.presentQuiz('q1'); conversation.setPaused(true); done('r1', [], 'cancelled');
  expect(creates()).toHaveLength(0);
  conversation.setPaused(false);
  expect(creates()[0].response.metadata).toMatchObject({ kind: 'present-quiz', quiz_id: 'q1' });
});

describe('follow-up after teacher tool calls', () => {
  const say = (response: string, text: string) => feed({ type: 'response.output_audio_transcript.delta', response_id: response, delta: text });
  it('sends the follow-up and keeps the spoken reaction when the teacher spoke before show_card', () => {
    speech('i1'); created('r1'); say('r1', '对，是 apple！');
    done('r1', [{ type: 'message', id: 'msg_reaction' }, call('show_card', { card_id: 'milk' })]);
    expect(kinds()).toEqual(['followup']);
    expect(sent.some((e) => e.type === 'conversation.item.delete')).toBe(false);
  });
  it('sends the follow-up for a silent show_card or start_practice', () => {
    speech('i1'); created('r1');
    done('r1', [call('show_card', { card_id: 'milk' })]);
    expect(kinds()).toEqual(['followup']);
  });
  it('sends no follow-up for a spoken answer without tools', () => {
    speech('i1'); created('r1'); say('r1', '好的'); done('r1');
    expect(kinds()).toEqual([]);
  });
  it('does not wait for the assessor before sending the follow-up', () => {
    speech('i1'); created('r1'); done('r1', [call('show_card', { card_id: 'milk' })]);
    expect(kinds()).toEqual(['followup']); expect(attempts('apple')).toBe(0);
    assessed('i1');
    expect(attempts('apple')).toBe(1); expect(kinds()).toEqual(['followup']);
  });
});

describe('silence nudge', () => {
  const FAST = { nudgeAfterMs: 1000, maxNudges: 2 };
  const nudgeKinds = () => kinds().filter((k) => k === 'nudge');
  const make = (options: { manualTurn?: boolean } = {}) => {
    conversation.close();
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt),
      sittingEnded: () => { sittingEnds++; } }, SITTING, { ...options, silence: FAST });
    conversation.setPresented({ kind: 'card', id: 'apple' });
  };
  /** The nudge request becomes a response that finishes and plays out. */
  const answerNudge = (id: string) => {
    const metadata = { ...creates().at(-1)!.response.metadata };
    created(id, metadata); done(id, [], 'completed', metadata);
    feed({ type: 'output_audio_buffer.started', response_id: id }, { type: 'output_audio_buffer.stopped', response_id: id });
  };
  beforeEach(() => { vi.useFakeTimers(); make(); });
  afterEach(() => { vi.useRealTimers(); });

  it('nudges after the teacher goes idle, at most twice in a row', () => {
    open();
    vi.advanceTimersByTime(999); expect(nudgeKinds()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(nudgeKinds()).toHaveLength(1);
    expect(creates().at(-1)?.response).toMatchObject({ tool_choice: 'none', metadata: { kind: 'nudge' } });
    expect(sent.some((e) => e.type === 'conversation.item.create' && e.item.content?.[0]?.text?.includes('quiet for about ten seconds'))).toBe(true);
    answerNudge('n1');
    vi.advanceTimersByTime(1000); expect(nudgeKinds()).toHaveLength(2);
    answerNudge('n2');
    vi.advanceTimersByTime(10_000); expect(nudgeKinds()).toHaveLength(2);
  });
  it('child speech resets the counter and cancels a pending countdown', () => {
    open();
    vi.advanceTimersByTime(1000); answerNudge('n1');
    vi.advanceTimersByTime(1000); answerNudge('n2');
    expect(nudgeKinds()).toHaveLength(2);
    speech('i1'); created('r1'); done('r1'); feed({ type: 'output_audio_buffer.started', response_id: 'r1' }, { type: 'output_audio_buffer.stopped', response_id: 'r1' });
    vi.advanceTimersByTime(1000); expect(nudgeKinds()).toHaveLength(3);
    // speech during a countdown cancels it
    answerNudge('n3');
    vi.advanceTimersByTime(500);
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'i2' });
    vi.advanceTimersByTime(5000); expect(nudgeKinds()).toHaveLength(3);
  });
  it('does not fire while paused, while a response is active, after the sitting ended or in manual-turn mode', () => {
    open();
    conversation.setPaused(true);
    vi.advanceTimersByTime(5000); expect(nudgeKinds()).toHaveLength(0);
    conversation.setPaused(false);
    created('busy'); // a response is running: no countdown
    vi.advanceTimersByTime(5000); expect(nudgeKinds()).toHaveLength(0);
    done('busy'); // finished but audio still playing
    feed({ type: 'output_audio_buffer.started', response_id: 'busy' });
    vi.advanceTimersByTime(5000); expect(nudgeKinds()).toHaveLength(0);
    // sitting over
    session.memory.passedQuizIds = session.course.phases.reinforcement.quizzes.map((q) => q.id);
    minutes(SITTING.wrapUpMs / 60_000); minutes((SITTING.goodbyeMs - SITTING.wrapUpMs) / 60_000);
    expect(sittingEnds).toBe(1);
    feed({ type: 'output_audio_buffer.stopped', response_id: 'busy' });
    sent.length = 0;
    vi.advanceTimersByTime(60_000); expect(nudgeKinds()).toHaveLength(0);
  });
  it('is off in manual-turn mode', () => {
    make({ manualTurn: true }); open();
    vi.advanceTimersByTime(60_000); expect(nudgeKinds()).toHaveLength(0);
  });
  it('an unfinished assessor does not hold back the nudge', () => {
    open();
    speech('i1'); created('r1'); done('r1'); feed({ type: 'output_audio_buffer.started', response_id: 'r1' }, { type: 'output_audio_buffer.stopped', response_id: 'r1' });
    expect(assessRequests()).toHaveLength(1); // still unsettled
    vi.advanceTimersByTime(1000); expect(nudgeKinds()).toHaveLength(1);
  });
  it('a tap on teach-again counts as the child acting', () => {
    open();
    vi.advanceTimersByTime(1000); answerNudge('n1');
    vi.advanceTimersByTime(1000); answerNudge('n2');
    conversation.repeat('apple');
    const metadata = { ...creates().at(-1)!.response.metadata }; created('rep', metadata); done('rep', [], 'completed', metadata);
    feed({ type: 'output_audio_buffer.started', response_id: 'rep' }, { type: 'output_audio_buffer.stopped', response_id: 'rep' });
    vi.advanceTimersByTime(1000); expect(nudgeKinds()).toHaveLength(3);
  });
});

const open = () => {
  conversation.start(false);
  const metadata = creates().at(-1)!.response.metadata; created('open', { ...metadata }); done('open', [], 'completed', { ...metadata });
  feed({ type: 'output_audio_buffer.started', response_id: 'open' }, { type: 'output_audio_buffer.stopped', response_id: 'open' });
  sent.length = 0;
};
const kinds = () => creates().map((e) => e.response.metadata.kind);
const cancels = () => sent.filter((e) => e.type === 'response.cancel').length;
const finishCourse = () => {
  session.memory.passedQuizIds = session.course.phases.reinforcement.quizzes.map((q) => q.id);
  conversation.changePhase('reinforcement'); conversation.changePhase('done');
};
const minutes = (n: number) => vi.advanceTimersByTime(n * 60_000);

describe('provider auto-interruption', () => {
  it('lets the provider interrupt by itself', () => {
    expect(conversation.sessionConfig('m')).toMatchObject({ audio: { input: { turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true } } } });
  });
  it('discards the tools of a response the provider cancelled for the child, and sends no cancel of its own', () => {
    created('r1');
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'wait' });
    done('r1', [call('show_card', { card_id: 'milk' })], 'cancelled');
    expect(published).toEqual([]); expect(session.memory.currentCardId).toBe('apple'); expect(cancels()).toBe(0);
    feed({ type: 'input_audio_buffer.speech_stopped', item_id: 'wait' }, { type: 'input_audio_buffer.committed', item_id: 'wait' });
    created('answer'); done('answer');
    expect(creates()).toHaveLength(0);
  });
  it('requeues an app request that lost the race to the provider response, but not a tool follow-up', () => {
    conversation.repeat('apple');
    const request = creates()[0];
    feed({ type: 'error', error: { code: 'conversation_already_has_active_response', event_id: request.event_id } });
    created('auto'); done('auto');
    expect(kinds()).toEqual(['repeat', 'repeat']);
  });
});

describe('sitting timing', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('appends a wrap-up message at the first mark without responding or touching the session', () => {
    open(); minutes(SITTING.wrapUpMs / 60_000 - 1); expect(sent).toEqual([]);
    minutes(1);
    const notes = sent.filter((e) => e.type === 'conversation.item.create').map((e) => e.item.content[0].text as string);
    expect(notes).toHaveLength(1); expect(notes[0]).toContain('[app]');
    expect(creates()).toHaveLength(0); expect(sent.some((e) => e.type === 'session.update')).toBe(false); expect(sittingEnds).toBe(0);
  });
  it('with the word battle on, the wrap-up turns the recall game into the battle and tells the browser to show it', () => {
    conversation.close();
    let wrapUps = 0;
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt),
      sittingEnded: () => { sittingEnds++; }, sittingWrapUp: () => { wrapUps++; } }, undefined, { game: true, silence: NO_NUDGE });
    conversation.setPresented({ kind: 'card', id: 'apple' }); sent.length = 0;
    open(); minutes(SITTING.wrapUpMs / 60_000 - 1); expect(wrapUps).toBe(0);
    minutes(1);
    const notes = sent.filter((e) => e.type === 'conversation.item.create').map((e) => e.item.content[0].text as string);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('[app] Time check'); expect(notes[0]).toContain('WORD BATTLE');
    expect(notes[0]).toContain('without saying the English word yourself'); expect(notes[0]).toContain('call end_sitting');
    expect(wrapUps).toBe(1); expect(creates()).toHaveLength(0); expect(sittingEnds).toBe(0);
  });
  it('without the word battle the wrap-up note is unchanged and the browser is not told', () => {
    open(); minutes(SITTING.wrapUpMs / 60_000);
    const note = sent.find((e) => e.type === 'conversation.item.create')!.item.content[0].text as string;
    expect(note).toContain('short recall game'); expect(note).not.toContain('WORD BATTLE');
  });
  it('queues the goodbye at the second mark, ends the sitting once and leaves the phase and progress alone', () => {
    open();
    speech('i1'); assessed('i1'); created('r1'); done('r1', [call('show_card', { card_id: 'milk' })]); created('f1', { ...creates().at(-1)?.response.metadata }); done('f1');
    sent.length = 0;
    minutes(SITTING.goodbyeMs / 60_000);
    expect(kinds()).toEqual(['goodbye']); expect(creates()[0].response.tool_choice).toBe('none'); expect(sittingEnds).toBe(1);
    expect(session.currentPhase).toBe('interactive');
    const row = getCourseProgress(session.courseId, session.learnerId)!;
    expect(row.phase).toBe('interactive'); expect(row.completed).toBe(false); expect(row.snapshot.clearedCardIds).toEqual(['apple']);
    expect(isResumableProgress(row)).toBe(true);
    minutes(30); expect(kinds()).toEqual(['goodbye']); expect(sittingEnds).toBe(1);
  });
  it('sends no assessor request once the sitting ended', () => {
    open(); minutes(SITTING.goodbyeMs / 60_000); sent.length = 0;
    speech('late'); expect(assessRequests()).toHaveLength(0);
  });
  it('does not count paused time', () => {
    open(); minutes(8);
    conversation.setPaused(true); minutes(60); expect(sent.filter((e) => e.type === 'conversation.item.create')).toHaveLength(0);
    conversation.setPaused(false); minutes(1); expect(sent.filter((e) => e.type === 'conversation.item.create')).toHaveLength(0);
    minutes(1); expect(sent.filter((e) => e.type === 'conversation.item.create')).toHaveLength(1);
  });
  it('keeps the goodbye when the child is speaking at the mark', () => {
    open(); minutes(SITTING.wrapUpMs / 60_000);
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'chat' });
    sent.length = 0; minutes((SITTING.goodbyeMs - SITTING.wrapUpMs) / 60_000);
    expect(creates()).toHaveLength(0); expect(sittingEnds).toBe(1);
    feed({ type: 'input_audio_buffer.speech_stopped', item_id: 'chat' }, { type: 'input_audio_buffer.committed', item_id: 'chat' });
    expect(kinds()).toEqual(['goodbye']);
  });
  it('says only the completion goodbye when the course finishes before the marks', () => {
    open(); minutes(3);
    finishCourse();
    expect(kinds()).toEqual(['goodbye']);
    created('bye', { ...creates()[0].response.metadata }); done('bye');
    minutes(30);
    expect(kinds()).toEqual(['goodbye']); expect(sittingEnds).toBe(0);
  });
  it('does not say a second goodbye if the course completes after the sitting ended', () => {
    open(); minutes(SITTING.goodbyeMs / 60_000);
    finishCourse();
    expect(kinds()).toEqual(['goodbye']);
  });
  describe('end_sitting', () => {
    const endCall = () => call('end_sitting', {});
    it('is rejected before the wrap-up time check and changes nothing', () => {
      open(); speech('i1'); created('r1'); sent.length = 0;
      done('r1', [endCall()]);
      expect(outputs()[0]).toMatchObject({ ok: false, error: 'SITTING_NOT_ENDING' });
      expect(sittingEnds).toBe(0);
      // The rejection is an ordinary tool result: the model gets its normal follow-up and no goodbye is queued.
      expect(kinds()).toEqual(['followup']);
      minutes(SITTING.wrapUpMs / 60_000);
      expect(kinds()).toEqual(['followup']);
    });
    it('after the wrap-up queues exactly one goodbye, ends the sitting and sends no tool follow-up', () => {
      open(); minutes(SITTING.wrapUpMs / 60_000);
      speech('i1'); created('r1'); sent.length = 0;
      done('r1', [endCall()]);
      expect(outputs()[0]).toMatchObject({ ok: true });
      expect(sittingEnds).toBe(1); expect(kinds()).toEqual(['goodbye']); expect(creates()[0].response.tool_choice).toBe('none');
      created('bye', { ...creates()[0].response.metadata }); done('bye');
      expect(kinds()).toEqual(['goodbye']);
      minutes(30); expect(kinds()).toEqual(['goodbye']); expect(sittingEnds).toBe(1);
      expect(session.currentPhase).toBe('interactive');
    });
    it('keeps the goodbye through child speech that starts right after the call', () => {
      open(); minutes(SITTING.wrapUpMs / 60_000);
      speech('i1'); created('r1'); sent.length = 0;
      feed({ type: 'input_audio_buffer.speech_started', item_id: 'late' });
      done('r1', [endCall()]);
      expect(sittingEnds).toBe(1); expect(creates()).toHaveLength(0);
      feed({ type: 'input_audio_buffer.speech_stopped', item_id: 'late' }, { type: 'input_audio_buffer.committed', item_id: 'late' });
      expect(kinds()).toEqual(['goodbye']);
    });
    it('is not executed from a response the child cancelled', () => {
      open(); minutes(SITTING.wrapUpMs / 60_000);
      created('r1'); feed({ type: 'input_audio_buffer.speech_started', item_id: 'wait' });
      done('r1', [endCall()], 'cancelled');
      expect(sittingEnds).toBe(0);
    });
    it('is rejected once the sitting already ended at the deadline', () => {
      open(); minutes(SITTING.goodbyeMs / 60_000);
      created('bye', { ...creates().at(-1)?.response.metadata }); done('bye');
      sent.length = 0;
      speech('i1'); created('r1'); done('r1', [endCall()]);
      expect(outputs()[0]).toMatchObject({ ok: false, error: 'SITTING_NOT_ENDING' });
      expect(sittingEnds).toBe(1);
    });
    it('leaves the deadline with nothing to do after the tool ended the sitting', () => {
      open(); minutes(SITTING.wrapUpMs / 60_000);
      speech('i1'); created('r1'); done('r1', [endCall()]);
      created('bye', { ...creates().at(-1)?.response.metadata }); done('bye'); sent.length = 0;
      minutes(SITTING.goodbyeMs / 60_000);
      expect(creates()).toHaveLength(0); expect(sittingEnds).toBe(1);
    });
    it('loses to course completion that happened first', () => {
      open(); minutes(SITTING.wrapUpMs / 60_000);
      finishCourse(); expect(kinds()).toEqual(['goodbye']);
      speech('i1'); created('r1'); done('r1', [endCall()]);
      expect(outputs().at(-1)).toMatchObject({ ok: false, error: 'SITTING_NOT_ENDING' });
      expect(sittingEnds).toBe(0); expect(kinds()).toEqual(['goodbye']);
    });
    it('is part of the fixed tool list and the wrap-up note names it', () => {
      const config = conversation.sessionConfig('m') as { tools: Array<{ name: string }> };
      expect(config.tools.map((t) => t.name)).toContain('end_sitting');
      open(); minutes(SITTING.wrapUpMs / 60_000);
      expect(sent.find((e) => e.type === 'conversation.item.create')!.item.content[0].text).toContain('end_sitting');
    });
  });
});

describe('opening note', () => {
  it('lists earlier passed words and asks for recall when resuming', () => {
    session.memory.clearedCardIds = ['apple', 'milk']; sent.length = 0;
    conversation.start(true);
    const note = sent.find((e) => e.type === 'conversation.item.create' && e.item.content[0].text.includes('back to continue'))?.item.content[0].text as string;
    expect(note).toContain('"apple"'); expect(note).toContain('"milk"'); expect(note.toLowerCase()).toContain('recall');
  });
  it('has no recall request on a first sitting', () => {
    conversation.start(false);
    const note = sent.find((e) => e.type === 'conversation.item.create' && e.item.content[0].text.startsWith('[app] Lesson started'))?.item.content[0].text as string;
    expect(note).toBeTruthy(); expect(note.toLowerCase()).not.toContain('recall');
  });
  it('states remaining words as course-wide and does not demand teaching them all now', () => {
    conversation.setPresented({ kind: 'card', id: 'milk' });
    expect(states().at(-1)).toContain('WHOLE course'); expect(states().at(-1)).not.toContain('teach each');
  });
});

describe('experimental manual-turn mode (server VAD off)', () => {
  let clearOutputs: number;
  const types = () => sent.map((e) => e.type as string);
  const count = (type: string) => sent.filter((e) => e.type === type).length;
  beforeEach(() => {
    vi.useFakeTimers();
    conversation.close(); clearOutputs = 0;
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt),
      sittingEnded: () => { sittingEnds++; }, clearOutput: () => { clearOutputs++; } }, SITTING, { manualTurn: true });
    conversation.setPresented({ kind: 'card', id: 'apple' });
    sent.length = 0;
  });
  afterEach(() => { vi.useRealTimers(); });
  const teacherSpeaks = (id = 'r0') => { created(id); feed({ type: 'output_audio_buffer.started' }); };
  const teacherDone = (id = 'r0') => { done(id); };
  const stopped = () => feed({ type: 'output_audio_buffer.stopped' });
  const committedItem = (item: string) => feed({ type: 'input_audio_buffer.committed', item_id: item });
  const endSpeech = () => { conversation.childSpeech('end'); vi.advanceTimersByTime(MANUAL_TURN.commitAfterSilenceMs); };

  it('tells the teacher the word-battle rules only when the call started with the game on, in the fixed instructions', () => {
    const text = (c: NaturalConversation) => (c.sessionConfig('m') as { instructions: string }).instructions;
    const port = { send: () => {}, publish: () => {}, sittingEnded: () => {} };
    expect(text(new NaturalConversation(session, port))).not.toContain('WORD BATTLE');
    const game = text(new NaturalConversation(session, port, undefined, { game: true }));
    expect(game).toContain(GAME_RULES);
    expect(game).toContain('lands as a bigger spell');
    expect(game).toContain('The battle comes only at the end');
    expect(game.startsWith(text(new NaturalConversation(session, port)))).toBe(true); // appended, the rest is untouched
  });
  it('turns provider VAD off only in manual mode', () => {
    const config = (c: NaturalConversation) => (c.sessionConfig('m') as { audio: { input: { turn_detection: unknown } } }).audio.input.turn_detection;
    expect(config(conversation)).toBeNull();
    const auto = new NaturalConversation(session, { send: () => {}, publish: () => {}, sittingEnded: () => {} });
    expect(config(auto)).toMatchObject({ type: 'semantic_vad', interrupt_response: true });
    expect(() => auto.childSpeech('start')).toThrow('NOT_FOUND');
  });
  it('commits and answers immediately when the teacher is idle, binding the item to the target captured at start', () => {
    conversation.childSpeech('start');
    conversation.setPresented({ kind: 'card', id: 'milk' }); // screen changes while the child is talking
    sent.length = 0;
    endSpeech();
    expect(types()).toEqual(['input_audio_buffer.commit']);
    committedItem('i1');
    expect(creates()).toHaveLength(1); expect(creates()[0].response.metadata).toMatchObject({ kind: 'commit' });
    // One assessor request, bound to the target captured at speech start (apple), next to the commit response.
    expect(assessRequests()).toHaveLength(1);
    expect(assessRequests()[0].response.metadata.input).toBe('i1');
    expect(assessRequests()[0].response.instructions).toContain('card apple,');
    created('r1', { ...creates()[0].response.metadata }); done('r1');
    assessed('i1');
    expect(published.at(-1)?.assessment).toMatchObject({ target_id: 'apple' }); expect(attempts('apple')).toBe(1);
  });
  it('lets a short echo finish without stopping the teacher, then answers it once the teacher is idle', () => {
    teacherSpeaks(); conversation.childSpeech('start');
    vi.advanceTimersByTime(500); endSpeech();
    vi.advanceTimersByTime(5000);
    expect(types()).not.toContain('response.cancel'); expect(types()).not.toContain('output_audio_buffer.clear'); expect(types()).not.toContain('input_audio_buffer.commit');
    teacherDone(); // generation finished, audio still draining
    expect(types()).not.toContain('input_audio_buffer.commit');
    stopped();
    expect(count('input_audio_buffer.commit')).toBe(1); expect(creates()).toHaveLength(0);
    committedItem('i1'); expect(creates()).toHaveLength(1);
    expect(sent.map((e) => e.type)).toEqual(expect.arrayContaining(['input_audio_buffer.commit', 'response.create']));
  });
  it('stops the teacher when speech lasts past the overlap threshold, cancelling only an active response', () => {
    teacherSpeaks(); conversation.childSpeech('start');
    vi.advanceTimersByTime(1499); expect(types()).not.toContain('output_audio_buffer.clear');
    vi.advanceTimersByTime(1);
    expect(types().slice(-2)).toEqual(['response.cancel', 'output_audio_buffer.clear']);
    feed({ type: 'output_audio_buffer.cleared' }); done('r0', [], 'cancelled');
    vi.advanceTimersByTime(5000); expect(clearOutputs).toBe(0);
    endSpeech(); expect(count('input_audio_buffer.commit')).toBe(1);
    // Teacher audio only (response already finished): no cancel is sent, the clear still is.
    sent.length = 0; committedItem('i1'); created('r1', { ...creates()[0].response.metadata }); done('r1'); feed({ type: 'output_audio_buffer.started' }); sent.length = 0;
    conversation.childSpeech('start'); vi.advanceTimersByTime(1500);
    expect(types()).toEqual(['output_audio_buffer.clear']);
  });
  it('asks the browser to clear when the sideband clear is not confirmed within a second', () => {
    teacherSpeaks(); conversation.childSpeech('start'); vi.advanceTimersByTime(1500);
    vi.advanceTimersByTime(999); expect(clearOutputs).toBe(0);
    vi.advanceTimersByTime(1); expect(clearOutputs).toBe(1);
  });
  it('answers speech that ends while the teacher is idle right away and never clears between start and commit', () => {
    conversation.start(false); created('open', { ...creates()[0].response.metadata }); done('open'); sent.length = 0;
    vi.advanceTimersByTime(2000); expect(count('input_audio_buffer.clear')).toBe(1);
    conversation.childSpeech('start'); sent.length = 0;
    vi.advanceTimersByTime(10_000); expect(count('input_audio_buffer.clear')).toBe(0);
    endSpeech(); expect(types()).toEqual(['input_audio_buffer.commit']);
    vi.advanceTimersByTime(4000); expect(count('input_audio_buffer.clear')).toBe(0); // commit in flight
    committedItem('i1'); created('r1', { ...creates()[0].response.metadata }); done('r1'); sent.length = 0;
    vi.advanceTimersByTime(2000); expect(count('input_audio_buffer.clear')).toBe(1);
  });
  it('does not clear the input while a finished turn waits for the teacher', () => {
    teacherSpeaks(); conversation.childSpeech('start'); endSpeech(); sent.length = 0;
    conversation.start(false); sent.length = 0; // opening is held behind the pending turn, hygiene timer starts
    vi.advanceTimersByTime(6000); expect(count('input_audio_buffer.clear')).toBe(0);
  });
  it('commits anyway when the teacher never reports idle', () => {
    teacherSpeaks(); conversation.childSpeech('start'); endSpeech(); teacherDone();
    vi.advanceTimersByTime(14_999); expect(count('input_audio_buffer.commit')).toBe(0);
    vi.advanceTimersByTime(1); expect(count('input_audio_buffer.commit')).toBe(1);
  });
  it('drops queued chatty requests at speech start and keeps the pending turn ahead of queued app speech', () => {
    teacherSpeaks(); conversation.repeat('apple'); conversation.childSpeech('start'); endSpeech();
    teacherDone(); stopped();
    expect(count('input_audio_buffer.commit')).toBe(1); committedItem('i1');
    expect(creates().map((c) => c.response.metadata.kind)).toEqual(['commit']);
  });
  it('waits commitAfterSilenceMs after end before committing', () => {
    conversation.childSpeech('start'); sent.length = 0;
    conversation.childSpeech('end', 600);
    vi.advanceTimersByTime(MANUAL_TURN.commitAfterSilenceMs - 1); expect(count('input_audio_buffer.commit')).toBe(0);
    vi.advanceTimersByTime(1); expect(count('input_audio_buffer.commit')).toBe(1);
  });
  it('treats a start inside the pause window as the same turn: one commit, target from the first start', () => {
    conversation.childSpeech('start');
    conversation.setPresented({ kind: 'card', id: 'milk' });
    conversation.childSpeech('end', 500); vi.advanceTimersByTime(MANUAL_TURN.commitAfterSilenceMs - 100);
    conversation.childSpeech('start'); vi.advanceTimersByTime(5000);
    expect(count('input_audio_buffer.commit')).toBe(0); // still talking, window cancelled
    sent.length = 0; endSpeech();
    expect(types()).toEqual(['input_audio_buffer.commit']);
    committedItem('i1'); created('r1', { ...creates()[0].response.metadata }); done('r1');
    expect(assessRequests()).toHaveLength(1);
    assessed('i1');
    expect(attempts('apple')).toBe(1);
  });
  it('keeps the overlap clock on voiced time across small gaps, so sustained talk still interrupts', () => {
    teacherSpeaks(); conversation.childSpeech('start');
    vi.advanceTimersByTime(800); conversation.childSpeech('end', 700); // 700 ms voiced, 100 ms hangover
    vi.advanceTimersByTime(400); expect(types()).not.toContain('output_audio_buffer.clear');
    conversation.childSpeech('start'); // continues inside the window
    vi.advanceTimersByTime(799); expect(types()).not.toContain('output_audio_buffer.clear');
    vi.advanceTimersByTime(1); // 700 + 800 = 1500 ms voiced
    expect(types().slice(-2)).toEqual(['response.cancel', 'output_audio_buffer.clear']);
  });
  it('does not count silence in the pause window toward an interruption', () => {
    teacherSpeaks(); conversation.childSpeech('start');
    vi.advanceTimersByTime(600); conversation.childSpeech('end', 500);
    vi.advanceTimersByTime(MANUAL_TURN.commitAfterSilenceMs - 1);
    expect(types()).not.toContain('output_audio_buffer.clear');
    vi.advanceTimersByTime(1); vi.advanceTimersByTime(3000);
    expect(types()).not.toContain('output_audio_buffer.clear'); expect(types()).not.toContain('response.cancel');
  });
});

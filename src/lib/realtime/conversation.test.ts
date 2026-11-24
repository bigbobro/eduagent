import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { instrumentsCourse } from '@/data/courses/instruments';
import { actionsCourse } from '@/data/courses/actions';
import { createSession } from '@/lib/agent/session';
import { sessionStore, type Session } from '@/lib/agent/session-store';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { summarizeRealtimeUsage } from './usage';
import { changePhase, type TeachingReceipt } from './teaching';
import { getCourseProgress } from '@/lib/db/queries';
import { isResumableProgress } from '@/lib/agent/course-progress';
import { GAME_RULES, MANUAL_TURN, NaturalConversation, SILENCE, SITTING, SOUND_CUE_MS, type ProviderMessage } from './conversation';

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
  teacherSpoke();

  conversation.setPresented({ kind: 'card', id: 'apple' });
  sent.length = 0;
});
afterEach(() => { conversation.close(); session.lifetime.abort(); sessionStore.delete(session.id); });

const feed = (...events: ProviderMessage[]) => events.forEach((event) => conversation.handle(event));
const teacherSpoke = () => feed({ type: 'output_audio_buffer.started' }, { type: 'output_audio_buffer.stopped' });
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
const appNotes = () => sent.filter((e) => e.type === 'conversation.item.create' && e.item.type === 'message' && /^\[app\] (Heard:|The child's last 3 messages|The child has now said|The child has tried|The child has answered)/.test(e.item.content[0].text)).map((e) => e.item.content[0].text as string);
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
    expect(getDb().prepare('SELECT tools FROM realtime_responses WHERE lesson_id = ? AND kind = ?').get(session.id, 'assess')).toEqual({ tools: `record_assessment(${quiz.id})` });
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
  it('tells the teacher to model a word first when the shown card is a word the child has never said correctly', () => {
    const note = (id: string, card_id: string) => { created(id); done(id, [call('show_card', { card_id })]); return outputs().at(-1).note as string; };
    expect(note('r1', 'milk')).toContain('never said this word correctly');
    session.memory.wordPerformance.set('milk', { attempts: 9, correct: 0, lastAttempt: new Date() }); // tried in an earlier sitting, never right
    expect(note('r2', 'milk')).toContain('never said this word correctly');
    session.memory.wordPerformance.set('milk', { attempts: 10, correct: 1, lastAttempt: new Date() });
    expect(note('r3', 'milk')).toBe('The screen now shows this card.');
    expect(note('r4', 'sentence_apple')).toBe('The screen now shows this card.');
    expect(conversation.sessionConfig('m')).toMatchObject({ instructions: expect.stringContaining('NEW WORDS: a word the child has never said correctly') });
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
    expect(appNotes()).toEqual([`[app] Heard: on the card apple the app judged the child's last answer as correct (heard "i1").`]);
  });
  it('assesses and saves the whole sentence when its course sentence card is on screen', () => {
    const card = foodCourse.cards.find((c) => c.id === 'sentence_apple')!;
    conversation.setPresented({ kind: 'card', id: card.id });
    speech('sentence-card');
    expect(assessRequests()[0].response.instructions).toContain(`card ${card.id}, the English sentence "${card.english}"`);
    assessed('sentence-card', { heard: card.english, mastered: false });
    expect(published.at(-1)?.assessment).toMatchObject({ target_id: card.id, heard: card.english, result: 'correct' });
    const rows = getDb().prepare('SELECT user_input, model_calls FROM interaction_logs WHERE lesson_id = ?').all(session.id) as Array<{ user_input: string; model_calls: string }>;
    expect(rows).toHaveLength(1); expect(rows[0].user_input).toBe(card.english);
    expect(JSON.parse(rows[0].model_calls).assessment).toMatchObject({ target_id: card.id, result: 'correct' });
    expect(appNotes()).toEqual([`[app] Heard: on the card ${card.english} the app judged the child's last answer as correct (heard ${JSON.stringify(card.english)}).`]);
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
    teacherSpoke();

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
      expect(appNotes()).toEqual([]);
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
      expect(appNotes()).toEqual([]);
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
    expect(rows()[0]).toMatchObject({ kind: 'assess', status: 'completed', tools: 'record_assessment(apple)' });
    expect(JSON.parse(rows()[0].text)).toMatchObject({ result: 'correct', heard: 'ap-ple', mastered: true });
    speech('i2'); settle('i2', [], 'cancelled');
    expect(rows()[1]).toMatchObject({ status: 'cancelled', text: '', tools: '' });
  });
  it('stores only the tool name for an assessor response without a bound input', () => {
    done('unbound-assessor', [call('record_assessment', { result: 'not_attempt', heard: 'hi' })], 'completed', { kind: 'assess', input: 'missing' });
    expect(getDb().prepare('SELECT tools FROM realtime_responses WHERE lesson_id = ?').get(session.id)).toEqual({ tools: 'record_assessment' });
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
  it('gives the teacher only show_card, play_sound, start_practice and end_sitting', () => {
    const config = conversation.sessionConfig('m') as { tools: Array<{ name: string }> };
    expect(config.tools.map((t) => t.name)).toEqual(['show_card', 'play_sound', 'start_practice', 'end_sitting']);
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
  it('keeps answer correctness separate from recall in both assessor instructions and the tool description', () => {
    speech('i1');
    const response = assessRequests()[0].response;
    expect(response.instructions).toContain('A complete echo is correct with mastered=false');
    expect(response.instructions).toContain('an unaided recall is correct with mastered=true');
    expect(response.instructions).toContain('a syllable missing from a multisyllabic word');
    expect(response.instructions).toContain('Never lower result because the answer was an echo, a choice or prompted.');
    expect(response.tools[0].parameters.properties.result.description).toContain('close = only part of the word was said');
    expect(response.tools[0].parameters.properties.result.description).toContain('Whether it was an echo or unaided recall never changes result; that belongs in mastered.');
  });
  it.each([
    ['with audio timestamps', 1000, 1600, 600, 4000],
    ['without audio timestamps', undefined, undefined, 4600, 0],
    ['without the audio start timestamp', undefined, 1600, 4600, 0],
    ['without the audio end timestamp', 1000, undefined, 4600, 0],
    ['when the estimated audio end is later than arrival', 1000, 6000, 5000, 0],
  ] as const)('logs child speech duration and nonnegative VAD wait %s', (_name, startMs, endMs, durationMs, vadWaitMs) => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    try {
      feed({ type: 'input_audio_buffer.speech_started', item_id: 'i1', audio_start_ms: startMs });
      clock.mockReturnValue(14_600);
      feed({ type: 'input_audio_buffer.speech_stopped', item_id: 'i1', audio_end_ms: endMs });
      expect(info).toHaveBeenCalledWith('child speech', expect.objectContaining({ sessionId: session.id, durationMs, vadWaitMs }));
    } finally { info.mockRestore(); clock.mockRestore(); }
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
    expect(rows()[2]).toMatchObject({ status: 'completed', text: 'Well done', tools: 'show_card(milk)' });
  });
  it('stores known show_card IDs and masks unknown, missing or malformed arguments, including cancelled tool calls', () => {
    const toolCalls = [
      call('show_card', { card_id: 'milk' }),
      call('show_card', { card_id: 'private-untrusted-text' }),
      call('show_card', {}),
      { ...call('show_card', {}), arguments: '{invalid' },
      { ...call('show_card', {}), arguments: 'null' },
      call('start_practice', {}), call('end_sitting', {}),
    ];
    created('tools'); done('tools', toolCalls, 'cancelled');
    expect(getDb().prepare('SELECT tools FROM realtime_responses WHERE lesson_id = ?').get(session.id)).toEqual({
      tools: 'show_card(milk),show_card(?),show_card(?),show_card(?),show_card(?),start_practice,end_sitting',
    });
    expect(session.memory.currentCardId).toBe('apple');
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

describe('app assessment notes to the teacher', () => {
  const notAttempt = (input: string) => { speech(input); assessed(input, { result: 'not_attempt', mastered: false }); };
  const mismatches = () => appNotes().filter((text) => text.startsWith("[app] The child's last 3 messages"));
  it.each(['correct', 'close', 'wrong'])('writes a %s verdict immediately between responses, quoting at most 80 heard characters', (result) => {
    const heard = 'a"\n'.repeat(30);
    speech('i1'); assessed('i1', { result, heard, mastered: false });
    expect(appNotes().filter((text) => text.startsWith('[app] Heard:'))).toEqual([`[app] Heard: on the card apple the app judged the child's last answer as ${result} (heard ${JSON.stringify(heard.slice(0, 80))}).`]);
    const note = sent.find((event) => event.item?.content?.[0]?.text === appNotes()[0]);
    expect(note?.item).toMatchObject({ type: 'message', role: 'system', content: [{ type: 'input_text' }] });
    expect(creates()).toEqual([]);
  });
  it.each(['completed', 'cancelled'])('holds verdicts until all teacher responses settle (%s), keeping only the latest', (status) => {
    created('r1'); created('r2');
    speech('i1'); assessed('i1', { result: 'wrong', mastered: false });
    speech('i2'); assessed('i2', { result: 'close', mastered: false });
    expect(appNotes()).toEqual([]);
    done('r1', [], status); expect(appNotes()).toEqual([]);
    done('r2', [], status);
    expect(appNotes()).toEqual([`[app] Heard: on the card apple the app judged the child's last answer as close (heard "i2").`]);
    created('r3'); done('r3'); expect(appNotes()).toHaveLength(1);
  });
  it('writes not_attempt even when state did not change or no attempt was saved', () => {
    notAttempt('再说一次');
    expect(appNotes()).toEqual([`[app] Heard: the child's last message was not a try at the screen card apple (heard "再说一次").`]);
    expect(states()).toEqual([]); expect(published).toEqual([]);
  });
  it('does not write verdicts or mismatch reminders for practice question targets', () => {
    changePhase(session, 'reinforcement'); conversation.setPresented({ kind: 'quiz', id: 'q5' });
    for (let i = 1; i <= 3; i++) notAttempt(`chat${i}`);
    speech('sentence'); assessed('sentence', { heard: 'This is an apple.', mastered: false });
    expect(published.at(-1)?.quiz).toMatchObject({ quizId: 'q5', correct: true });
    expect(appNotes()).toEqual([]);
  });
  it('writes nothing for failed assessments and writes only the successful retry verdict', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      speech('failed'); settle('failed', [], 'failed'); settle('failed', [], 'failed');
      expect(appNotes()).toEqual([]);
      speech('retried'); assessed('retried', { result: 'not_attempt' }, 'cancelled');
      expect(appNotes()).toEqual([]);
      assessed('retried', { result: 'close', mastered: false });
      expect(appNotes()).toEqual([`[app] Heard: on the card apple the app judged the child's last answer as close (heard "retried").`]);
      notAttempt('chat1'); notAttempt('chat2'); expect(mismatches()).toEqual([]);
    } finally { warning.mockRestore(); }
  });
  it('writes the third consecutive not_attempt reminder once, after the latest verdict, between responses', () => {
    notAttempt('chat1'); notAttempt('chat2');
    expect(mismatches()).toEqual([]);
    created('r1'); notAttempt('chat3'); notAttempt('chat4');
    expect(mismatches()).toEqual([]); expect(appNotes()).toHaveLength(2);
    done('r1');
    expect(appNotes().slice(2)).toEqual([
      `[app] Heard: the child's last message was not a try at the screen card apple (heard "chat4").`,
      `[app] The child's last 3 messages were not tries at the screen card apple. If you are practising a different word or one of the course sentences, first put that card on the screen with show_card so the screen matches what you ask; otherwise come back to the screen card.`,
    ]);
    notAttempt('chat5'); expect(mismatches()).toHaveLength(1);
  });
  it.each(['correct', 'close', 'wrong'])('starts a new not_attempt streak after %s', (result) => {
    notAttempt('chat1'); notAttempt('chat2'); notAttempt('chat3');
    speech('try'); assessed('try', { result, mastered: false });
    notAttempt('chat4'); notAttempt('chat5'); expect(mismatches()).toHaveLength(1);
    notAttempt('chat6'); expect(mismatches()).toHaveLength(2);
  });
  it('starts a new streak when the bound course card changes', () => {
    notAttempt('apple1'); notAttempt('apple2');
    conversation.setPresented({ kind: 'card', id: 'milk' });
    notAttempt('milk1'); notAttempt('milk2'); expect(mismatches()).toEqual([]);
    notAttempt('milk3'); expect(mismatches()).toHaveLength(1); expect(mismatches()[0]).toContain('screen card milk.');
    conversation.setPresented({ kind: 'card', id: 'apple' });
    notAttempt('apple3'); notAttempt('apple4'); expect(mismatches()).toHaveLength(1);
    notAttempt('apple5'); expect(mismatches()).toHaveLength(2);
  });
  it('does not carry a streak into a new call', () => {
    notAttempt('chat1'); notAttempt('chat2'); conversation.close();
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt), sittingEnded: () => {} });
    teacherSpoke();

    conversation.setPresented({ kind: 'card', id: 'apple' });
    notAttempt('chat3'); expect(mismatches()).toEqual([]);
    notAttempt('chat4'); notAttempt('chat5'); expect(mismatches()).toHaveLength(1);
  });
  it('logs each written app note with only its safe result or streak count', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    try {
      created('r1'); notAttempt('private speech1'); notAttempt('private speech2'); notAttempt('private speech3');
      expect(info.mock.calls.filter(([message]) => message === 'app note')).toEqual([]);
      done('r1');
      expect(info.mock.calls.filter(([message]) => message === 'app note')).toEqual([
        ['app note', { module: 'realtime-conversation', sessionId: session.id, kind: 'verdict', result: 'not_attempt' }],
        ['app note', { module: 'realtime-conversation', sessionId: session.id, kind: 'mismatch', count: 3 }],
      ]);
    } finally { info.mockRestore(); }
  });
  it('keeps the screen, sentence and verdict rules in the fixed prompt without any session.update', () => {
    const instructions = () => (conversation.sessionConfig('m') as { instructions: string }).instructions;
    const fixed = instructions();
    expect(fixed).toContain('SCREEN FIRST: the app judges every answer against the card on the screen, and the child is looking at that card.');
    expect(fixed).toContain('Before you ask for anything else (an earlier word to recall, another word from the same situation, a course sentence), put that card on the screen with show_card in that same turn and ask after its result.');
    expect(fixed).toContain('Never ask for one word while another card is showing.');
    expect(fixed).toContain('Mentioning other words while you explain or set a scene is fine; asking the child to say them is not.');
    expect(fixed).toContain('SENTENCES: The course\'s target sentences have their own cards (kind "sentence" in the learning targets).');
    expect(fixed).toContain('To practise one as a whole sentence, show its sentence card first (see SCREEN FIRST), then model it and invite it.');
    expect(fixed).toContain('A child who puts the screen word into a sentence of their own is welcome and needs no correction of the rest of that sentence.');
    expect(fixed).toContain('never ask the child to repeat it in full or to fix its small words.');
    expect(fixed).toContain('This holds only while words remain: when [app] State shows no words left to pass in the whole course, do not keep recalling them; call start_practice right away, whatever the time.');
    expect(fixed.indexOf('and bring in the course\'s target sentences.')).toBeLessThan(fixed.indexOf('This holds only while words remain:'));
    expect(fixed.indexOf('This holds only while words remain:')).toBeLessThan(fixed.indexOf('When an [app] message says the time is nearly up'));
    expect(fixed).toContain('Show the card of each word you ask them to recall first (see SCREEN FIRST).');
    expect(fixed.indexOf('Recall answers do not remove a passed word.')).toBeLessThan(fixed.indexOf('Show the card of each word you ask them to recall first (see SCREEN FIRST).'));
    expect(fixed.indexOf('Show the card of each word you ask them to recall first (see SCREEN FIRST).')).toBeLessThan(fixed.indexOf('SUMMARY:'));
    expect(fixed).toContain("APP VERDICT: an [app] Heard message describes the child's previous answer, not the new answer");
    expect(fixed).toContain('Judge the new answer by what you hear yourself.');
    expect(fixed).toContain('Do not go back to comment on a card that has already been replaced');
    expect(fixed).toContain('Talk to the child in Chinese. English is only what the child is learning: the course target words and target sentences, and a short English model around a target word when it helps the meaning.');
    expect(fixed).toContain('Never use English for praise, transitions, instructions, hints or saying what you will do next.');
    expect(fixed).toContain('These examples are written in English only for brevity: ask them in Chinese around the English word ("小狗在 run 还是 sleep？").');
    expect(fixed).toContain('Use it silently for your next move on that card: if it judged the answer correct, do not ask the child to fix that word again; if it judged it close, wrong or not a try, do not treat the word as done.');
    expect(fixed).toContain('Never read the message aloud or mention it.');
    expect(fixed.indexOf('NO BOOKKEEPING TALK:')).toBeLessThan(fixed.indexOf('SCREEN FIRST:'));
    expect(fixed.indexOf('SCREEN FIRST:')).toBeLessThan(fixed.indexOf('SENTENCES:'));
    expect(fixed.indexOf('SENTENCES:')).toBeLessThan(fixed.indexOf('APP VERDICT:'));
    expect(fixed.indexOf('APP VERDICT:')).toBeLessThan(fixed.indexOf('TOOL RECOVERY:'));
    notAttempt('chat1'); notAttempt('chat2'); notAttempt('chat3');
    speech('try'); assessed('try', { mastered: false });
    expect(instructions()).toBe(fixed); expect(sent.some((event) => event.type === 'session.update')).toBe(false);
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
  it('disables follow-up tools when every call successfully shows a card', () => {
    created('r1'); done('r1', [call('show_card', { card_id: 'milk' }), call('show_card', { card_id: 'apple' })]);
    expect(creates().at(-1)?.response.tool_choice).toBe('none');
  });
  it.each(['rejected', 'start_practice', 'mixed'])('keeps follow-up tools for %s calls', (scenario) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      created('r1');
      const calls = scenario === 'start_practice' ? [call('start_practice', {})]
        : scenario === 'mixed' ? [call('show_card', { card_id: 'milk' }), call('start_practice', {})]
        : [call('show_card', { card_id: 'missing' })];
      done('r1', calls);
      expect(creates().at(-1)?.response.tool_choice).toBeUndefined();
    } finally { warning.mockRestore(); }
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
    teacherSpoke();

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
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(logger, 'info').mockImplementation(() => {}); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it('appends a wrap-up message at the first mark without responding or touching the session', () => {
    open(); minutes(SITTING.wrapUpMs / 60_000 - 1); expect(sent).toEqual([]);
    minutes(1);
    const notes = sent.filter((e) => e.type === 'conversation.item.create').map((e) => e.item.content[0].text as string);
    expect(notes).toHaveLength(1); expect(notes[0]).toContain('[app]');
    expect(creates()).toHaveLength(0); expect(sent.some((e) => e.type === 'session.update')).toBe(false); expect(sittingEnds).toBe(0);
  });
  it('with the word battle on, waits for the first successful show_card and publishes that card before starting once', () => {
    conversation.close();
    let wrapUps = 0; const order: string[] = [];
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => { published.push(receipt); order.push('card'); },
      sittingEnded: () => { sittingEnds++; }, sittingWrapUp: () => { wrapUps++; order.push('battle'); } }, undefined, { game: true, silence: NO_NUDGE });
    teacherSpoke();

    conversation.setPresented({ kind: 'card', id: 'apple' }); sent.length = 0;
    open(); minutes(SITTING.wrapUpMs / 60_000 - 1); expect(wrapUps).toBe(0);
    minutes(1);
    const notes = sent.filter((e) => e.type === 'conversation.item.create').map((e) => e.item.content[0].text as string);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('[app] Time check'); expect(notes[0]).toContain('WORD BATTLE');
    expect(notes[0]).toContain('without saying the English word yourself'); expect(notes[0]).toContain('call end_sitting');
    expect(notes[0]).toContain('in that same turn put the first');
    expect(notes[0]).not.toContain('already switched');
    expect(wrapUps).toBe(0); expect(creates()).toHaveLength(0); expect(sittingEnds).toBe(0);
    speech('before-battle'); assessed('before-battle');
    expect(wrapUps).toBe(0); order.length = 0;
    created('invalid'); done('invalid', [call('show_card', { card_id: 'missing' })]);
    expect(wrapUps).toBe(0);
    expect(logger.info).not.toHaveBeenCalledWith('battle started', expect.anything());
    created('first'); done('first', [call('show_card', { card_id: 'milk' })]);
    expect(order).toEqual(['card', 'battle']); expect(wrapUps).toBe(1);
    expect(outputs().at(-1).note).toBe('The screen now shows this card.'); // battle cards are recall: no model-first note for a never-said word
    expect(logger.info).toHaveBeenCalledWith('battle started', { module: 'realtime-conversation', sessionId: session.id, elapsedMs: SITTING.wrapUpMs });
    created('second'); done('second', [call('show_card', { card_id: 'apple' })]);
    expect(wrapUps).toBe(1);
    expect(vi.mocked(logger.info).mock.calls.filter(([message]) => message === 'battle started')).toHaveLength(1);
  });
  it('logs only saved battle attempts and settles the last in-flight hit before the totals', () => {
    conversation.close();
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt), sittingEnded: () => {} }, SITTING, { game: true, silence: NO_NUDGE });
    teacherSpoke(); conversation.setPresented({ kind: 'card', id: 'apple' });
    open(); speech('teaching'); assessed('teaching'); minutes(SITTING.wrapUpMs / 60_000);
    created('battle'); done('battle', [call('show_card', { card_id: 'milk' })]);
    conversation.setPresented({ kind: 'card', id: 'milk' });
    for (const result of ['close', 'wrong', 'not_attempt', 'correct']) {
      speech(result); assessed(result, { result, mastered: false });
    }
    assessed('correct'); // duplicate must not count
    speech('last-hit'); created('end'); done('end', [call('end_sitting', {})]);
    expect(logger.info).not.toHaveBeenCalledWith('sitting end settled', expect.anything());
    assessed('last-hit');
    expect(logger.info).toHaveBeenCalledWith('sitting end settled', { module: 'realtime-conversation', sessionId: session.id, waitedMs: 0, pending: 1, timedOut: false, battleAttempts: 4, battleCorrect: 2, battleMastered: 1 });
  });
  it.each(['tool', 'deadline'] as const)('never starts a battle if %s ends the sitting without showing a card', (by) => {
    conversation.close(); const wrapUp = vi.fn();
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt),
      sittingEnded: () => { sittingEnds++; }, sittingWrapUp: wrapUp }, undefined, { game: true, silence: NO_NUDGE });
    teacherSpoke();

    open(); minutes(SITTING.wrapUpMs / 60_000);
    if (by === 'tool') { created('end'); done('end', [call('end_sitting', {})]); }
    else minutes((SITTING.goodbyeMs - SITTING.wrapUpMs) / 60_000);
    expect(sittingEnds).toBe(1); expect(wrapUp).not.toHaveBeenCalled();
    created('late'); done('late', [call('show_card', { card_id: 'milk' })]);
    expect(wrapUp).not.toHaveBeenCalled(); expect(published).toEqual([]);
  });
  describe.each(['tool', 'deadline'] as const)('waiting for the last assessment (%s)', (by) => {
    let order: string[];
    beforeEach(() => {
      conversation.close(); order = [];
      conversation = new NaturalConversation(session, { send: (event) => {
        sent.push(event as Record<string, any>);
        if ((event as any).response?.metadata?.kind === 'goodbye') order.push('goodbye');
      }, publish: (receipt) => { published.push(receipt); order.push('receipt'); }, sittingEnded: () => { sittingEnds++; order.push('ended'); } },
      { wrapUpMs: 100, goodbyeMs: 200 }, { silence: NO_NUDGE, assessmentWaitMs: 50 });
      teacherSpoke();
      conversation.setPresented({ kind: 'card', id: 'apple' });
      open(); vi.advanceTimersByTime(100); speech('last');
      if (by === 'tool') { created('end'); done('end', [call('end_sitting', {})]); }
      else vi.advanceTimersByTime(100);
      expect(sittingEnds).toBe(0); expect(kinds()).toEqual([]);
    });
    it('publishes a late hit before sitting-ended and goodbye, without a followup or new teaching', () => {
      vi.advanceTimersByTime(25); speech('too-late');
      expect(assessRequests()).toHaveLength(1);
      created('late-tool'); done('late-tool', [call('show_card', { card_id: 'milk' })]);
      expect(session.memory.currentCardId).toBe('apple'); expect(kinds()).toEqual([]);
      assessed('last');
      expect(order).toEqual(['receipt', 'ended', 'goodbye']);
      expect(logger.info).toHaveBeenCalledWith('sitting end settled', { module: 'realtime-conversation', sessionId: session.id, waitedMs: 25, pending: 1, timedOut: false, battleAttempts: 0, battleCorrect: 0, battleMastered: 0 });
      expect(published.at(-1)?.assessment?.mastered).toBe(true);
      vi.advanceTimersByTime(1000); expect(sittingEnds).toBe(1);
      expect(vi.mocked(logger.info).mock.calls.filter(([message]) => message === 'sitting end settled')).toHaveLength(1);
    });
    it('ends after the injectable bound if the assessment never comes back', () => {
      vi.advanceTimersByTime(49); expect(sittingEnds).toBe(0);
      expect(logger.info).not.toHaveBeenCalledWith('sitting end settled', expect.anything());
      vi.advanceTimersByTime(1); expect(order).toEqual(['ended', 'goodbye']);
      expect(published).toEqual([]); expect(sittingEnds).toBe(1);
      expect(logger.info).toHaveBeenCalledWith('sitting end settled', { module: 'realtime-conversation', sessionId: session.id, waitedMs: 50, pending: 1, timedOut: true, battleAttempts: 0, battleCorrect: 0, battleMastered: 0 });
    });
    it.each(['not_attempt', 'failed', 'error'] as const)('ends as soon as the assessment settles as %s', (how) => {
      if (how === 'error') feed({ type: 'error', error: { code: 'rate_limit_exceeded', event_id: assessRequests()[0].event_id } });
      else if (how === 'failed') settle('last', [], 'failed');
      else assessed('last', { result: 'not_attempt', mastered: false });
      expect(order).toEqual(['ended', 'goodbye']); expect(assessRequests()).toHaveLength(1);
    });
    it('clears the end wait on close', () => {
      conversation.close(); vi.advanceTimersByTime(1000);
      expect(order).toEqual([]); expect(sittingEnds).toBe(0);
    });
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
  it('drops the manual speech turn at the deadline so the goodbye is not blocked by a later ignored end signal', () => {
    conversation.close();
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt),
      sittingEnded: () => { sittingEnds++; } }, { wrapUpMs: 100, goodbyeMs: 200 }, { manualTurn: true });
    teacherSpoke();

    open(); conversation.childSpeech('start'); vi.advanceTimersByTime(200);
    expect(sittingEnds).toBe(1); expect(kinds()).toEqual(['goodbye']);
    conversation.childSpeech('end');
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
      speech('i1'); assessed('i1'); created('r1'); sent.length = 0;
      done('r1', [endCall()]);
      expect(outputs()[0]).toMatchObject({ ok: true });
      expect(sittingEnds).toBe(1); expect(kinds()).toEqual(['goodbye']); expect(creates()[0].response.tool_choice).toBe('none');
      expect(logger.info).toHaveBeenCalledWith('sitting end settled', { module: 'realtime-conversation', sessionId: session.id, waitedMs: 0, pending: 0, timedOut: false, battleAttempts: 0, battleCorrect: 0, battleMastered: 0 });
      created('bye', { ...creates()[0].response.metadata }); done('bye');
      expect(kinds()).toEqual(['goodbye']);
      minutes(30); expect(kinds()).toEqual(['goodbye']); expect(sittingEnds).toBe(1);
      expect(session.currentPhase).toBe('interactive');
    });
    it('keeps the goodbye through child speech that starts right after the call', () => {
      open(); minutes(SITTING.wrapUpMs / 60_000);
      speech('i1'); assessed('i1'); created('r1'); sent.length = 0;
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
      speech('i1'); assessed('i1'); created('r1'); done('r1', [endCall()]);
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

describe('correct echo reminders', () => {
  const echo = (input: string) => { speech(input); assessed(input, { mastered: false, next_action: 'retry' }); };
  const echoes = () => appNotes().filter((text) => text.startsWith('[app] The child has now said'));
  const reminder = (word: string, count: number) => `[app] The child has now said ${word} correctly ${count} times right after your model. Next, do not ask for another echo on this card: ask once with a cue that does not contain the English word (the Chinese meaning or a situation) and stop to listen. Do this only while this card is on screen. If you have already switched cards, finish teaching the card you have, then use show_card to return to this card before asking. If they cannot recall it, give one different kind of help and one more chance; if it still does not come, leave this word for now, move on to another word and come back to it later. Do not tell the child "先停一下" or "待会儿再练"; just show the next card.`;
  it('reminds at 1, 3 and 5 saved correct echoes without mastering or switching the card', () => {
    for (let i = 1; i <= 6; i++) {
      echo(`echo${i}`);
      expect(echoes()).toEqual(Array.from({ length: Math.ceil(i / 2) }, (_, n) => reminder('apple', n * 2 + 1)));
    }
    expect(attempts('apple')).toBe(6); expect(session.memory.clearedCardIds).toEqual([]);
    expect(session.memory.currentCardId).toBe('apple'); expect(creates()).toEqual([]);
    expect(sent.some((event) => event.type === 'session.update')).toBe(false);
  });
  it.each(['completed', 'cancelled'])('waits for every active teacher response to settle (%s), then writes after the verdict', (status) => {
    created('r1'); created('r2'); echo('echo1'); echo('echo2');
    expect(echoes()).toEqual([]);
    done('r1', [], status); expect(echoes()).toEqual([]);
    done('r2', [], status);
    expect(appNotes().slice(-2)).toEqual([
      `[app] Heard: on the card apple the app judged the child's last answer as correct (heard "echo2").`, reminder('apple', 1),
    ]);
    created('r3'); done('r3'); expect(echoes()).toHaveLength(1);
  });
  it('keeps only the latest pending echo reminder, even across cards', () => {
    created('r1');
    for (let i = 1; i <= 4; i++) echo(`apple${i}`);
    conversation.setPresented({ kind: 'card', id: 'milk' }); echo('milk1'); echo('milk2');
    expect(echoes()).toEqual([]); done('r1');
    expect(echoes()).toEqual([reminder('milk', 1)]);
  });
  it('writes verdict, mismatch, then echo, and logs only safe fields when actually written', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    try {
      created('r1'); echo('private1'); echo('private2');
      for (let i = 1; i <= 3; i++) { speech(`chat${i}`); assessed(`chat${i}`, { result: 'not_attempt', mastered: false }); }
      expect(info.mock.calls.filter(([message]) => message === 'app note')).toEqual([]);
      done('r1');
      expect(appNotes()).toHaveLength(3);
      expect(appNotes()[0]).toContain('[app] Heard:'); expect(appNotes()[1]).toContain("The child's last 3 messages");
      expect(appNotes()[2]).toBe(reminder('apple', 1));
      expect(sent.find((event) => event.item?.content?.[0]?.text === reminder('apple', 1))?.item).toMatchObject({ type: 'message', role: 'system', content: [{ type: 'input_text' }] });
      expect(info.mock.calls.filter(([message]) => message === 'app note')).toEqual([
        ['app note', { module: 'realtime-conversation', sessionId: session.id, kind: 'verdict', result: 'not_attempt' }],
        ['app note', { module: 'realtime-conversation', sessionId: session.id, kind: 'mismatch', count: 3 }],
        ['app note', { module: 'realtime-conversation', sessionId: session.id, kind: 'echo', count: 1 }],
      ]);
    } finally { info.mockRestore(); }
  });
  it('retains separate counts when switching away from a card and back', () => {
    echo('apple1'); conversation.setPresented({ kind: 'card', id: 'milk' }); echo('milk1');
    conversation.setPresented({ kind: 'card', id: 'apple' }); echo('apple2');
    expect(echoes()).toEqual([reminder('apple', 1), reminder('milk', 1)]);
    conversation.setPresented({ kind: 'card', id: 'milk' }); echo('milk2');
    expect(echoes()).toEqual([reminder('apple', 1), reminder('milk', 1)]);
  });
  it('ignores sentence cards, not_attempt, close and wrong without resetting the word count', () => {
    echo('apple1');
    const sentence = session.course.cards.find((card) => card.kind === 'sentence')!;
    conversation.setPresented({ kind: 'card', id: sentence.id }); echo('sentence1'); echo('sentence2');
    conversation.setPresented({ kind: 'card', id: 'apple' });
    for (const result of ['not_attempt', 'close', 'wrong']) { speech(result); assessed(result, { result, mastered: false }); }
    expect(echoes()).toEqual([reminder('apple', 1)]); echo('apple2');
    expect(echoes()).toEqual([reminder('apple', 1)]);
  });
  it.each([false, true])('stops after mastery, dropping an unwritten reminder too (pending=%s)', (pending) => {
    if (pending) created('r1');
    echo('echo1'); echo('echo2'); speech('recall'); assessed('recall');
    if (pending) done('r1');
    echo('echo3'); echo('echo4');
    expect(echoes()).toEqual(pending ? [] : [reminder('apple', 1)]);
    expect(session.memory.clearedCardIds).toContain('apple');
  });
  it('starts at zero in a new call despite historical wordPerformance and an earlier call echo', () => {
    session.memory.wordPerformance.set('apple', { attempts: 15, correct: 15, lastAttempt: new Date() });
    echo('previous-call'); conversation.close(); sent.length = 0;
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt), sittingEnded: () => {} });
    teacherSpoke();

    conversation.setPresented({ kind: 'card', id: 'apple' });
    echo('new1'); expect(echoes()).toEqual([reminder('apple', 1)]); echo('new2');
    expect(echoes()).toEqual([reminder('apple', 1)]); expect(attempts('apple')).toBe(18);
  });
  it('counts a duplicated assessment only once and never counts a rejected save', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      echo('echo1');
      settle('echo1', [call('record_assessment', { result: 'correct', heard: 'apple', evidence: 'echo', mastered: false, next_action: 'retry' })], 'completed', '_duplicate');
      speech('rejected'); session.currentPhase = 'done'; assessed('rejected', { mastered: false });
      session.currentPhase = 'interactive'; expect(echoes()).toEqual([reminder('apple', 1)]);
      echo('echo2'); expect(echoes()).toEqual([reminder('apple', 1)]); expect(attempts('apple')).toBe(2);
    } finally { warning.mockRestore(); }
  });
});

const doneNotes = () => appNotes().filter(text => text.startsWith('[app] The child has answered'));

describe('repeated correct card reminders', () => {
  const attempt = (id: string, result = 'correct', mastered = false) => { speech(id); assessed(id, { result, mastered, next_action: 'retry' }); };
  const show = (id: string) => conversation.setPresented({ kind: 'card', id });
  const echoes = () => appNotes().filter(text => text.startsWith('[app] The child has now said'));
  const onlyLeft = (...ids: string[]) => { session.memory.clearedCardIds = session.course.cards.filter(c => !ids.includes(c.id)).map(c => c.id); };
  const head = (english: string, count = 3) => `[app] The child has answered ${english} correctly ${count} times in a row. Do not ask for this card again now. `;
  const tail = ' Never promise to return to a word later unless you do it in this sitting. Do not tell the child "先停一下" or "待会儿再练".';
  const untriedText = (ids: string[]) => `Next turn, use show_card for one of these unpassed words not tried this sitting and teach it: ${JSON.stringify(ids)}.`;
  const retryText = (ids: string[]) => `Next turn, use show_card to go back once to one of these words set aside earlier: ${JSON.stringify(ids)}, with a different kind of help than before; use play_sound only if its ID is eligible in State.`;
  const practiceText = 'Every word left in the course has been tried this sitting and revisited, or none is left: call start_practice now.';
  const otherCardText = 'This sitting has already covered 6 words. Next turn, use show_card for a DIFFERENT card: another word taught this sitting, for recall without your model, or a course sentence card; not this card.';
  const sentence = (n = 3) => { show('sentence_apple'); for (let i = 1; i <= n; i++) attempt('sentence' + i); };

  it.each([['sentence_apple', 'This is an apple.'], ['apple', 'apple']])('writes a reminder every third correct answer on the sentence or passed card %s', (id, english) => {
    session.memory.clearedCardIds = ['apple'];
    show(id);
    for (let n = 1; n <= 7; n++) {
      attempt('try' + n);
      expect(doneNotes()).toHaveLength(Math.floor(n / 3));
    }
    expect(doneNotes()[0]).toContain(head(english, 3)); expect(doneNotes()[1]).toContain(head(english, 6));
  });
  it('on a word not yet passed, waits for 6 in a row: the echo note is sent at 3 and the done note is not', () => {
    for (let n = 1; n <= 3; n++) attempt('echo' + n);
    expect(echoes().at(-1)).toContain('said apple correctly 3 times'); expect(doneNotes()).toEqual([]);
    for (let n = 4; n <= 11; n++) {
      attempt('echo' + n);
      expect(doneNotes()).toHaveLength(n >= 6 ? 1 : 0);
    }
    expect(doneNotes()[0]).toContain(head('apple', 6));
    attempt('echo12'); expect(doneNotes()).toHaveLength(2); expect(doneNotes()[1]).toContain(head('apple', 12));
  });
  it('fires at 3 on a word that passes within the streak', () => {
    attempt('one'); attempt('two'); attempt('three', 'correct', true);
    expect(session.memory.clearedCardIds).toContain('apple'); expect(doneNotes()).toHaveLength(1);
    expect(doneNotes()[0]).toContain(head('apple'));
  });
  it.each(['wrong', 'close', 'not_attempt'])('resets a pending streak on %s and on a card change', result => {
    session.memory.clearedCardIds = ['apple', 'milk'];
    created('busy');
    for (let n = 1; n <= 3; n++) attempt('apple' + n);
    attempt('reset', result); done('busy');
    attempt('again1'); attempt('again2');
    show('milk');
    attempt('milk1'); attempt('milk2'); expect(doneNotes()).toEqual([]);
    attempt('milk3'); expect(doneNotes()[0]).toContain(head('milk'));
  });
  it('A: points to the unpassed words not tried this sitting while fewer than 6 words were tried', () => {
    onlyLeft('apple', 'banana', 'milk', 'egg');
    attempt('apple1', 'wrong'); show('milk'); attempt('milk', 'close'); show('apple'); attempt('apple2', 'close');
    sentence();
    expect(doneNotes()).toEqual([head('This is an apple.') + untriedText(['banana', 'egg']) + tail]);
  });
  it('B: points back to the tried, not yet revisited words', () => {
    onlyLeft('apple', 'milk');
    attempt('apple1', 'wrong'); show('milk'); attempt('milk', 'close');
    sentence();
    expect(doneNotes()).toEqual([head('This is an apple.') + retryText(['apple', 'milk']) + tail]);
  });
  it('B: once 6 words were tried, prefers a return over a new word and never lists the current card', () => {
    for (const id of ['apple', 'banana', 'bread', 'milk', 'egg', 'rice']) { show(id); attempt(id, 'wrong'); }
    session.memory.clearedCardIds = ['rice'];
    show('rice'); for (let n = 1; n <= 3; n++) attempt('rice' + n);
    expect(doneNotes()).toEqual([head('rice') + retryText(['apple', 'banana', 'bread', 'milk', 'egg']) + tail]);
    session.memory.clearedCardIds = [];
    show('egg'); for (let n = 1; n <= 6; n++) attempt('egg' + n);
    expect(doneNotes()[1]).toBe(head('egg', 6) + retryText(['apple', 'banana', 'bread', 'milk', 'rice']) + tail);
  });
  it('C: calls for start_practice once every word left was tried and revisited', () => {
    onlyLeft('apple', 'milk');
    attempt('apple1', 'wrong'); show('milk'); attempt('milk1', 'close');
    show('apple'); attempt('apple2', 'close'); show('milk'); attempt('milk2', 'close');
    sentence();
    expect(doneNotes()).toEqual([head('This is an apple.') + practiceText + tail]);
  });
  it('C: also when no word is left to pass', () => {
    onlyLeft();
    sentence();
    expect(doneNotes()).toEqual([head('This is an apple.') + practiceText + tail]);
  });
  it('D: after 6 words with nothing to return to, asks for a different card instead of new words', () => {
    const six = ['apple', 'banana', 'bread', 'milk', 'egg', 'rice'];
    for (let round = 0; round < 2; round++) for (const id of six) { show(id); attempt(`${id}${round}`, 'wrong'); }
    sentence();
    expect(doneNotes()).toEqual([head('This is an apple.') + otherCardText + tail]);
  });
  it('replays 2026-11-24: bell repeated after harp was set aside points back to harp, then to practice once harp was revisited', () => {
    session.course = instrumentsCourse; onlyLeft('bell', 'harp');
    show('harp'); attempt('hop1', 'close'); attempt('hop2', 'close');
    show('bell'); attempt('bell1', 'correct', true); attempt('bell2'); attempt('bell3');
    expect(doneNotes()).toEqual([head('bell') + retryText(['harp']) + tail]);
    show('harp'); attempt('hop3', 'close');
    show('bell'); for (let n = 4; n <= 6; n++) attempt('bell' + n);
    expect(doneNotes()[1]).toBe(head('bell') + practiceText + tail);
  });
  it('ignores three correct results for a card that has already left the screen', () => {
    session.memory.clearedCardIds = ['apple'];
    for (let n = 1; n <= 3; n++) speech('late' + n);
    show('milk');
    for (let n = 1; n <= 3; n++) assessed('late' + n);
    expect(doneNotes()).toEqual([]);
  });
  it('drops a queued reminder if practice starts before writing', () => {
    session.memory.clearedCardIds = ['apple'];
    created('busy');
    for (let n = 1; n <= 3; n++) attempt('card' + n);
    changePhase(session, 'reinforcement'); done('busy');
    expect(doneNotes()).toEqual([]);
  });
});

describe('reminder boundaries after verification', () => {
  const echoes = () => appNotes().filter((text) => text.startsWith('[app] The child has now said'));
  const stuck = () => appNotes().filter((text) => text.startsWith('[app] The child has tried'));
  const attempt = (id: string, result = 'correct') => { speech(id); assessed(id, { result, mastered: false }); };
  const start = (game = false) => {
    conversation.close(); sent.length = 0;
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt), sittingEnded: () => {} }, { wrapUpMs: 10, goodbyeMs: 1000 }, { game, silence: NO_NUDGE });
    teacherSpoke(); conversation.setPresented({ kind: 'card', id: 'apple' });
    conversation.start(false); created('opening', { ...creates().at(-1)!.response.metadata }); done('opening');
    sent.length = 0;
  };
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { conversation.close(); vi.useRealTimers(); });

  it.each([false, true])('does not generate an odd-count echo reminder after the time check (game=%s)', (game) => {
    start(game); vi.advanceTimersByTime(10);
    if (game) { created('battle-card'); done('battle-card', [call('show_card', { card_id: 'apple' })]); }
    attempt('first'); attempt('second'); attempt('third');
    expect(attempts('apple')).toBe(3); expect(session.memory.clearedCardIds).toEqual([]);
    expect(echoes()).toEqual([]); expect(doneNotes()).toEqual([]);
  });
  it.each([false, true])('drops a queued echo reminder when the time check fires before writing (game=%s)', (game) => {
    start(game); created('busy'); attempt('echo'); attempt('second'); attempt('third');
    expect(echoes()).toEqual([]);
    vi.advanceTimersByTime(10); done('busy');
    expect(appNotes().some((text) => text.startsWith('[app] Heard:'))).toBe(true);
    expect(echoes()).toEqual([]); expect(doneNotes()).toEqual([]); expect(attempts('apple')).toBe(3);
  });
  it('drops a queued repeated-correct reminder on a passed card when the time check fires before writing', () => {
    start(); session.memory.clearedCardIds = ['apple']; created('busy');
    attempt('first'); attempt('second'); attempt('third');
    vi.advanceTimersByTime(10); done('busy');
    expect(appNotes().some((text) => text.startsWith('[app] Heard:'))).toBe(true); expect(doneNotes()).toEqual([]);
  });
  it('drops a queued stuck reminder when a correct echo resets the streak before writing', () => {
    start(); created('busy');
    for (let n = 1; n <= 4; n++) attempt(`close${n}`, 'close');
    expect(stuck()).toEqual([]); attempt('correct'); done('busy');
    expect(session.memory.clearedCardIds).toEqual([]); expect(attempts('apple')).toBe(5);
    expect(echoes()).toHaveLength(1); expect(stuck()).toEqual([]);
  });
  it('drops a queued stuck reminder when the time check fires before writing', () => {
    start(); created('busy');
    for (let n = 1; n <= 4; n++) attempt(`close${n}`, 'close');
    expect(stuck()).toEqual([]); vi.advanceTimersByTime(10); done('busy');
    expect(appNotes().some((text) => text.startsWith('[app] Heard:'))).toBe(true);
    expect(stuck()).toEqual([]);
  });
});

describe('opening note', () => {
  it('lists earlier passed words and asks for recall when resuming', () => {
    session.memory.clearedCardIds = ['apple', 'milk']; sent.length = 0;
    conversation.start(true);
    const note = sent.find((e) => e.type === 'conversation.item.create' && e.item.content[0].text.includes('back to continue'))?.item.content[0].text as string;
    expect(note).toBe('[app] The child is back to continue this course. Screen shows card apple (apple / 苹果). Words passed in earlier sittings: ["apple","milk"]. Greet in one short sentence and, in that same turn, put the first word you will ask them to recall on the screen with show_card; ask for it after the result, in a NEW situation (not the old drill). Recall 2-3 of them this way, one card at a time; hints are fine, a forgotten word is not a failure. Then go on with new teaching.');
    expect(note.match(/Greet/g)).toHaveLength(1);
  });
  it('has no recall request on a first sitting', () => {
    conversation.start(false);
    const note = sent.find((e) => e.type === 'conversation.item.create' && e.item.content[0].text.startsWith('[app] Lesson started'))?.item.content[0].text as string;
    expect(note).toBe('[app] Lesson started. Screen shows card apple (apple / 苹果). Greet in one short sentence. Then teach this card.');
  });
  it('keeps the existing greeting and teaching cue when resuming without passed words', () => {
    conversation.start(true);
    const note = sent.find((e) => e.type === 'conversation.item.create' && e.item.content[0].text.includes('back to continue'))?.item.content[0].text as string;
    expect(note).toBe('[app] The child is back to continue this course. Screen shows card apple (apple / 苹果). Greet in one short sentence. Then teach this card.');
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
    teacherSpoke();

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
  it('uses medium provider VAD in auto mode and turns it off in manual mode', () => {
    const config = (c: NaturalConversation) => (c.sessionConfig('m') as { audio: { input: { turn_detection: unknown } } }).audio.input.turn_detection;
    expect(config(conversation)).toBeNull();
    const auto = new NaturalConversation(session, { send: () => {}, publish: () => {}, sittingEnded: () => {} });
    expect(config(auto)).toEqual({ type: 'semantic_vad', eagerness: 'medium', create_response: true, interrupt_response: true });
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


describe('stuck word reminders', () => {
  const attempt = (id: string, result = 'close') => { speech(id); assessed(id, { result, mastered: false }); };
  const stuck = () => appNotes().filter((text) => text.startsWith('[app] The child has tried'));
  it('replays the 2026-11-15 trumpet and bell results, including the unsaved message and time check', () => {
    vi.useFakeTimers();
    try {
      conversation.close(); session.course = instrumentsCourse;
      conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt), sittingEnded: () => {} }, { wrapUpMs: 10, goodbyeMs: 1000 }, { silence: NO_NUDGE });
      teacherSpoke();

      conversation.start(false); created('opening', { ...creates().at(-1)!.response.metadata }); done('opening');
      conversation.setPresented({ kind: 'card', id: 'bell' });
      for (const [n, result] of Array.from(['close', 'correct', 'correct'].entries())) attempt(`first-bell${n}`, result);
      conversation.setPresented({ kind: 'card', id: 'trumpet' });
      for (let n = 1; n <= 9; n++) {
        attempt(`trumpet${n}`);
        expect(stuck()).toHaveLength(Math.floor(n / 4));
      }
      expect(stuck()[0]).toContain('trumpet 4 times'); expect(stuck()[1]).toContain('trumpet 8 times');
      conversation.setPresented({ kind: 'card', id: 'harp' });
      for (const [n, result] of Array.from(['close', 'close', 'wrong', 'close', 'correct', 'correct'].entries())) attempt(`harp${n}`, result);
      const beforeBell = stuck().length;
      conversation.setPresented({ kind: 'card', id: 'bell' });
      const results = ['wrong', 'close', 'close', 'close', 'wrong', 'close', 'close', 'close', 'wrong', 'close', 'wrong', 'close', 'close'];
      for (const [n, result] of Array.from(results.entries())) {
        if (n === 2) attempt('unsaved-bell', 'not_attempt');
        if (n === 11) vi.advanceTimersByTime(10);
        attempt(`bell${n + 25}`, result);
        expect(stuck()).toHaveLength(beforeBell + Math.min(2, Math.floor((n + 1) / 4)));
      }
      expect(stuck().slice(beforeBell).map((text) => text.match(/bell (\d+) times/)?.[1])).toEqual(['4', '8']);
      expect(session.memory.currentCardId).toBe('apple'); expect(creates()).toHaveLength(1);
    } finally { conversation.close(); vi.useRealTimers(); }
  });
  it('resets on correct, but not on not_attempt or a card switch', () => {
    attempt('a1'); attempt('a2', 'wrong'); attempt('reset', 'correct');
    attempt('a3'); attempt('chat', 'not_attempt');
    conversation.setPresented({ kind: 'card', id: 'milk' }); attempt('milk1');
    conversation.setPresented({ kind: 'card', id: 'apple' });
    attempt('a4'); attempt('a5'); expect(stuck()).toEqual([]); attempt('a6');
    expect(stuck()).toHaveLength(1); expect(stuck()[0]).toContain('apple 4 times');
  });
  it('writes after verdict, mismatch and echo at the idle boundary and logs only ids and counts', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    try {
      created('busy'); attempt('echo1', 'correct'); attempt('echo2', 'correct');
      for (let n = 1; n <= 4; n++) attempt(`private${n}`);
      for (let n = 1; n <= 3; n++) attempt(`chat${n}`, 'not_attempt');
      conversation.setPresented({ kind: 'card', id: 'sentence_milk' });
      for (let n = 1; n <= 3; n++) attempt('milk' + n, 'correct');
      expect(stuck()).toEqual([]); done('busy');
      expect(appNotes()).toHaveLength(5); expect(appNotes()[4]).toContain('answered I like milk. correctly 3 times');
      expect(info.mock.calls.at(-1)).toEqual(['app note', { module: 'realtime-conversation', sessionId: session.id, kind: 'done', count: 3 }]);
      expect(appNotes()[2]).toContain('The child has now said'); expect(appNotes()[3]).toContain('The child has tried');
      expect(info.mock.calls.filter(([message, fields]) => message === 'app note' && fields?.kind === 'stuck')).toEqual([
        ['app note', { module: 'realtime-conversation', sessionId: session.id, kind: 'stuck', count: 4 }],
      ]);
    } finally { info.mockRestore(); }
  });
  it('ignores sentence and quiz targets', () => {
    const sentence = session.course.cards.find((card) => card.kind === 'sentence')!;
    conversation.setPresented({ kind: 'card', id: sentence.id });
    for (let n = 0; n < 4; n++) attempt(`sentence${n}`);
    changePhase(session, 'reinforcement');
    const quiz = session.course.phases.reinforcement.quizzes.find((q) => q.type === 'repeat-after-me')!;
    conversation.setPresented({ kind: 'quiz', id: quiz.id });
    for (let n = 0; n < 4; n++) attempt(`quiz${n}`);
    expect(stuck()).toEqual([]);
  });
  it('does not generate after the wrap-up time check', () => {
    vi.useFakeTimers();
    try {
      conversation.close();
      conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt), sittingEnded: () => {} }, { wrapUpMs: 10, goodbyeMs: 1000 }, { silence: NO_NUDGE });
      teacherSpoke();

      conversation.setPresented({ kind: 'card', id: 'apple' }); conversation.start(false);
      created('opening', { ...creates().at(-1)!.response.metadata }); done('opening');
      vi.advanceTimersByTime(10);
      for (let n = 0; n < 4; n++) attempt(`wrapped${n}`);
      expect(stuck()).toEqual([]);
    } finally { conversation.close(); vi.useRealTimers(); }
  });
  it.each([false, true])('discards reminders for a passed word (pending=%s)', (pending) => {
    if (pending) created('busy'); else session.memory.clearedCardIds.push('apple');
    for (let n = 0; n < 4; n++) attempt(`a${n}`);
    if (pending) { speech('recall'); assessed('recall'); done('busy'); }
    expect(stuck()).toEqual([]);
  });
});


describe('whole-word assessor standard', () => {
  it('uses the same child-accent tolerance in instructions and the result tool description', () => {
    speech('standard');
    const request = assessRequests()[0].response;
    const result = request.tools[0].parameters.properties.result.description;
    for (const text of [request.instructions, result]) {
      expect(text).toContain('someone familiar with the target can recognize the whole word');
      expect(text).toContain('an omitted final consonant or an omitted r do not lower the result');
      expect(text).toContain('a syllable missing from a multisyllabic word');
      expect(text).not.toContain('missing ending');
    }
    expect(JSON.stringify(request)).not.toContain('gi-ter');
    expect(request.tools[0].parameters.properties.heard.description).toContain('normal spelling of the word if you recognize it');
    expect(request.instructions).toContain('An echo or imitation right after the tutor');
    expect(request.tools[0].parameters.properties.mastered.description).toContain('true only for unaided recall');
  });
});


describe('speech before the teacher first speaks', () => {
  it.each([false, true])('ignores early commits, then assesses after first audio (manual=%s)', (manualTurn) => {
    conversation.close(); sent.length = 0;
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt), sittingEnded: () => {} }, SITTING, { manualTurn, silence: NO_NUDGE });
    conversation.setPresented({ kind: 'card', id: 'apple' });
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const commit = (id: string) => {
        if (manualTurn) {
          conversation.childSpeech('start'); conversation.childSpeech('end');
          vi.advanceTimersByTime(MANUAL_TURN.commitAfterSilenceMs);
          feed({ type: 'input_audio_buffer.committed', item_id: id });
          created(`reply-${id}`, { ...creates().at(-1)!.response.metadata }); done(`reply-${id}`);
        } else speech(id);
      };
      commit('early');
      expect(assessRequests()).toEqual([]); expect(attempts('apple')).toBe(0); expect(published).toEqual([]);
      expect(info).toHaveBeenCalledWith('assessment before teacher speech ignored', { module: 'realtime-conversation', sessionId: session.id });
      teacherSpoke(); commit('after'); assessed('after', { mastered: false });
      expect(assessRequests()).toHaveLength(1); expect(attempts('apple')).toBe(1);
      expect(appNotes().filter((text) => text.startsWith('[app] The child has now said'))).toHaveLength(1);
      expect(appNotes().at(-1)).toContain('use show_card to return to this card before asking');
    } finally { info.mockRestore(); conversation.close(); vi.useRealTimers(); }
  });
});


describe('teacher transcript fallback in manual-turn mode', () => {
  beforeEach(() => {
    vi.useFakeTimers(); conversation.close(); sent.length = 0;
    conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt), sittingEnded: () => {} }, SITTING, { manualTurn: true, silence: NO_NUDGE });
    conversation.setPresented({ kind: 'card', id: 'apple' });
  });
  afterEach(() => { conversation.close(); vi.useRealTimers(); });
  const commit = (id: string) => {
    conversation.childSpeech('start'); conversation.childSpeech('end');
    vi.advanceTimersByTime(MANUAL_TURN.commitAfterSilenceMs);
    feed({ type: 'input_audio_buffer.committed', item_id: id });
  };
  it('assesses a manual commit after a completed teacher transcript without any audio-start event', () => {
    created('teacher');
    feed({ type: 'response.output_audio_transcript.delta', response_id: 'teacher', delta: '听我说：apple。' });
    done('teacher'); commit('after-transcript');
    expect(assessRequests()).toHaveLength(1);
    expect(assessRequests()[0].response.metadata.input).toBe('after-transcript');
    assessed('after-transcript', { mastered: false });
    expect(attempts('apple')).toBe(1);
  });
  it.each(['cancelled', 'empty', 'assess'])('does not unlock assessments for a %s response', (kind) => {
    const metadata = kind === 'assess' ? { kind: 'assess' } : null;
    created('not-spoken', metadata);
    feed({ type: 'response.output_audio_transcript.delta', response_id: 'not-spoken', delta: kind === 'empty' ? '  ' : 'fixture' });
    done('not-spoken', [], kind === 'cancelled' ? 'cancelled' : 'completed', metadata);
    commit('early');
    expect(assessRequests()).toEqual([]); expect(attempts('apple')).toBe(0);
  });
});

describe('word card sounds', () => {
  const teach = () => session.memory.wordPerformance.set('bell', { attempts: 1, correct: 0, lastAttempt: new Date() });
  const tool = (id: string, name: string, card_id: string) => { created(id); done(id, [call(name, { card_id })]); };
  beforeEach(() => {
    vi.useFakeTimers();
    session.course = instrumentsCourse;
    session.memory.currentCardId = 'piano';
    conversation.setPresented({ kind: 'card', id: 'piano' });
  });
  afterEach(() => { conversation.close(); vi.useRealTimers(); });
  it.each([true, false])('introduces the first sounding rendition only after the clip window (teacher playing=%s)', (playing) => {
    if (playing) feed({ type: 'output_audio_buffer.started' });
    tool('first', 'show_card', 'bell');
    expect(published.at(-1)).toMatchObject({ cardId: 'bell', cue: 'sound' });
    expect(outputs().at(-1).note).toContain("The app plays this card's own sound once as the card appears.");
    if (playing) {
      vi.advanceTimersByTime(SOUND_CUE_MS * 2); expect(creates()).toEqual([]);
      feed({ type: 'output_audio_buffer.stopped' });
    }
    vi.advanceTimersByTime(SOUND_CUE_MS - 1); expect(creates()).toEqual([]);
    vi.advanceTimersByTime(1); expect(kinds()).toEqual(['followup']);
    const metadata = creates()[0].response.metadata;
    created('intro', metadata); done('intro', [], 'completed', metadata);
    tool('repeat', 'show_card', 'bell');
    expect(published.at(-1)).not.toHaveProperty('cue');
    expect(outputs().at(-1).note).not.toContain('own sound');
    expect(kinds()).toEqual(['followup', 'followup']);
  });

  it('records a taught sound quiz, suppresses mixed-tool followup and binds its cue at speech start', () => {
    teach();
    created('ask'); done('ask', [call('show_card', { card_id: 'bell' }), call('play_sound', { card_id: 'bell' })]);
    expect(outputs().at(-1)).toEqual({ ok: true, displayed_card: 'bell', note: 'The picture is on screen and its sound is playing for the child now; the English word is hidden. Say nothing more; wait for the child to answer.' });
    expect(states().at(-1)).toContain('Eligible play_sound card IDs: ["bell"]');
    expect(published.at(-1)).toMatchObject({ cue: 'sound-quiz', cardId: 'bell' });
    expect(getDb().prepare('SELECT tools FROM realtime_responses WHERE lesson_id = ? AND kind = ?').get(session.id, 'speech')).toEqual({ tools: 'show_card(bell),play_sound(bell)' });
    vi.advanceTimersByTime(SOUND_CUE_MS + 100); expect(creates()).toEqual([]);
    conversation.setPresented({ kind: 'card', id: 'bell' });
    feed({ type: 'input_audio_buffer.speech_started', item_id: 'answer' });
    tool('reveal', 'show_card', 'bell'); expect(published.at(-1)).not.toHaveProperty('cue');
    feed({ type: 'input_audio_buffer.committed', item_id: 'answer' });
    expect(assessRequests().at(-1)?.response.instructions).toContain('with the English hidden');
    assessed('answer', { mastered: false, next_action: 'retry' });
    expect(appNotes().at(-1)).toContain('call play_sound for bell');
    speech('after-reveal'); expect(assessRequests().at(-1)?.response.instructions).not.toContain('with the English hidden');
  });

  it.each([
    ['unknown', 'NO_SOUND'], ['music', 'NO_SOUND'], ['sentence_piano', 'NO_SOUND'], ['bell', 'SOUND_NOT_TAUGHT'],
    ['phase', 'INVALID_PHASE'], ['wrapped', 'INVALID_PHASE'], ['ended', 'SITTING_ENDED'],
  ])('rejects %s without committing or changing screen', (scenario, code) => {
    if (scenario === 'phase') conversation.changePhase('reinforcement');
    if (scenario === 'wrapped' || scenario === 'ended') {
      open(); vi.advanceTimersByTime(SITTING.wrapUpMs);
      if (scenario === 'ended') vi.advanceTimersByTime(SITTING.goodbyeMs - SITTING.wrapUpMs);
    }
    const revisions = published.length;
    tool('bad', 'play_sound', ['phase', 'wrapped', 'ended'].includes(scenario) ? 'bell' : scenario);
    expect(outputs().at(-1)).toMatchObject({ ok: false, error: code });
    expect(published).toHaveLength(revisions); expect(session.memory.currentCardId).toBe('piano');
    if (scenario === 'wrapped') {
      tool('ordinary', 'show_card', 'bell'); expect(published.at(-1)).not.toHaveProperty('cue');
    }
  });

  it('starts the normal silence interval after the sound-quiz window and audio drain', () => {
    conversation.close();
    conversation = new NaturalConversation(session, { send: (e) => sent.push(e), publish: (r) => published.push(r), sittingEnded: () => {} });
    open(); teach();
    feed({ type: 'output_audio_buffer.started' });
    tool('ask', 'play_sound', 'bell');
    vi.advanceTimersByTime(SOUND_CUE_MS + SILENCE.nudgeAfterMs); expect(kinds()).toEqual([]);
    feed({ type: 'output_audio_buffer.stopped' });
    vi.advanceTimersByTime(SOUND_CUE_MS + SILENCE.nudgeAfterMs - 1); expect(kinds()).toEqual([]);
    vi.advanceTimersByTime(1); expect(kinds()).toEqual(['nudge']);
  });
});

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
import { GAME_RULES, MANUAL_TURN, NaturalConversation, SITTING, type ProviderMessage } from './conversation';

const usage = { input_tokens: 5, output_tokens: 5, input_token_details: { text_tokens: 5, audio_tokens: 0, cached_tokens: 0 }, output_token_details: { text_tokens: 5, audio_tokens: 0 } };
let session: Session; let sent: Array<Record<string, any>>; let published: TeachingReceipt[]; let conversation: NaturalConversation;
let sittingEnds: number;
beforeEach(() => {
  session = createSession(foodCourse, 'test-learner', 'realtime');
  session.tokenUsage.realtime = { model: 'gpt-realtime-2.1', usage: [], complete: true };
  changePhase(session, 'interactive'); session.memory.currentCardId = 'apple';
  sent = []; published = []; sittingEnds = 0;
  conversation = new NaturalConversation(session, { send: (event) => sent.push(event as Record<string, any>), publish: (receipt) => published.push(receipt),
    sittingEnded: () => { sittingEnds++; } });
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
const states = () => sent.filter((e) => e.type === 'conversation.item.create' && e.item.type === 'message' && e.item.content[0].text.startsWith('[app] State:')).map((e) => e.item.content[0].text as string);
const attempts = (word: string) => session.memory.wordPerformance.get(word)?.attempts ?? 0;

describe('natural conversation input binding and tool execution', () => {
  it('keeps a correct first echo on the card, then advances on a separate recall attempt', () => {
    speech('echo'); created('echo-response');
    done('echo-response', [assess('apple', { mastered: false, next_action: 'retry', evidence: 'Immediate imitation; check recall next.' })]);
    expect(session.memory.currentCardId).toBe('apple');
    expect(session.memory.clearedCardIds).toEqual([]);
    expect(states().at(-1)).toContain('"attempts":1,"correct":1');
    created('cue', { ...creates().at(-1)?.response.metadata }); done('cue');
    // The next cue is spoken feedback, not another assessment of the same audio.
    expect(attempts('apple')).toBe(1);
    speech('recall'); created('recall-response');
    done('recall-response', [assess('apple', { next_card_id: 'milk', evidence: 'Named apple from a meaning cue without another model.' })]);
    expect(session.memory.clearedCardIds).toEqual(['apple']);
    expect(session.memory.currentCardId).toBe('milk');
    expect(attempts('apple')).toBe(2);
    expect(sent.some((event) => event.type === 'session.update')).toBe(false);
  });
  it.each(actionsCourse.phases.reinforcement.quizzes.filter((q) => q.type === 'repeat-after-me'))('saves sentence $cardId as question $id without another attempt', (quiz) => {
    if (quiz.type !== 'repeat-after-me') throw new Error('Expected sentence quiz');
    session.course = actionsCourse;
    changePhase(session, 'reinforcement');
    conversation.setPresented({ kind: 'quiz', id: quiz.id });
    speech('sentence-input'); created('sentence-response');
    done('sentence-response', [assess(quiz.cardId, { heard: quiz.targetText })]);
    expect(outputs()[0]).toMatchObject({ ok: true, saved: true, quiz: { quizId: quiz.id, correct: true } });
    expect(session.memory.passedQuizIds).toContain(quiz.id);
    const rows = getDb().prepare('SELECT model_calls FROM interaction_logs WHERE lesson_id = ?').all(session.id) as Array<{ model_calls: string }>;
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].model_calls).assessment.target_id).toBe(quiz.id);
    expect(session.memory.clearedCardIds).not.toContain(quiz.cardId);
    created('duplicate', { ...creates().at(-1)?.response.metadata });
    done('duplicate', [assess(quiz.id)]);
    expect(session.lessonInteractionCount).toBe(1);
  });
  it('rejects another sentence and supplies the bound target for recovery on the same input', () => {
    session.course = actionsCourse;
    changePhase(session, 'reinforcement');
    conversation.setPresented({ kind: 'quiz', id: 'q5' });
    speech('sentence-input'); created('sentence-response');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      done('sentence-response', [assess('sentence_sing')]);
      expect(outputs()[0]).toMatchObject({ ok: false, error: 'INVALID_INPUT_ASSOCIATION', expected_target: { id: 'q5', text: 'I can run.' } });
      expect(session.lessonInteractionCount).toBe(0);
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('INVALID_INPUT_ASSOCIATION'));
      created('repair', { ...creates().at(-1)?.response.metadata });
      done('repair', [assess('q5', { heard: 'I can run.' })]);
      expect(session.memory.passedQuizIds).toEqual(['q5']);
      expect(session.lessonInteractionCount).toBe(1);
    } finally { warning.mockRestore(); }
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

it('answers the completing tool result before saying goodbye once', () => {
  changePhase(session, 'reinforcement');
  const sentences = foodCourse.phases.reinforcement.quizzes.filter((q) => q.type === 'repeat-after-me');
  session.memory.passedQuizIds = foodCourse.phases.reinforcement.quizzes.map((q) => q.id).filter((id) => id !== sentences[0].id);
  conversation.setPresented({ kind: 'quiz', id: sentences[0].id }); sent.length = 0;
  speech('i1'); created('r1'); done('r1', [assess(sentences[0].id, { mastered: false })]);
  expect(session.currentPhase).toBe('done');
  const order = sent.filter((e) => ['response.create', 'conversation.item.create'].includes(e.type)).map((e) => e.type === 'response.create' ? e.response.metadata.kind : e.item.type);
  expect(order).toEqual(['function_call_output', 'message', 'followup']); // tool result, committed state, spoken answer
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
  it('queues the goodbye at the second mark, ends the sitting once and leaves the phase and progress alone', () => {
    open();
    speech('i1'); created('r1'); done('r1', [assess('apple', { next_card_id: 'milk' })]); created('f1', { ...creates().at(-1)?.response.metadata }); done('f1');
    sent.length = 0;
    minutes(SITTING.goodbyeMs / 60_000);
    expect(kinds()).toEqual(['goodbye']); expect(creates()[0].response.tool_choice).toBe('none'); expect(sittingEnds).toBe(1);
    expect(session.currentPhase).toBe('interactive');
    const row = getCourseProgress(session.courseId, session.learnerId)!;
    expect(row.phase).toBe('interactive'); expect(row.completed).toBe(false); expect(row.snapshot.clearedCardIds).toEqual(['apple']);
    expect(isResumableProgress(row)).toBe(true);
    minutes(30); expect(kinds()).toEqual(['goodbye']); expect(sittingEnds).toBe(1);
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
    expect(game).toContain('must never be set to make a bigger spell');
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
    created('r1', { ...creates()[0].response.metadata });
    done('r1', [assess('apple')]);
    expect(outputs()[0]).toMatchObject({ ok: true }); expect(attempts('apple')).toBe(1);
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
    committedItem('i1'); created('r1', { ...creates()[0].response.metadata }); done('r1', [assess('apple')]);
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

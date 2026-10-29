import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { RealtimeClassroom } from './realtime-classroom';
const doubles = vi.hoisted(() => ({ players: [] as any[], recorders: [] as any[] }));
vi.mock('@/lib/audio/pcm-player', () => ({ PcmPlayer: class {
  idle = true; listeners = new Set<() => void>(); dispose = vi.fn(async () => {}); stop = vi.fn(async () => { this.idle = true; });
  prewarm = vi.fn(async () => {}); enqueue = vi.fn(() => { this.idle = false; });
  isIdle() { return this.idle; } onIdle(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  finish() { this.idle = true; this.listeners.forEach((fn) => fn()); }
  constructor() { doubles.players.push(this); }
} }));
vi.mock('@/lib/audio/recorder', () => ({ LessonRecorder: class {
  start = vi.fn(async () => ({ stop: vi.fn(async () => {}) })); prewarm = vi.fn(async () => {}); dispose = vi.fn(async () => {});
  constructor() { doubles.recorders.push(this); }
} }));
const receipt = (phase = 'intro', cardId = 'apple') => ({ ok: true, cardId, progress: { clearedCardIds: [], totalAttempts: 0, currentPhase: phase } });
function stream(events: object[]) { return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } }); }
const extra: Array<(body: any) => Response> = [];
const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
  const body = JSON.parse(options.body as string);
  if (body.action === 'start') return new Response(JSON.stringify({ sessionId: 'session-1', resume: null, receipt: receipt() }));
  if (body.action === 'end') return new Response('{"ok":true}');
  if (extra.length) return extra.shift()!(body);
  if (body.intent.kind === 'phase') return stream([{ type: 'receipt', receipt: receipt(body.intent.to) }, { type: 'done' }]);
  return stream([{ type: 'done' }]);
});
beforeEach(() => { doubles.players.length = 0; doubles.recorders.length = 0; extra.length = 0; fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('Realtime classroom view contract', () => {
  it('waits for actual playback after generation done before unlocking input', async () => {
    const classroom = new RealtimeClassroom(foodCourse); await classroom.startLesson('child');
    extra.push(() => stream([{ type: 'audio', pcm: btoa('\0\0\0\0') }, { type: 'done' }]));
    const repeat = classroom.repeatCard('apple');
    await vi.waitFor(() => expect(doubles.players[0].enqueue).toHaveBeenCalled());
    expect(classroom.getState()).toBe('speaking');
    await classroom.startListening(); expect(doubles.recorders[0].start).not.toHaveBeenCalled();
    doubles.players[0].finish(); await repeat;
    expect(classroom.getState()).toBe('awaiting');
    await classroom.endLesson();
  });
  it('retains the exact input identity on feedback retry and does not unlock on a truncated stream', async () => {
    const classroom = new RealtimeClassroom(foodCourse); await classroom.startLesson('child');
    const errors: unknown[] = []; classroom.on('error', (e) => errors.push(e));
    extra.push(() => stream([{ type: 'receipt', receipt: receipt('interactive') }, { type: 'error', code: 'PROVIDER_DISCONNECTED', message: 'failed' }]));
    await classroom.repeatCard('apple');
    expect(classroom.getState()).toBe('idle'); expect(errors).toHaveLength(1);
    const failed = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);
    extra.push((body) => { expect(body.turnId).toBe(failed.turnId); expect(body.intent).toEqual(failed.intent); return stream([{ type: 'done' }]); });
    await classroom.retryLastTurn(); expect(classroom.getState()).toBe('awaiting');
    await classroom.endLesson();
  });
  it('stops a late microphone startup after exit without modifying the next run', async () => {
    const classroom = new RealtimeClassroom(foodCourse); await classroom.startLesson('child');
    let resolve!: (tap: { stop: () => Promise<void> }) => void;
    doubles.recorders[0].start.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const press = classroom.startListening();
    await classroom.stopListening(); await classroom.endLesson();
    const stopped = vi.fn(async () => {}); resolve({ stop: stopped }); await press;
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(doubles.players[0].dispose).toHaveBeenCalledTimes(1);
    expect(doubles.recorders[0].dispose).toHaveBeenCalledTimes(1);
    expect(classroom.getState()).toBe('idle');
  });
  it('never treats a model result as an ASR final or emits a quiz result before playback ends', async () => {
    const classroom = new RealtimeClassroom(foodCourse); await classroom.startLesson('child');
    const asr = vi.fn(); const result = vi.fn(); classroom.on('asr-final', asr); classroom.on('quiz-result', result);
    const committed = { ...receipt('reinforcement'), quiz: { quizId: 'q1', ok: true, correct: true, source: 'application', next: 'advance' } };
    extra.push(() => stream([{ type: 'receipt', receipt: committed }, { type: 'audio', pcm: btoa('\0\0') }, { type: 'done' }]));
    const answering = classroom.submitPick('q1', 'apple');
    await vi.waitFor(() => expect(doubles.players[0].enqueue).toHaveBeenCalled());
    expect(result).not.toHaveBeenCalled(); doubles.players[0].finish(); await answering;
    expect(result).toHaveBeenCalledWith(committed.quiz); expect(asr).not.toHaveBeenCalled();
    await classroom.endLesson();
  });
});

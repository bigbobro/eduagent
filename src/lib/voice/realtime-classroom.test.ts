import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { instrumentsCourse } from '@/data/courses/instruments';
import { RealtimeClassroom, type CardSounds } from './realtime-classroom';
import type { SoundCue } from './classroom';

const receipt = (revision: number, phase = 'interactive', cardId = 'apple', extra: object = {}) => ({ ok: true, cardId, revision, progress: { clearedCardIds: [], totalAttempts: 0, currentPhase: phase }, ...extra });
let push: (event: object) => void; let finish: () => void; let transport: 'mock' | 'webrtc';
const bodies: Array<Record<string, any>> = []; const tracks: Array<{ stop: ReturnType<typeof vi.fn>; enabled: boolean; kind: string }> = [];
const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
  const body = JSON.parse(options.body as string); bodies.push({ ...body, keepalive: options.keepalive });
  if (body.action === 'start') return new Response(JSON.stringify({ sessionId: 'session-1', resume: null, receipt: receipt(0, 'intro'), transport }));
  if (body.action === 'connect') {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      push = (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      finish = () => controller.close();
      push({ type: 'answer', sdp: transport === 'webrtc' ? 'v=0 answer' : null });
    } });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }
  if (body.action === 'pick') return new Response(JSON.stringify({ receipt: receipt(7, 'reinforcement', 'apple', { quiz: { quizId: 'q1', ok: true, correct: true, source: 'application', next: 'advance' } }) }));
  if (body.action === 'phase') return new Response(JSON.stringify({ receipt: receipt(9, 'done') }));
  return new Response('{"ok":true}');
});
const peers: any[] = [];
class FakePeer {
  tracks: unknown[] = []; channel = { readyState: 'open', send: vi.fn(), close: vi.fn() }; closed = false; remote: unknown; ontrack: unknown; onconnectionstatechange: unknown;
  constructor() { peers.push(this); }
  addTrack(track: unknown) { this.tracks.push(track); }
  createDataChannel(name: string) { expect(name).toBe('oai-events'); return this.channel; }
  async createOffer() { return { type: 'offer', sdp: 'v=0 offer' }; }
  async setLocalDescription() {}
  async setRemoteDescription(description: unknown) { this.remote = description; }
  close() { this.closed = true; }
}
beforeEach(() => {
  transport = 'mock'; bodies.length = 0; tracks.length = 0; peers.length = 0; fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  vi.stubGlobal('Audio', class { autoplay = false; srcObject: unknown = null; pause = vi.fn(); });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => {
    const track = { stop: vi.fn(), enabled: true, kind: 'audio' }; tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  }) } });
});
afterEach(() => vi.unstubAllGlobals());
const provider = (event: object) => push({ type: 'provider', event });
it('shows a billing hint when the call cannot connect because quota is exhausted', async () => {
  const classroom = new RealtimeClassroom(foodCourse);
  const errors = vi.fn(); classroom.on('error', errors);
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: 'session-1', resume: null, receipt: receipt(0, 'intro'), transport: 'mock' })));
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'REALTIME_INSUFFICIENT_QUOTA' }), { status: 502 }));
  expect(await classroom.startLesson('child')).toBe(false);
  expect(errors).toHaveBeenCalledWith({ code: 'REALTIME_INSUFFICIENT_QUOTA', message: 'OpenAI 额度不足，请到 OpenAI 控制台检查余额和账单后再试。' });
});

async function started() {
  const classroom = new RealtimeClassroom(foodCourse);
  const states: string[] = []; classroom.on('state', (s) => states.push(s));
  expect(await classroom.startLesson('child')).toBe(true);
  return { classroom, states };
}

describe('natural Realtime classroom', () => {
  it('keeps one open microphone through teacher speech and derives turns from provider events, without any key press', async () => {
    const { classroom } = await started();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(classroom.getState()).toBe('awaiting');
    provider({ type: 'response.created', response: { id: 'r1', metadata: { kind: 'opening' } } });
    provider({ type: 'output_audio_buffer.started', response_id: 'r1' });
    await vi.waitFor(() => expect(classroom.getState()).toBe('speaking'));
    expect(tracks[0].enabled).toBe(true); // still capturing while the teacher speaks
    provider({ type: 'input_audio_buffer.speech_started', item_id: 'i1' });
    await vi.waitFor(() => expect(classroom.getState()).toBe('listening'));
    provider({ type: 'response.done', response: { id: 'r1', status: 'cancelled' } }); provider({ type: 'output_audio_buffer.cleared', response_id: 'r1' });
    provider({ type: 'input_audio_buffer.speech_stopped', item_id: 'i1' });
    await vi.waitFor(() => expect(classroom.getState()).toBe('thinking'));
    provider({ type: 'response.created', response: { id: 'r2', metadata: null } }); provider({ type: 'response.done', response: { id: 'r2', status: 'completed' } });
    await vi.waitFor(() => expect(classroom.getState()).toBe('awaiting'));
    expect(tracks).toHaveLength(1); await classroom.endLesson();
  });
  describe('speaker mode', () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    async function speakerStarted(speaker?: boolean) {
      const classroom = new RealtimeClassroom(foodCourse);
      expect(await classroom.startLesson('child', speaker === undefined ? undefined : { speaker })).toBe(true);
      return classroom;
    }
    it('sends speaker in the start request', async () => {
      const classroom = await speakerStarted(true);
      expect(bodies.find((b) => b.action === 'start')?.speaker).toBe(true);
      await classroom.endLesson();
    });
    it('closes the mic while the teacher generates and plays, and reopens it 500 ms after idle', async () => {
      const classroom = await speakerStarted(true);
      expect(tracks[0].enabled).toBe(true);
      provider({ type: 'response.created', response: { id: 'r1', metadata: null } });
      await vi.waitFor(() => expect(tracks[0].enabled).toBe(false));
      provider({ type: 'output_audio_buffer.started', response_id: 'r1' });
      provider({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
      await vi.waitFor(() => expect(classroom.getState()).toBe('speaking'));
      await sleep(600); expect(tracks[0].enabled).toBe(false); // still playing: no release timer yet
      provider({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
      await vi.waitFor(() => expect(classroom.getState()).toBe('awaiting'));
      expect(tracks[0].enabled).toBe(false);
      await sleep(300); expect(tracks[0].enabled).toBe(false);
      await vi.waitFor(() => expect(tracks[0].enabled).toBe(true));
      await classroom.endLesson();
    });
    it('keeps the mic closed when a new response starts inside the release window', async () => {
      const classroom = await speakerStarted(true);
      provider({ type: 'response.created', response: { id: 'r1', metadata: null } });
      provider({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
      await vi.waitFor(() => expect(classroom.getState()).toBe('awaiting'));
      await sleep(300);
      provider({ type: 'response.created', response: { id: 'r2', metadata: null } });
      await vi.waitFor(() => expect(classroom.getState()).toBe('thinking'));
      await sleep(600); expect(tracks[0].enabled).toBe(false);
      provider({ type: 'response.done', response: { id: 'r2', status: 'completed' } });
      await vi.waitFor(() => expect(classroom.getState()).toBe('awaiting'));
      await vi.waitFor(() => expect(tracks[0].enabled).toBe(true));
      await classroom.endLesson();
    });
    it('stays closed while paused after the teacher is idle, and unpausing reopens it', async () => {
      const classroom = await speakerStarted(true);
      provider({ type: 'response.created', response: { id: 'r1', metadata: null } });
      provider({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
      await vi.waitFor(() => expect(classroom.getState()).toBe('awaiting'));
      await classroom.setPaused!(true);
      await sleep(600); expect(tracks[0].enabled).toBe(false); // release timer fired, still paused
      await classroom.setPaused!(false);
      expect(tracks[0].enabled).toBe(true);
      await classroom.endLesson();
    });
    it.each([[false], [undefined]])('keeps the mic open while the teacher speaks when speaker is %s', async (speaker) => {
      const classroom = await speakerStarted(speaker);
      provider({ type: 'response.created', response: { id: 'r1', metadata: null } });
      provider({ type: 'output_audio_buffer.started', response_id: 'r1' });
      await vi.waitFor(() => expect(classroom.getState()).toBe('speaking'));
      expect(tracks[0].enabled).toBe(true);
      await classroom.endLesson();
    });
  });
  it('shows committed card switches once in order and ignores a stale or repeated revision', async () => {
    const { classroom } = await started();
    const shown: string[] = []; classroom.on('actions', (actions) => shown.push(actions[0].params.card_id));
    push({ type: 'receipt', receipt: receipt(3, 'interactive', 'milk') });
    push({ type: 'receipt', receipt: receipt(2, 'interactive', 'egg') });
    push({ type: 'receipt', receipt: receipt(3, 'interactive', 'milk') });
    push({ type: 'receipt', receipt: receipt(4, 'interactive', 'cake') });
    await vi.waitFor(() => expect(shown).toEqual(['milk', 'cake']));
    await classroom.endLesson();
  });
  it('reports the rendered target once and binds nothing itself', async () => {
    const { classroom } = await started();
    classroom.presented({ kind: 'card', id: 'apple' }); classroom.presented({ kind: 'card', id: 'apple' }); classroom.presented({ kind: 'card', id: 'milk' });
    await vi.waitFor(() => expect(bodies.filter((b) => b.action === 'presented').map((b) => b.target.id)).toEqual(['apple', 'milk']));
    await classroom.endLesson();
  });
  it('unlocks a quiz prompt only after that prompt finished playing, not after other speech', async () => {
    const { classroom } = await started();
    let resolved = false; const prompt = classroom.presentQuiz('q1').then(() => { resolved = true; });
    await vi.waitFor(() => expect(bodies.some((b) => b.action === 'present-quiz')).toBe(true));
    provider({ type: 'response.created', response: { id: 'other', metadata: { kind: 'pick-feedback' } } });
    provider({ type: 'response.done', response: { id: 'other', status: 'completed' } });
    provider({ type: 'response.created', response: { id: 'p1', metadata: { kind: 'present-quiz', quiz_id: 'q1' } } });
    provider({ type: 'output_audio_buffer.started', response_id: 'p1' }); provider({ type: 'response.done', response: { id: 'p1', status: 'completed' } });
    await new Promise((r) => setTimeout(r, 20)); expect(resolved).toBe(false);
    provider({ type: 'output_audio_buffer.stopped', response_id: 'p1' });
    await prompt; expect(resolved).toBe(true);
    await classroom.endLesson();
  });
  it('merges subtitles per response and marks an interrupted reply', async () => {
    const { classroom } = await started();
    const subtitles: Array<{ text: string; messageId?: string }> = []; classroom.on('subtitle', (s) => subtitles.push(s));
    provider({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: '这是' });
    provider({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: ' dog。' });
    provider({ type: 'output_audio_buffer.cleared', response_id: 'r1' });
    provider({ type: 'response.output_audio_transcript.delta', response_id: 'r2', delta: '这是 cat。' });
    await vi.waitFor(() => expect(subtitles.map((s) => s.text)).toEqual(['这是', '这是 dog。', '这是 dog。 …', '这是 cat。']));
    expect(new Set(subtitles.slice(0, 3).map((s) => s.messageId)).size).toBe(1);
    await classroom.endLesson();
  });
  it('pauses capture and teacher playback, then resumes', async () => {
    transport = 'webrtc'; const { classroom } = await started();
    await classroom.setPaused!(true);
    expect(tracks[0].enabled).toBe(false); expect(classroom.getState()).toBe('paused');
    expect(peers[0].channel.send).toHaveBeenCalledWith(JSON.stringify({ type: 'output_audio_buffer.clear' }));
    await classroom.setPaused!(false);
    expect(tracks[0].enabled).toBe(true); expect(bodies.filter((b) => b.action === 'pause').map((b) => b.paused)).toEqual([true, false]);
    await classroom.endLesson();
  });
  it('negotiates WebRTC with the single microphone track and releases peer, mic and call on exit', async () => {
    transport = 'webrtc'; const { classroom } = await started();
    expect(peers).toHaveLength(1); expect(peers[0].tracks).toEqual([tracks[0]]);
    expect(bodies.find((b) => b.action === 'connect')?.sdp).toBe('v=0 offer');
    expect(peers[0].remote).toEqual({ type: 'answer', sdp: 'v=0 answer' });
    const errors = vi.fn(); classroom.on('error', errors);
    await classroom.endLesson();
    expect(peers[0].closed).toBe(true); expect(tracks[0].stop).toHaveBeenCalled();
    expect(bodies.at(-1)).toMatchObject({ action: 'end', keepalive: true });
    try { push({ type: 'receipt', receipt: receipt(5, 'interactive', 'milk') }); } catch { /* the stream was cancelled by the exit */ }
    expect(errors).not.toHaveBeenCalled(); expect(classroom.getState()).toBe('idle');
  });
  it('treats a lost event stream as a restart from the saved checkpoint and releases the microphone', async () => {
    const { classroom } = await started();
    const errors: Array<{ code?: string }> = []; classroom.on('error', (e) => errors.push(e));
    finish();
    await vi.waitFor(() => expect(errors).toEqual([expect.objectContaining({ code: 'SESSION_EXPIRED' })]));
    await vi.waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
  });
  it('reports every committed answer once on one stream: spoken cards, repeat questions and picture choices', async () => {
    const { classroom } = await started();
    const answers: unknown[] = []; classroom.on('answer-result', (r) => answers.push(r));
    const quizzes = vi.fn(); classroom.on('quiz-result', quizzes);
    const assessment = (target_id: string, result: string, mastered: boolean) => ({ assessment: { target_id, result, heard: 'x', evidence: 'x', mastered, next_action: 'retry', next_card_id: null, next_phase: null } });
    push({ type: 'receipt', receipt: receipt(3, 'interactive', 'apple', assessment('apple', 'correct', false)) });
    push({ type: 'receipt', receipt: receipt(3, 'interactive', 'apple', assessment('apple', 'correct', false)) }); // replayed revision
    push({ type: 'receipt', receipt: receipt(4, 'interactive', 'milk', assessment('apple', 'correct', true)) }); // card switched in the same receipt
    push({ type: 'receipt', receipt: receipt(5, 'interactive', 'milk', assessment('milk', 'close', false)) });
    push({ type: 'receipt', receipt: receipt(6, 'reinforcement', 'apple', { ...assessment('q5', 'close', false), quiz: { quizId: 'q5', ok: true, correct: false, source: 'model', next: 'retry' } }) });
    push({ type: 'receipt', receipt: receipt(7, 'reinforcement', 'apple', { quiz: { quizId: 'q2', ok: true, correct: true, source: 'application', next: 'advance' } }) });
    push({ type: 'receipt', receipt: receipt(8, 'reinforcement', 'apple', { quiz: { quizId: 'q1', ok: true, correct: false, source: 'application', next: 'retry' } }) });
    await vi.waitFor(() => expect(answers).toHaveLength(6));
    expect(answers).toEqual([
      { cardId: 'apple', via: 'voice', result: 'correct', mastered: false, revision: 3 },
      { cardId: 'apple', via: 'voice', result: 'correct', mastered: true, revision: 4 },
      { cardId: 'milk', via: 'voice', result: 'close', mastered: false, revision: 5 },
      { cardId: 'sentence_apple', via: 'voice', result: 'close', mastered: false, quizId: 'q5', revision: 6 },
      { cardId: 'milk', via: 'choice', result: 'correct', mastered: false, quizId: 'q2', revision: 7 },
      { cardId: 'apple', via: 'choice', result: 'wrong', mastered: false, quizId: 'q1', revision: 8 },
    ]);
    expect(quizzes).toHaveBeenCalledTimes(3); // practice flow control is unchanged
    await classroom.endLesson();
  });
  it('tells the view when the closing recall game (the word battle) starts', async () => {
    const { classroom } = await started();
    const wrapUps = vi.fn(); classroom.on('sitting-wrap-up', wrapUps);
    push({ type: 'sitting-wrap-up' });
    await vi.waitFor(() => expect(wrapUps).toHaveBeenCalledTimes(1));
    expect(tracks[0].enabled).toBe(true); // the lesson goes on; only the picture changes
    await classroom.endLesson();
  });
  it('keeps applying late results after sitting-ended, disables the mic and waits for goodbye playback before releasing it', async () => {
    const { classroom } = await started();
    const answers = vi.fn(); classroom.on('answer-result', answers);
    const ended = vi.fn(); classroom.on('sitting-ended', ended);
    push({ type: 'sitting-ended' });
    await vi.waitFor(() => expect(ended).toHaveBeenCalledOnce());
    expect(tracks[0].enabled).toBe(false); expect(tracks[0].stop).not.toHaveBeenCalled();
    push({ type: 'receipt', receipt: receipt(7, 'interactive', 'apple', { assessment: { target_id: 'apple', result: 'correct', heard: 'apple', evidence: 'recall', mastered: true, next_action: 'advance', next_card_id: null, next_phase: null } }) });
    await vi.waitFor(() => expect(answers).toHaveBeenCalledOnce());
    provider({ type: 'response.created', response: { id: 'bye', metadata: { kind: 'goodbye' } } });
    provider({ type: 'output_audio_buffer.started', response_id: 'bye' });
    provider({ type: 'response.done', response: { id: 'bye', status: 'completed' } });
    await vi.waitFor(() => expect(classroom.getState()).toBe('speaking'));
    expect(tracks[0].stop).not.toHaveBeenCalled();
    provider({ type: 'output_audio_buffer.stopped', response_id: 'bye' });
    await vi.waitFor(() => expect(tracks[0].stop).toHaveBeenCalledOnce());
    expect(bodies.at(-1)?.action).toBe('end');
  });
  it('passes the word-battle switch to the server when the lesson starts', async () => {
    const classroom = new RealtimeClassroom(foodCourse);
    expect(await classroom.startLesson('child', { game: true })).toBe(true);
    expect(bodies.find((b) => b.action === 'start')).toMatchObject({ game: true });
    await classroom.endLesson();
  });
  it('applies a picture choice once and ends the call after the goodbye at completion', async () => {
    const { classroom } = await started();
    const results = vi.fn(); classroom.on('quiz-result', results);
    await classroom.submitPick('q1', 'apple');
    push({ type: 'receipt', receipt: receipt(7, 'reinforcement', 'apple', { quiz: { quizId: 'q1', ok: true, correct: true, source: 'application', next: 'advance' } }) });
    await new Promise((r) => setTimeout(r, 20)); expect(results).toHaveBeenCalledTimes(1);
    await classroom.completeReinforcement();
    expect(tracks[0].enabled).toBe(false);
    provider({ type: 'response.created', response: { id: 'bye', metadata: { kind: 'goodbye' } } });
    provider({ type: 'output_audio_buffer.started', response_id: 'bye' }); provider({ type: 'response.done', response: { id: 'bye', status: 'completed' } });
    provider({ type: 'output_audio_buffer.stopped', response_id: 'bye' });
    await vi.waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
    expect(bodies.at(-1)?.action).toBe('end');
  });
});

it('treats back-to-back replies as one output buffer, as the provider reports them', async () => {
  // Observed on gpt-realtime-2.1: one started (first id) and one stopped (last id) for two overlapping responses.
  const classroom = new RealtimeClassroom(foodCourse); expect(await classroom.startLesson('child')).toBe(true);
  let resolved = false; const prompt = classroom.presentQuiz('q1').then(() => { resolved = true; });
  await vi.waitFor(() => expect(bodies.some((b) => b.action === 'present-quiz')).toBe(true));
  provider({ type: 'response.created', response: { id: 'feedback', metadata: { kind: 'pick-feedback' } } });
  provider({ type: 'output_audio_buffer.started', response_id: 'feedback' });
  provider({ type: 'response.done', response: { id: 'feedback', status: 'completed' } });
  provider({ type: 'response.created', response: { id: 'p1', metadata: { kind: 'present-quiz', quiz_id: 'q1' } } });
  await new Promise((r) => setTimeout(r, 20)); expect(resolved).toBe(false); // prompt still generating
  provider({ type: 'response.done', response: { id: 'p1', status: 'completed' } });
  await new Promise((r) => setTimeout(r, 20)); expect(resolved).toBe(false); // generated but buffer still playing
  expect(classroom.getState()).toBe('speaking');
  provider({ type: 'output_audio_buffer.stopped', response_id: 'p1' });
  await prompt; expect(resolved).toBe(true);
  await vi.waitFor(() => expect(classroom.getState()).toBe('awaiting'));
  await classroom.endLesson();
});

describe('word-card sounds', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const assessment = (target_id: string, result: string) => ({ assessment: { target_id, result, heard: 'x', evidence: 'x', mastered: result === 'correct', next_action: 'retry', next_card_id: null, next_phase: null } });
  let ends: Array<() => void>;
  let sounds: { play: ReturnType<typeof vi.fn<CardSounds['play']>>; preload: ReturnType<typeof vi.fn<CardSounds['preload']>> };
  beforeEach(() => {
    ends = [];
    sounds = { play: vi.fn<CardSounds['play']>(() => new Promise<void>((resolve) => { ends.push(resolve); })), preload: vi.fn<CardSounds['preload']>() };
  });
  async function soundStarted(speaker = false) {
    const classroom = new RealtimeClassroom(instrumentsCourse, sounds);
    const cues: SoundCue[] = []; classroom.on('sound-cue', (cue) => cues.push(cue));
    const hidden: Array<{ cardId: string; hidden: boolean }> = []; classroom.on('word-hidden', (h) => hidden.push(h));
    expect(await classroom.startLesson('child', { speaker })).toBe(true);
    push({ type: 'receipt', receipt: receipt(1, 'interactive', 'piano') });
    return { classroom, cues, hidden };
  }
  it('preloads the lesson sounds once the call starts', async () => {
    const { classroom } = await soundStarted();
    expect(sounds.preload).toHaveBeenCalledWith(instrumentsCourse.cards.flatMap((card) => card.soundUrl ? [card.soundUrl] : []));
    expect(sounds.preload.mock.calls[0][0]).toHaveLength(8);
    await classroom.endLesson();
  });
  it('waits for the teacher, closes the mic while waiting and playing even with speaker mode off, and reopens 500 ms after the sound', async () => {
    const { classroom, cues } = await soundStarted(false);
    provider({ type: 'response.created', response: { id: 'r1', metadata: null } });
    provider({ type: 'output_audio_buffer.started', response_id: 'r1' });
    await vi.waitFor(() => expect(classroom.getState()).toBe('speaking'));
    expect(tracks[0].enabled).toBe(true); // speaker mode off: open while the teacher speaks
    push({ type: 'receipt', receipt: receipt(2, 'interactive', 'drum', { cue: 'sound' }) });
    await vi.waitFor(() => expect(cues).toEqual([{ cardId: 'drum', status: 'waiting' }]));
    expect(tracks[0].enabled).toBe(false);
    provider({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
    await sleep(20); expect(sounds.play).not.toHaveBeenCalled(); // generated but still playing
    provider({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
    await vi.waitFor(() => expect(sounds.play).toHaveBeenCalledWith('/sounds/words/instruments/drum.mp3'));
    expect(cues.at(-1)).toEqual({ cardId: 'drum', status: 'playing' });
    await sleep(600); expect(tracks[0].enabled).toBe(false);
    ends[0]();
    await vi.waitFor(() => expect(cues.at(-1)).toEqual({ cardId: 'drum', status: 'done' }));
    await sleep(300); expect(tracks[0].enabled).toBe(false);
    await vi.waitFor(() => expect(tracks[0].enabled).toBe(true));
    expect(sounds.play).toHaveBeenCalledTimes(1);
    await classroom.endLesson();
  });
  it('does not play while paused and plays after resume', async () => {
    const { classroom, cues } = await soundStarted();
    await classroom.setPaused!(true);
    push({ type: 'receipt', receipt: receipt(2, 'interactive', 'drum', { cue: 'sound' }) });
    await vi.waitFor(() => expect(cues).toEqual([{ cardId: 'drum', status: 'waiting' }]));
    await sleep(30); expect(sounds.play).not.toHaveBeenCalled();
    await classroom.setPaused!(false);
    expect(sounds.play).toHaveBeenCalledTimes(1);
    expect(tracks[0].enabled).toBe(false); // closed while the sound plays
    await classroom.endLesson();
  });
  it('skips a sound whose card was replaced before it started', async () => {
    const { classroom, cues } = await soundStarted();
    provider({ type: 'response.created', response: { id: 'r1', metadata: null } });
    push({ type: 'receipt', receipt: receipt(2, 'interactive', 'drum', { cue: 'sound' }) });
    push({ type: 'receipt', receipt: receipt(3, 'interactive', 'music') });
    await vi.waitFor(() => expect(cues).toEqual([{ cardId: 'drum', status: 'waiting' }, { cardId: 'drum', status: 'done' }]));
    provider({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
    await sleep(20); expect(sounds.play).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(tracks[0].enabled).toBe(true));
    await classroom.endLesson();
  });
  it('ignores receipts without a cue and cues for cards without a sound', async () => {
    const { classroom, cues } = await soundStarted();
    push({ type: 'receipt', receipt: receipt(2, 'interactive', 'drum') });
    push({ type: 'receipt', receipt: receipt(3, 'interactive', 'music', { cue: 'sound' }) });
    await sleep(30);
    expect(cues).toEqual([]); expect(sounds.play).not.toHaveBeenCalled(); expect(tracks[0].enabled).toBe(true);
    await classroom.endLesson();
  });
  it('hides a sound quiz until a correct answer for that card; other receipts on the same card do not reveal or replay it', async () => {
    const { classroom, hidden } = await soundStarted();
    push({ type: 'receipt', receipt: receipt(2, 'interactive', 'guitar', { cue: 'sound-quiz' }) });
    await vi.waitFor(() => expect(hidden).toEqual([{ cardId: 'guitar', hidden: true }]));
    push({ type: 'receipt', receipt: receipt(3, 'interactive', 'guitar', assessment('guitar', 'close')) });
    push({ type: 'receipt', receipt: receipt(4, 'interactive', 'guitar', assessment('piano', 'correct')) }); // bound to an earlier screen
    await sleep(30); expect(hidden).toHaveLength(1);
    push({ type: 'receipt', receipt: receipt(5, 'interactive', 'guitar', assessment('guitar', 'correct')) });
    await vi.waitFor(() => expect(hidden).toEqual([{ cardId: 'guitar', hidden: true }, { cardId: 'guitar', hidden: false }]));
    expect(sounds.play).toHaveBeenCalledTimes(1);
    await classroom.endLesson();
  });
  it('reveals a sound quiz when the teacher shows the same card again, or leaves it', async () => {
    const { classroom, hidden } = await soundStarted();
    push({ type: 'receipt', receipt: receipt(2, 'interactive', 'guitar', { cue: 'sound-quiz' }) });
    push({ type: 'receipt', receipt: receipt(3, 'interactive', 'guitar', { cue: 'sound-quiz' }) }); // deliberate replay: stays hidden
    push({ type: 'receipt', receipt: receipt(4, 'interactive', 'guitar') });
    await vi.waitFor(() => expect(hidden).toEqual([{ cardId: 'guitar', hidden: true }, { cardId: 'guitar', hidden: false }]));
    push({ type: 'receipt', receipt: receipt(5, 'interactive', 'bell', { cue: 'sound-quiz' }) });
    push({ type: 'receipt', receipt: receipt(6, 'interactive', 'harp') });
    await vi.waitFor(() => expect(hidden.slice(2)).toEqual([{ cardId: 'bell', hidden: true }, { cardId: 'bell', hidden: false }]));
    await classroom.endLesson();
  });
  it('replays a card sound locally with the same gating and tells nobody', async () => {
    const { classroom, cues } = await soundStarted(true);
    push({ type: 'receipt', receipt: receipt(2, 'interactive', 'bell') });
    await sleep(20);
    const posts = bodies.length;
    classroom.replaySound('harp'); // not the displayed card
    classroom.replaySound('bell');
    expect(cues).toEqual([{ cardId: 'bell', status: 'waiting' }, { cardId: 'bell', status: 'playing' }]);
    expect(tracks[0].enabled).toBe(false);
    ends[0]();
    await vi.waitFor(() => expect(cues.at(-1)).toEqual({ cardId: 'bell', status: 'done' }));
    await vi.waitFor(() => expect(tracks[0].enabled).toBe(true));
    expect(bodies.length).toBe(posts);
    await classroom.endLesson();
  });
});

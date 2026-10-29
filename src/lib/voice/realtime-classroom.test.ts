import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { RealtimeClassroom } from './realtime-classroom';

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

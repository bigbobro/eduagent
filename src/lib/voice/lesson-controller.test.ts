import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonController } from './lesson-controller';

const asrInstances = vi.hoisted(() => [] as Array<{
  handlers: Map<string, (payload: any) => void>;
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  finish: ReturnType<typeof vi.fn>;
  sendPcm: ReturnType<typeof vi.fn>;
}>);
const asrContextMock = vi.hoisted(() => vi.fn());
const asrOpenQueue = vi.hoisted(() => [] as Array<() => Promise<void>>);

vi.mock('./asr-client', () => {
  class AsrClient {
    handlers = new Map<string, (payload: any) => void>();
    open = vi.fn(() => asrOpenQueue.shift()?.() ?? Promise.resolve());
    close = vi.fn();
    finish = vi.fn();
    sendPcm = vi.fn();

    constructor(context: unknown) {
      asrContextMock(context);
      asrInstances.push(this);
    }

    on(event: string, handler: (payload: any) => void) {
      this.handlers.set(event, handler);
    }
  }

  return { AsrClient };
});

const ttsInstances = vi.hoisted(() => [] as Array<{
  handlers: Map<string, (payload: any) => void>;
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  startSession: ReturnType<typeof vi.fn>;
  sendText: ReturnType<typeof vi.fn>;
  finishSession: ReturnType<typeof vi.fn>;
  cancelSession: ReturnType<typeof vi.fn>;
  emit: (event: string, payload?: any) => void;
}>);

vi.mock('./tts-client', () => {
  class TtsClient {
    handlers = new Map<string, (payload: any) => void>();
    open = vi.fn(async () => {});
    close = vi.fn();
    startSession = vi.fn();
    sendText = vi.fn();
    finishSession = vi.fn();
    cancelSession = vi.fn();

    constructor() {
      ttsInstances.push(this);
    }

    on(event: string, handler: (payload: any) => void) {
      this.handlers.set(event, handler);
    }

    emit(event: string, payload?: any) {
      this.handlers.get(event)?.(payload);
    }
  }

  return { TtsClient };
});

vi.mock('@/lib/audio/pcm-player', () => {
  class PcmPlayer {
    onIdle = vi.fn();
    enqueue = vi.fn();
    stop = vi.fn(async () => {}); // Now async
    prewarm = vi.fn(async () => {}); // New prewarm method
    dispose = vi.fn(async () => {});
    isIdle = vi.fn(() => true);
  }

  return { PcmPlayer };
});

const recorderPrewarm = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/audio/recorder', () => ({
  LessonRecorder: class {
    start = vi.fn(async () => ({ stop: vi.fn(async () => {}) }));
    prewarm = recorderPrewarm;
    dispose = vi.fn(async () => {});
  },
}));

function sseResponse(): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));
      controller.close();
    },
  }), { status: 200, headers: { 'X-Session-Id': 'session-1' } });
}

describe('LessonController', () => {
  beforeEach(() => {
    asrInstances.length = 0;
    asrOpenQueue.length = 0;
    ttsInstances.length = 0;
    asrContextMock.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('can emit ASR final without routing the utterance to chat', async () => {
    const controller = new LessonController();
    const asrFinal = vi.fn();
    const states: string[] = [];
    (controller as any).sessionId = 'session-1';
    (controller as any).setState('awaiting');
    controller.on('asr-final', asrFinal);
    controller.on('state', (state) => states.push(state));

    await controller.startListening({ routeToChat: false });
    asrInstances[0].handlers.get('final')?.('This is an apple.');

    await vi.waitFor(() => expect(asrFinal).toHaveBeenCalledWith({ text: 'This is an apple.' }));
    expect(fetch).not.toHaveBeenCalled();
    expect(states).toContain('awaiting');
  });

  it('drops the stale word-card hot-word context for reinforcement (routeToChat:false)', async () => {
    const controller = new LessonController();
    (controller as any).sessionId = 'session-1';
    (controller as any).courseId = 'magic';
    (controller as any).currentAsrCardId = 'princess'; // frozen last interactive word card
    (controller as any).setState('awaiting');

    await controller.startListening({ routeToChat: false });

    // cardId is dropped → asr-proxy falls back to the whole-course hot words instead of a single
    // frozen "princess" that biases recognition against the reinforcement sentence.
    expect((controller as any).currentAsrCardId).toBeNull();
    expect(asrContextMock).toHaveBeenLastCalledWith({ courseId: 'magic' });
  });

  it('injects repeat-after-me sentence candidates and clears them on the next word round', async () => {
    const controller = new LessonController();
    (controller as any).sessionId = 'session-1';
    (controller as any).courseId = 'sports';
    (controller as any).setState('awaiting');

    await controller.startListening({
      routeToChat: false,
      asrSentenceTexts: ['I play tennis.', 'I like swimming.'],
    });

    expect(asrContextMock).toHaveBeenLastCalledWith({
      courseId: 'sports',
      sentenceTexts: ['I play tennis.', 'I like swimming.'],
    });

    // A regular word round (routeToChat default) must not inherit the quiz sentences.
    (controller as any).setState('awaiting');
    await controller.startListening();

    expect(asrContextMock).toHaveBeenLastCalledWith({ courseId: 'sports' });
  });

  it('routes regular ASR final utterances to chat', async () => {
    const controller = new LessonController();
    (controller as any).sessionId = 'session-1';
    (controller as any).setState('awaiting');

    await controller.startListening();
    asrInstances[0].handlers.get('final')?.('apple');

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"message"'),
      }));
    });
  });

  it('returns false and resets to idle when lesson start fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const controller = new LessonController();
    const errors: string[] = [];
    const states: string[] = [];
    controller.on('error', (err) => errors.push(err.message));
    controller.on('state', (state) => states.push(state));

    await expect(controller.startLesson('food')).resolves.toBe(false);

    expect(errors).toContain('课堂暂时没准备好,再试一次吧');
    expect(states).toContain('greeting');
    expect(states).toContain('idle');
    expect(controller.getState()).toBe('idle');
  });

  it('does not close ASR while startup is still opening on immediate release', async () => {
    let resolveOpen!: () => void;
    asrOpenQueue.push(() => new Promise<void>((resolve) => {
      resolveOpen = resolve;
    }));
    const controller = new LessonController();
    const errors: string[] = [];
    (controller as any).sessionId = 'session-1';
    (controller as any).setState('awaiting');
    controller.on('error', (err) => errors.push(err.message));

    const started = controller.startListening();
    await vi.waitFor(() => expect(asrInstances).toHaveLength(1));

    await controller.stopListening();

    expect(asrInstances[0].close).not.toHaveBeenCalled();

    resolveOpen();
    await started;

    expect(asrInstances[0].close).toHaveBeenCalledOnce();
    expect(errors).toContain('太短啦~按住多说一会儿');
    expect(controller.getState()).toBe('awaiting');
  });

  it('speaks static quiz text through the existing TTS session path', async () => {
    const controller = new LessonController();
    const states: string[] = [];
    (controller as any).setState('awaiting');
    controller.on('state', (state) => states.push(state));

    const spoken = controller.speakStatic('  Find the milk. milk.  ');

    expect(ttsInstances[0].startSession).toHaveBeenCalledOnce();
    expect(ttsInstances[0].sendText).toHaveBeenCalledWith('Find the milk. milk.');
    expect(ttsInstances[0].finishSession).toHaveBeenCalledOnce();
    expect(states).toContain('quiz-speaking');

    ttsInstances[0].emit('session-finished');

    await expect(spoken).resolves.toBeUndefined();
    expect(controller.getState()).toBe('awaiting');
  });

  it('rejects static quiz text when TTS errors', async () => {
    const controller = new LessonController();
    (controller as any).setState('awaiting');

    const spoken = controller.speakStatic('apple');
    const rejected = expect(spoken).rejects.toThrow('TTS failed');
    ttsInstances[0].emit('error', { message: 'TTS failed' });

    await rejected;
    expect(controller.getState()).toBe('awaiting');
  });

  it('deduplicates concurrent static quiz speech', async () => {
    const controller = new LessonController();
    (controller as any).setState('awaiting');

    const first = controller.speakStatic('apple');

    await expect(controller.speakStatic('milk')).rejects.toThrow('Static TTS already in progress');

    ttsInstances[0].emit('session-finished');
    await expect(first).resolves.toBeUndefined();
  });
});

describe('R1 (2026-07-20 session persistence): resume info from X-Resume-Info header', () => {
  beforeEach(() => {
    asrInstances.length = 0;
    asrOpenQueue.length = 0;
    ttsInstances.length = 0;
    asrContextMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function resumeSseResponse(resumeInfo: Record<string, unknown> | null): Response {
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    }), {
      status: 200,
      headers: {
        'X-Session-Id': 'test-session',
        ...(resumeInfo ? { 'X-Resume-Info': JSON.stringify(resumeInfo) } : {}),
      },
    });
  }

  it('exposes parsed resume info after a resumed start', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resumeSseResponse({
      resumed: true,
      phase: 'interactive',
      clearedCardIds: ['cat', 'dog'],
      resumeCardId: 'bird',
      passedQuizIds: ['q1'],
    })));
    const controller = new LessonController();

    await controller.startLesson('animals');

    expect(controller.getResumeInfo()).toEqual({
      resumed: true,
      phase: 'interactive',
      clearedCardIds: ['cat', 'dog'],
      resumeCardId: 'bird',
      passedQuizIds: ['q1'],
    });
  });

  it('has no resume info for a fresh start (header absent) — byte-identical to today', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resumeSseResponse(null)));
    const controller = new LessonController();

    await controller.startLesson('animals');

    expect(controller.getResumeInfo()).toBeNull();
  });

  it('degrades to null on a malformed X-Resume-Info header instead of throwing', async () => {
    const res = new Response(new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n')); c.close(); },
    }), { status: 200, headers: { 'X-Session-Id': 'test-session', 'X-Resume-Info': '{not json' } });
    vi.stubGlobal('fetch', vi.fn(async () => res));
    const controller = new LessonController();

    await expect(controller.startLesson('animals')).resolves.toBe(true);
    expect(controller.getResumeInfo()).toBeNull();
  });

  it('clears resume info on endLesson', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resumeSseResponse({
      resumed: true,
      phase: 'interactive',
      clearedCardIds: [],
      resumeCardId: 'cat',
      passedQuizIds: [],
    })));
    const controller = new LessonController();
    await controller.startLesson('animals');
    expect(controller.getResumeInfo()).not.toBeNull();

    await controller.endLesson();

    expect(controller.getResumeInfo()).toBeNull();
  });
});

describe('R1: actions buffered until TTS session-finished', () => {
  beforeEach(() => {
    asrInstances.length = 0;
    asrOpenQueue.length = 0;
    ttsInstances.length = 0;
    asrContextMock.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeSseResponse(frames: string): Response {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frames));
        controller.close();
      },
    }), { status: 200, headers: { 'X-Session-Id': 'test-session' } });
  }

  it('does not emit actions immediately when SSE actions event arrives', async () => {
    const actionsFrame =
      'event: actions\ndata: {"actions":[{"tool":"show_card","params":{"card_id":"apple"}}]}\n\n' +
      'event: done\ndata: {}\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => makeSseResponse(actionsFrame)));

    const controller = new LessonController();
    // Bypass TTS prewarm — bind handlers to the mock TTS
    (controller as any).bindTtsHandlers();
    (controller as any).sessionId = 'test-session';

    const actionsReceived: any[] = [];
    controller.on('actions', (a) => actionsReceived.push(a));

    // Exercise the public command path with a complete acknowledged SSE turn.
    (controller as any).sessionId = 'session-1';
    await expect(controller.sendCustomAction({ action: 'message', text: 'hello' })).resolves.toEqual({ ok: true });

    // Actions should be buffered — not yet emitted because session-finished hasn't fired
    expect(actionsReceived).toHaveLength(0);
    expect((controller as any).pendingActions).toEqual([{ tool: 'show_card', params: { card_id: 'apple' } }]);
  });

  it('emits buffered actions when TTS session-finished fires', async () => {
    const actionsFrame =
      'event: actions\ndata: {"actions":[{"tool":"show_card","params":{"card_id":"apple"}}]}\n\n' +
      'event: done\ndata: {}\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => makeSseResponse(actionsFrame)));

    const controller = new LessonController();
    (controller as any).bindTtsHandlers();
    (controller as any).sessionId = 'test-session';

    const actionsReceived: any[] = [];
    controller.on('actions', (a) => actionsReceived.push(a));

    (controller as any).sessionId = 'session-1';
    await expect(controller.sendCustomAction({ action: 'message', text: 'hello' })).resolves.toEqual({ ok: true });

    // Still buffered
    expect(actionsReceived).toHaveLength(0);

    // Fire session-finished from the TTS mock
    ttsInstances[0].emit('session-finished');

    expect(actionsReceived).toHaveLength(1);
    expect(actionsReceived[0]).toEqual([{ tool: 'show_card', params: { card_id: 'apple' } }]);
    expect((controller as any).pendingActions).toBeNull();
  });

  it('syncs ASR context from progress snapshots and flushed show_card actions', async () => {
    const frames =
      'event: actions\ndata: {"actions":[{"tool":"show_card","params":{"card_id":"dog"}}]}\n\n' +
      'event: progress_snapshot\ndata: {"clearedCardIds":["cat"],"totalAttempts":1,"currentPhase":"interactive"}\n\n' +
      'event: done\ndata: {}\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => makeSseResponse(frames)));

    const controller = new LessonController();
    (controller as any).bindTtsHandlers();
    (controller as any).courseId = 'animals';

    (controller as any).sessionId = 'session-1';
    await expect(controller.sendCustomAction({ action: 'message', text: 'hello' })).resolves.toEqual({ ok: true });
    ttsInstances[0].emit('session-finished');
    (controller as any).setState('awaiting');
    await controller.startListening();

    expect(asrContextMock).toHaveBeenLastCalledWith({
      courseId: 'animals',
      cardId: 'dog',
      clearedCardIds: ['cat'],
    });
  });

  it('clears pendingActions on endLesson without emitting', async () => {
    const controller = new LessonController();
    (controller as any).bindTtsHandlers();
    (controller as any).sessionId = 'test-session';
    (controller as any).pendingActions = [{ tool: 'show_card', params: { card_id: 'apple' } }];

    const actionsReceived: any[] = [];
    controller.on('actions', (a) => actionsReceived.push(a));

    await controller.endLesson();

    expect(actionsReceived).toHaveLength(0);
    expect((controller as any).pendingActions).toBeNull();
  });

  it('releases buffered actions on TTS error so UI does not freeze', async () => {
    const controller = new LessonController();
    (controller as any).bindTtsHandlers();
    (controller as any).sessionId = 'test-session';
    (controller as any).pendingActions = [{ tool: 'show_card', params: { card_id: 'milk' } }];
    (controller as any).sseCommitted = true;

    const actionsReceived: any[] = [];
    controller.on('actions', (a) => actionsReceived.push(a));

    ttsInstances[0].emit('error', { message: 'TTS failed' });

    expect(actionsReceived).toHaveLength(1);
    expect((controller as any).pendingActions).toBeNull();
  });
});

describe('§1 loop-reliability fixes', () => {
  beforeEach(() => {
    asrInstances.length = 0;
    asrOpenQueue.length = 0;
    ttsInstances.length = 0;
    asrContextMock.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeSseResponse(frames: string): Response {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frames));
        controller.close();
      },
    }), { status: 200, headers: { 'X-Session-Id': 'test-session' } });
  }

  // bug 1: recorderLock must be released on every startListening failure path, or push-to-talk
  // is permanently dead until the controller is recreated.
  it('releases recorderLock after asr.open() rejects so a retry still works', async () => {
    asrOpenQueue.push(() => Promise.reject(new Error('asr down')));
    const controller = new LessonController();
    const errors: string[] = [];
    (controller as any).sessionId = 'session-1';
    (controller as any).setState('awaiting');
    controller.on('error', (err) => errors.push(err.message));

    await controller.startListening();
    expect(errors).toContain('ASR 连接失败,请重试');
    expect(controller.getState()).toBe('awaiting');
    expect((controller as any).recorderLock).toBe(false);

    // Second press must NOT be short-circuited by a stuck lock.
    await controller.startListening();
    expect(controller.getState()).toBe('listening');
    expect(asrInstances).toHaveLength(2);
  });

  // bug 2: the speech-finish fallback timer must flush buffered actions, otherwise the card on
  // screen desyncs from what the teacher just said when the TTS finish frame is dropped.
  it('flushes pendingActions when the speech-finish fallback timer fires', () => {
    vi.useFakeTimers();
    try {
      const controller = new LessonController();
      (controller as any).bindTtsHandlers();
      (controller as any).courseId = 'animals';
      (controller as any).setState('speaking');
      (controller as any).pendingActions = [{ tool: 'show_card', params: { card_id: 'dog' } }];
      (controller as any).sseCommitted = true;
      const actionsReceived: any[] = [];
      controller.on('actions', (a) => actionsReceived.push(a));

      (controller as any).armSpeechFinishFallback();
      expect(actionsReceived).toHaveLength(0);

      vi.advanceTimersByTime(1500);

      expect(actionsReceived).toHaveLength(1);
      expect(actionsReceived[0]).toEqual([{ tool: 'show_card', params: { card_id: 'dog' } }]);
      expect((controller as any).pendingActions).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // bug 6: consumeSSE must release the reader lock even when the stream errors.
  it('releases the SSE reader lock and skips afterDone when the stream errors', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('stream boom'));
      },
    });
    const controller = new LessonController();
    (controller as any).bindTtsHandlers();
    const afterDone = vi.fn();

    await expect((controller as any).consumeSSE(body, afterDone)).rejects.toThrow('stream boom');
    expect(body.locked).toBe(false);
    expect(afterDone).not.toHaveBeenCalled();
  });

  // bug 4 (client): a hung /api/chat must self-rescue via the watchdog.
  it('client watchdog aborts and recovers to awaiting when no SSE event arrives', () => {
    vi.useFakeTimers();
    try {
      const controller = new LessonController();
      (controller as any).chatAbort = new AbortController();
      (controller as any).setState('thinking');
      const errors: string[] = [];
      controller.on('error', (err) => errors.push(err.message));

      (controller as any).armChatWatchdog();
      vi.advanceTimersByTime(25000);

      expect(errors).toContain('我有点没反应过来…我们再聊一句?');
      expect(controller.getState()).toBe('awaiting');
      expect((controller as any).chatAbort.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('first SSE event clears the chat watchdog so it cannot misfire mid-response', () => {
    const controller = new LessonController();
    (controller as any).bindTtsHandlers();
    (controller as any).chatAbort = new AbortController();
    (controller as any).setState('thinking');

    (controller as any).armChatWatchdog();
    expect((controller as any).timers.has('chatWatchdog')).toBe(true);

    (controller as any).handleSseEvent({ type: 'progress_snapshot', clearedCardIds: [], totalAttempts: 0, currentPhase: 'interactive' }, () => {}, () => {});

    expect((controller as any).timers.has('chatWatchdog')).toBe(false);
  });

  // bug 4 (server timeout surfaces as an SSE error): client must recover from thinking.
  it('recovers to awaiting when the server sends an SSE error while thinking', async () => {
    const frames = 'event: error\ndata: {"message":"LLM API error: 504"}\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => makeSseResponse(frames)));
    const controller = new LessonController();
    (controller as any).bindTtsHandlers();
    (controller as any).setState('thinking');
    const errors: string[] = [];
    controller.on('error', (err) => errors.push(err.message));

    (controller as any).sessionId = 'session-1';
    await expect(controller.sendCustomAction({ action: 'message', text: 'hello' })).resolves.toEqual({ ok: false });

    expect(controller.getState()).toBe('awaiting');
    expect(errors).toContain('我有点没反应过来…再试一次吧');
  });
});

describe('thinking wait behavior', () => {
  beforeEach(() => {
    asrInstances.length = 0;
    asrOpenQueue.length = 0;
    ttsInstances.length = 0;
    asrContextMock.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does NOT play local audio while waiting for chat after ASR final', async () => {
    const controller = new LessonController();
    (controller as any).sessionId = 'session-1';
    (controller as any).routeCurrentAsrToChat = true;
    (controller as any).setState('thinking');

    await (controller as any).handleAsrFinal('cat');

    expect((controller as any).player.enqueue).not.toHaveBeenCalled();
  });
});


describe('command acknowledgements', () => {
  beforeEach(() => { ttsInstances.length = 0; });
  afterEach(() => { vi.unstubAllGlobals(); });

  function stream(frames: string, headers: Record<string, string> = {}): Response {
    return new Response(frames, { headers: { 'X-Session-Id': 'failed-opening', ...headers } });
  }

  it('shows a preserved-progress error without sending end for an uncreated session', async () => {
    const fetchMock = vi.fn(async () => Response.json({ code: 'INVALID_COURSE_PROGRESS' }, { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new LessonController();
    const error = vi.fn(); controller.on('error', error);
    await expect(controller.startLesson('food')).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith({ message: '这门课的学习进度暂时无法读取，已保留原记录。' });
    expect(controller.getSessionId()).toBeNull();
    expect(controller.getState()).toBe('idle');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['{broken', 'null', '[]'])('does not acknowledge a malformed done payload: %s', async (payload) => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => JSON.parse(options.body).action === 'end'
      ? Response.json({ ok: true }) : stream(`event: done\ndata: ${payload}\n\n`)));
    const controller = new LessonController();
    await expect(controller.startLesson('food')).resolves.toBe(false);
    expect(controller.getSessionId()).toBeNull();
    expect(controller.getState()).toBe('idle');
  });

  it.each(['http', 'error', 'truncated', 'network'])('keeps opening retryable after %s failure', async (failure) => {
    let failed = false;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      if (JSON.parse(options.body).action === 'end') return Response.json({ ok: true });
      if (failed) return stream('event: done\ndata: {}\n\n');
      failed = true;
      if (failure === 'network') throw new TypeError('network');
      if (failure === 'http') return new Response('', { status: 500 });
      return stream(failure === 'error' ? 'event: error\ndata: {"message":"unavailable"}\n\n' : 'event: speech-delta\ndata: {"text":"Hi"}\n\n');
    }));
    const controller = new LessonController();
    await expect(controller.startLesson('food')).resolves.toBe(false);
    expect(controller.getState()).toBe('idle');
    expect(controller.getSessionId()).toBeNull();
    await expect(controller.startLesson('food')).resolves.toBe(true);
    await controller.endLesson();
  });

  it('retains the accepted phase when its opening SSE fails and drops unconfirmed actions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => stream('event: actions\ndata: {"actions":[{"tool":"show_card","params":{"card_id":"milk"}}]}\n\nevent: error\ndata: {"message":"failed"}\n\n', { 'X-Lesson-Phase': 'interactive' })));
    const controller = new LessonController();
    (controller as any).sessionId = 'session-1';
    (controller as any).bindTtsHandlers();
    const actions = vi.fn();
    controller.on('actions', actions);
    await expect(controller.sendCustomAction({ action: 'phase-transition', to: 'interactive' })).resolves.toEqual({ ok: false, acceptedPhase: 'interactive' });
    ttsInstances[0].emit('session-finished');
    expect(actions).not.toHaveBeenCalled();
    expect(controller.getState()).toBe('awaiting');
  });

  it.each(['http', 'network', 'invalid', 'success'])('checks quiz %s acknowledgement', async (kind) => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (kind === 'network') throw new TypeError('network');
      if (kind === 'http') return new Response('', { status: 500 });
      return Response.json({ ok: kind === 'success' });
    }));
    const controller = new LessonController();
    (controller as any).sessionId = 'session-1';
    await expect(controller.submitQuizAnswer('q1', 'apple', true)).resolves.toEqual({ ok: kind === 'success' });
  });
});


describe('classroom run cancellation', () => {
  beforeEach(() => { ttsInstances.length = 0; asrInstances.length = 0; recorderPrewarm.mockReset().mockResolvedValue(undefined); });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['start', 'custom', 'message', 'quiz'])('ignores a late %s response after ending', async (operation) => {
    let release!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { release = resolve; });
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, options) => {
      if (JSON.parse(options.body).action === 'end') return Promise.resolve(Response.json({ ok: true }));
      requestSignal = options.signal;
      return response; // Deliberately ignores abort: the result still needs an identity fence.
    }));
    const controller = new LessonController();
    if (operation !== 'start') {
      (controller as any).sessionId = 'old-session';
      (controller as any).setState('awaiting');
      (controller as any).bindTtsHandlers();
    }
    const pending = operation === 'start' ? controller.startLesson('food')
      : operation === 'quiz' ? controller.submitQuizAnswer('q1', 'apple', true)
      : operation === 'message' ? (controller as any).handleAsrFinal('apple')
      : controller.sendCustomAction({ action: 'message', text: 'apple' });
    await vi.waitFor(() => expect(requestSignal).toBeDefined());
    const ending = controller.endLesson();
    expect(controller.endLesson()).toBe(ending);
    await ending;
    expect(requestSignal!.aborted).toBe(true);
    const events = vi.fn();
    controller.on('state', events);
    release(operation === 'quiz' ? Response.json({ ok: true }) : new Response('event: speech-delta\ndata: {"text":"late"}\n\nevent: done\ndata: {}\n\n', { headers: { 'X-Session-Id': 'late-session' } }));
    const result = await pending;
    if (operation === 'start') expect(result).toBe(false);
    if (operation === 'custom' || operation === 'quiz') expect(result.ok).toBe(false);
    expect(events).not.toHaveBeenCalled();
    expect(controller.getState()).toBe('idle');
    expect(controller.getSessionId()).toBeNull();
    expect(ttsInstances[0].sendText).not.toHaveBeenCalled();
  });

  it('cancels an SSE reader that is waiting for another frame', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => JSON.parse(options.body).action === 'end'
      ? Response.json({ ok: true }) : new Response(new ReadableStream({ cancel }), { headers: { 'X-Session-Id': 'old-session' } })));
    const controller = new LessonController();
    const pending = controller.startLesson('food');
    await vi.waitFor(() => expect(controller.getSessionId()).toBe('old-session'));
    await controller.endLesson();
    await expect(pending).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toBe('idle');
  });

  it('allows a new run while old prewarm is unresolved without reviving the old startup', async () => {
    let release!: () => void;
    recorderPrewarm.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse()));
    const controller = new LessonController();
    const first = controller.startLesson('food');
    await controller.endLesson();
    await expect(first).resolves.toBe(false);
    await expect(controller.startLesson('animals')).resolves.toBe(true);
    release();
    await Promise.resolve();
    expect(controller.getSessionId()).toBe('session-1');
    expect(controller.getState()).toBe('greeting');
    await controller.endLesson();
  });

  it('ignores old ASR handlers and TTS events after end', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse()));
    const controller = new LessonController();
    await controller.startLesson('food');
    (controller as any).setState('awaiting');
    await controller.startListening();
    const asr = asrInstances[0];
    await controller.endLesson();
    const error = vi.fn();
    const subtitle = vi.fn();
    controller.on('error', error);
    controller.on('subtitle', subtitle);
    asr.handlers.get('partial')?.('late');
    asr.handlers.get('final')?.('late');
    asr.handlers.get('error')?.({ message: 'late' });
    ttsInstances[0].emit('subtitle', 'late');
    ttsInstances[0].emit('session-finished');
    ttsInstances[0].emit('error', { message: 'late' });
    expect(error).not.toHaveBeenCalled();
    expect(subtitle).not.toHaveBeenCalled();
    expect(controller.getState()).toBe('idle');
  });
});

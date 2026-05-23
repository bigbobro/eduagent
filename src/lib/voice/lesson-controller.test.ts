import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonController } from './lesson-controller';

const asrInstances = vi.hoisted(() => [] as Array<{
  handlers: Map<string, (payload: any) => void>;
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  finish: ReturnType<typeof vi.fn>;
  sendPcm: ReturnType<typeof vi.fn>;
}>);
const setAsrSessionContextMock = vi.hoisted(() => vi.fn());
const asrOpenQueue = vi.hoisted(() => [] as Array<() => Promise<void>>);

vi.mock('./asr-client', () => {
  class AsrClient {
    handlers = new Map<string, (payload: any) => void>();
    open = vi.fn(() => asrOpenQueue.shift()?.() ?? Promise.resolve());
    close = vi.fn();
    finish = vi.fn();
    sendPcm = vi.fn();

    constructor() {
      asrInstances.push(this);
    }

    on(event: string, handler: (payload: any) => void) {
      this.handlers.set(event, handler);
    }
  }

  return { AsrClient, setAsrSessionContext: setAsrSessionContextMock };
});

const ttsInstances = vi.hoisted(() => [] as Array<{
  handlers: Map<string, (payload: any) => void>;
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  startSession: ReturnType<typeof vi.fn>;
  sendText: ReturnType<typeof vi.fn>;
  finishSession: ReturnType<typeof vi.fn>;
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
    stop = vi.fn();
    dispose = vi.fn(async () => {});
    isIdle = vi.fn(() => true);
  }

  return { PcmPlayer };
});

vi.mock('@/lib/audio/recorder', () => ({
  startRecorder: vi.fn(async () => ({ stop: vi.fn(async () => {}) })),
  prewarmRecorder: vi.fn(async () => {}),
  disposeRecorder: vi.fn(async () => {}),
}));

function sseResponse(): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  }), { status: 200 });
}

describe('LessonController', () => {
  beforeEach(() => {
    asrInstances.length = 0;
    asrOpenQueue.length = 0;
    ttsInstances.length = 0;
    setAsrSessionContextMock.mockClear();
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

describe('R1: actions buffered until TTS session-finished', () => {
  beforeEach(() => {
    asrInstances.length = 0;
    asrOpenQueue.length = 0;
    ttsInstances.length = 0;
    setAsrSessionContextMock.mockClear();
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

    // Simulate startLesson consuming SSE
    // We'll call consumeSSE directly via the chat fetch path
    const res = await fetch('/api/chat', { method: 'POST', body: '{}' });
    await (controller as any).consumeSSE((res as any).body, () => {});

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

    const res = await fetch('/api/chat', { method: 'POST', body: '{}' });
    await (controller as any).consumeSSE((res as any).body, () => {});

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

    const res = await fetch('/api/chat', { method: 'POST', body: '{}' });
    await (controller as any).consumeSSE((res as any).body, () => {});
    ttsInstances[0].emit('session-finished');

    expect(setAsrSessionContextMock).toHaveBeenLastCalledWith({
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

    const actionsReceived: any[] = [];
    controller.on('actions', (a) => actionsReceived.push(a));

    ttsInstances[0].emit('error', { message: 'TTS failed' });

    expect(actionsReceived).toHaveLength(1);
    expect((controller as any).pendingActions).toBeNull();
  });
});

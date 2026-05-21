import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonController } from './lesson-controller';

const asrInstances = vi.hoisted(() => [] as Array<{
  handlers: Map<string, (payload: any) => void>;
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  finish: ReturnType<typeof vi.fn>;
  sendPcm: ReturnType<typeof vi.fn>;
}>);

vi.mock('./asr-client', () => {
  class AsrClient {
    handlers = new Map<string, (payload: any) => void>();
    open = vi.fn(async () => {});
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

  return { AsrClient };
});

vi.mock('./tts-client', () => {
  class TtsClient {
    open = vi.fn(async () => {});
    close = vi.fn();
    startSession = vi.fn();
    sendText = vi.fn();
    finishSession = vi.fn();
    on = vi.fn();
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
});

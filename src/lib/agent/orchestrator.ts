import { streamUserInput, StreamUserEvent } from './session';

function sseFrame(event: string, data: object): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function streamUserInputToSSE(
  sessionId: string,
  userText: string,
  asrResult?: { latency: number; tokens: number }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ac = new AbortController();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of streamUserInput(sessionId, userText, asrResult, ac.signal)) {
          const frame = mapEventToSSE(ev);
          controller.enqueue(encoder.encode(frame));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(sseFrame('error', { message: (err as Error).message }))
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });
}

function mapEventToSSE(ev: StreamUserEvent): string {
  switch (ev.type) {
    case 'speech-delta': return sseFrame('speech-delta', { text: ev.text });
    case 'speech-end':   return sseFrame('speech-end', {});
    case 'actions':      return sseFrame('actions', { actions: ev.actions, state_update: ev.state_update });
    case 'done':         return sseFrame('done', {});
    case 'error':        return sseFrame('error', { message: ev.message });
  }
}

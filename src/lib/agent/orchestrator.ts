import { streamUserInput, StreamUserEvent } from './session';

function sseFrame(event: string, data: object): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function streamUserInputToSSE(
  sessionId: string,
  userText: string,
  asrResult?: { latency: number; tokens: number },
  // R2 literal-hit text. Defaults to userText (real utterance); system turns pass '' to opt out.
  rawAsrText: string = userText
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ac = new AbortController();

  const sidTag = sessionId.slice(0, 8);

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of streamUserInput(sessionId, userText, asrResult, ac.signal, rawAsrText)) {
          if (ev.type === 'speech-delta') {
            // session yields the whole speech as a single delta; log it directly.
            const s = ev.text.replace(/\s+/g, ' ').trim();
            console.log(`[agent ${sidTag}] speech="${s.slice(0, 120)}${s.length > 120 ? '…' : ''}"`);
          } else if (ev.type === 'actions') {
            for (const a of ev.actions) {
              if (a.tool === 'show_card') {
                console.log(`[agent ${sidTag}] show_card → ${a.params.card_id}`);
              }
            }
          }
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
    case 'progress_snapshot':
      return sseFrame('progress_snapshot', {
        clearedCardIds: ev.clearedCardIds,
        totalAttempts: ev.totalAttempts,
        currentPhase: ev.currentPhase,
      });
    case 'done':         return sseFrame('done', {});
    case 'error':        return sseFrame('error', { message: ev.message });
  }
}

import { streamUserInput } from './session';
import { encodeLessonEvent } from '@/lib/lesson-protocol';

export function streamUserInputToSSE(
  sessionId: string,
  userText: string,
  asrResult?: { latency: number; tokens: number },
  // R2 literal-hit text. Defaults to userText (real utterance); system turns pass '' to opt out.
  rawAsrText: string = userText,
  // phaseOpening: system opening/transition turn — exempt from speechCardAlign rewrite.
  opts: { phaseOpening?: boolean } = {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ac = new AbortController();
  let canceled = false;

  const sidTag = sessionId.slice(0, 8);

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of streamUserInput(sessionId, userText, asrResult, ac.signal, rawAsrText, opts)) {
          if (canceled) break;
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
          const frame = encodeLessonEvent(ev);
          controller.enqueue(encoder.encode(frame));
        }
      } catch (err) {
        if (!canceled) controller.enqueue(
          encoder.encode(encodeLessonEvent({ type: 'error', message: (err as Error).message }))
        );
      } finally {
        if (!canceled) controller.close();
      }
    },
    cancel() {
      canceled = true;
      ac.abort();
    },
  });
}

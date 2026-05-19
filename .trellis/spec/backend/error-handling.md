# Error Handling

EduAgent uses simple error shapes, not a custom error class hierarchy. The
important convention is to convert errors at each transport boundary.

## HTTP Routes

- Return JSON errors with `{ error: string }` and an appropriate status. Existing
  examples in `src/app/api/chat/route.ts`:
  - `Course not found` -> 404
  - `Session not found` -> 404
  - `Invalid phase` -> 400
  - `Invalid action` -> 400
- Keep route validation explicit. `phase-transition` checks `to` against the
  current `PhaseName[]` before mutating session state.
- SSE routes return `Response(stream, headers)` with:
  `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`,
  and `Connection: keep-alive`.

## SSE And Agent Streaming

- `src/lib/agent/session.ts` yields a `{ type: 'error', message }` stream event
  if the session is missing or the LLM stream throws.
- `src/lib/agent/orchestrator.ts` maps stream events to SSE frames and catches
  unexpected stream errors by emitting an `error` SSE frame before closing.
- `src/lib/voice/lesson-controller.ts` is responsible for translating SSE
  `error` frames into UI events and returning to a usable state.

## WebSocket Proxies

- ASR/TTS proxy errors are sent to the browser as JSON control frames with
  `{ type: 'error', code, message }`.
- Protocol decode errors use `code: 'decode'`; upstream/provider failures use
  `code: 'upstream'`.
- ASR must not close the upstream connection immediately on user stop. The
  browser sends a `{ type: 'finish' }` control frame, the proxy sends the Doubao
  negative-sequence final packet, and the client closes only after final text.
  This contract is implemented by `AsrClient.finish()` and
  `src/lib/voice/asr-proxy.ts`.

## Provider And Environment Errors

- Missing env vars throw during `ensureInitialized()` in `src/lib/init.ts`.
  In `VOICE_MOCK=true`, only `MIMO_BASE_URL` and `MIMO_API_KEY` are required.
- MiMo failures throw `MiMo LLM error` or `MiMo LLM stream error` with provider
  status and response body in `src/lib/mimo/llm.ts`.
- Browser lesson startup treats TTS and mic prewarm as recoverable: it logs a
  warning and continues when possible.

## Client-Facing Recovery Rules

- If `/api/chat` returns 404 during a lesson message, the current behavior is to
  tell the learner the course expired and return to `awaiting`. This handles dev
  server restarts clearing the in-memory session map.
- Very short recordings are intercepted client-side at `< 800ms` and do not hit
  chat.
- ASR final timeout is 5 seconds; on timeout the controller closes ASR, emits a
  friendly retry message, and returns to `awaiting`.

## Common Mistakes

- Do not let the lesson UI remain in `thinking` after ASR/provider failure; every
  error path must release the push-to-talk flow.
- Do not surface raw provider errors to children in the UI. Keep detailed errors
  in logs and send short learner-safe messages through the controller.
- Do not add catch blocks that swallow state cleanup. If a resource is opened,
  its error path must close or reset it.

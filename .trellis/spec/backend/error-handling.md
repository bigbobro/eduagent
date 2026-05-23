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

## Scenario: Agent Speech / Action Alignment

### 1. Scope / Trigger

- Trigger: `/api/chat` returns SSE that drives both teacher TTS
  (`speech-delta`) and UI card changes (`actions`).
- Because `normalizeAssistantActions()` can override LLM `show_card` output,
  the server must not stream raw LLM speech before guards and card
  normalization have run.

### 2. Signatures

- `streamUserInput(sessionId, userText, asrResult?, signal?)`
  emits, in order: `speech-delta*`, `speech-end`, `actions`,
  `progress_snapshot`, `done`.
- `actions` payload remains `{ actions: ToolAction[], state_update }`.

### 3. Contracts

- `speech-delta` text must be the final server-approved speech, not unguarded
  raw LLM output.
- If the last normalized `show_card` is a word card and speech mentions a
  different target word without mentioning the shown word, rewrite speech to a
  deterministic prompt for the shown card before emitting `speech-delta`.
- Closing guards, premature-closing guards, and speech/card alignment all run
  before TTS receives text.

### 4. Validation & Error Matrix

- Raw LLM says previous card while normalized `show_card` advances to next card
  -> rewrite speech to introduce the next card.
- Raw LLM mentions unlearned closing words -> rewrite through closing guard; do
  not stream the unsafe text first.
- Missing session / LLM stream failure -> emit `error` SSE; do not emit partial
  unsafe speech.

### 5. Good/Base/Bad Cases

- Good: ASR `Dog.` clears `dog`, normalized `show_card:bird`, speech says
  `这是 小鸟 bird`.
- Base: current card remains `dog`, speech says `dog`; no rewrite.
- Bad: normalized `show_card:bird`, speech says `再跟老师说一次 dog`.

### 6. Tests Required

- Unit test `streamUserInput()` for no unsafe pre-guard speech-delta.
- Unit test R-C clear turn: normalized action advances to next card and spoken
  speech names that card.
- `pnpm smoke:lesson` must fail if teacher speech mentions a different target
  word while the last `show_card` points elsewhere.

### 7. Wrong vs Correct

#### Wrong

Stream LLM `speech` deltas immediately, then later normalize `actions`. This
can make the UI show `bird` while TTS still says `dog`.

#### Correct

Buffer LLM speech inside `streamUserInput()`, run all server guards and
normalization, then emit the approved speech followed by normalized actions.

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
- If the user releases push-to-talk before `LessonController.startListening()`
  has finished opening ASR and obtaining the recorder handle, record the stop
  timestamp and finish cleanup only after startup settles. Do not close a
  connecting browser ASR socket from the keyup path.
- If the browser client intentionally closes and `asr-proxy` has already marked
  the connection closed, ignore later upstream `error` / `close` events caused
  by that local teardown. Those events are not provider failures and should not
  emit learner-visible errors or noisy `[asr ...] upstream error` logs.

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
  chat. When the recording ends before ASR startup is armed, use the original
  keyup timestamp for the short-recording decision after startup settles.
- ASR final timeout is 5 seconds; on timeout the controller closes ASR, emits a
  friendly retry message, and returns to `awaiting`.

## Common Mistakes

- Do not let the lesson UI remain in `thinking` after ASR/provider failure; every
  error path must release the push-to-talk flow.
- Do not surface raw provider errors to children in the UI. Keep detailed errors
  in logs and send short learner-safe messages through the controller.
- Do not add catch blocks that swallow state cleanup. If a resource is opened,
  its error path must close or reset it.

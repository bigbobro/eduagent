# Doubao TTS Protocol Notes

This is a project-maintained integration summary, not a copy of the upstream
provider documentation.

Official reference:

- Volcengine / Doubao speech documentation:
  <https://www.volcengine.com/docs/6561>

## Endpoint Used By This Project

EduAgent uses the bidirectional streaming TTS endpoint:

```text
wss://openspeech.bytedance.com/api/v3/tts/bidirection
```

The implementation lives in:

- `src/lib/voice/tts-proxy.ts`
- `src/lib/voice/tts-client.ts`
- `src/lib/voice/doubao-codec.ts`

## Headers

The current implementation uses the older console-style headers:

- `X-Api-App-Id` from `DOUBAO_APP_ID`
- `X-Api-Access-Key` from `DOUBAO_ACCESS_KEY`
- `X-Api-Resource-Id` from `DOUBAO_TTS_RESOURCE_ID`
- `X-Api-Connect-Id`

Note the ASR/TTS naming difference: ASR uses `X-Api-App-Key`; TTS uses
`X-Api-App-Id`.

Do not expose these values to browser code.

## Local Integration Contracts

- The browser opens `/api/voice/tts` against the local server.
- The local proxy opens a single upstream Doubao connection and sends
  StartConnection once.
- After upstream `ConnectionStarted`, the proxy can run multiple TTS sessions
  over the same connection.
- Only one TTS session may be active on a connection at a time.
- Browser control frames sent before `ConnectionStarted` must be queued in
  arrival order and flushed only after upstream readiness:
  - `session-start`
  - `text-chunk`
  - `session-finish`
  - `session-cancel`

## Payload Choices

Project-specific choices that should not drift without tests:

- Use the V3 event framing implemented in `doubao-codec.ts`.
- Keep the codec flag with event semantics stable; do not switch framing based
  on whether a session ID is present.
- Text belongs inside request params for task requests.
- `DOUBAO_TTS_DEFAULT_SPEAKER` selects the default teacher voice.

## Known Project Pitfalls

- The browser WebSocket can open before the upstream provider reports
  `ConnectionStarted`; sending controls too early can drop the opening speech.
- Always preserve queued control order.
- A `session-cancel` may clear local state immediately, but the captured cancel
  frame still needs to flush if the upstream connection becomes ready.
- Do not start the reinforcement static prompt while a phase-transition TTS
  session is still active.

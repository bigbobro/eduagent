# Doubao ASR Protocol Notes

This is a project-maintained integration summary, not a copy of the upstream
provider documentation.

Official reference:

- Volcengine / Doubao speech documentation:
  <https://www.volcengine.com/docs/6561>

## Endpoint Used By This Project

EduAgent uses the optimized bidirectional streaming ASR endpoint:

```text
wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async
```

The implementation lives in:

- `src/lib/voice/asr-proxy.ts`
- `src/lib/voice/asr-client.ts`
- `src/lib/voice/doubao-codec.ts`

## Headers

`src/lib/voice/doubao-auth.ts` builds one auth row. The resource and
connection headers stay either way.

New console (`DOUBAO_AUTH_MODE=apikey`, the default for a new install):

- `X-Api-Key` from `DOUBAO_API_KEY`

Older console (`legacy`). A settings file that already has an App ID or
Access Key and no mode is migrated to this:

- `X-Api-App-Key` from `DOUBAO_APP_ID`
- `X-Api-Access-Key` from `DOUBAO_ACCESS_KEY`

Always:

- `X-Api-Resource-Id` from `DOUBAO_ASR_RESOURCE_ID`
- `X-Api-Request-Id`
- `X-Api-Sequence: -1`

When `DOUBAO_AUTH_MODE` is unset, an API key selects the new console;
otherwise an App ID or Access Key selects the old console. TTS uses
`X-Api-App-Id` instead of `X-Api-App-Key` in the old console. Do not
expose these values to browser code. The header shape was checked against
the project notes and the 2026-10-25 task; a live new-console key has not
been exercised here.

## Local Integration Contracts

- The browser sends PCM chunks to the local ASR proxy over
  `/api/voice/asr`.
- The proxy opens the upstream Doubao WebSocket and sends the full client
  request before flushing any buffered PCM.
- PCM generated before upstream readiness must be buffered, not dropped.
- The browser must send a `{ "type": "finish" }` control frame when the user
  releases push-to-talk. The proxy then sends the negative-sequence final packet
  upstream and waits for final text.
- The client should close only after receiving the final ASR result.

## Payload Choices

Project-specific choices that should not drift without tests:

- `show_utterances: true` is required so the proxy can distinguish partial and
  final utterances.
- `result_type: "full"` keeps the complete sentence instead of returning only
  incremental segments.
- `enable_ddc: false` avoids semantic smoothing that can remove pauses or
  repeated words in child speech.
- ASR hot words are derived from `courseId`, visible `cardId`, and
  `clearedCardIds` when available. The proxy uses the current card and the next
  uncleared word as a small W2 bias window.
- For reinforcement repeat-after-me turns the client also sends `sentenceText`
  query params (one per candidate sentence, current quiz sentence first). The
  proxy injects both the whole sentence (terminal punctuation stripped) and its
  content words as hot words ahead of the course-word fallback. Empirically
  verified (2026-07-03 probe): multi-word hot-word entries containing spaces
  are accepted by the endpoint without an error frame.

## Known Project Pitfalls

- Do not close the upstream socket immediately on user stop; doing so loses the
  final text.
- Do not drop early PCM while the upstream WebSocket is connecting.
- Do not implement lesson-specific dictionary corrections for ASR output. The
  current product direction is to preserve raw ASR and let the teacher loop
  assess pronunciation in context.
- The provider's hot-word behavior has not fully solved short-word and numeric
  normalization mistakes, so tests should assert EduAgent behavior rather than
  assuming provider-perfect recognition.

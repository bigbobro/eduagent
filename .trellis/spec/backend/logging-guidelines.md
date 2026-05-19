# Logging Guidelines

The project currently uses `console.log`, `console.warn`, and `console.error`;
there is no structured logging library. Logs are operational diagnostics for
local development and provider debugging.

## Current Style

- Prefix voice proxy logs with a short per-connection tag. ASR uses
  `[asr ${requestId.slice(0, 8)}]` in `src/lib/voice/asr-proxy.ts`.
- Lesson logs use `[Lesson ${sessionId}]` in `src/lib/logger.ts`.
- Scripts use command-specific prefixes such as `[asr-regression]` in
  `scripts/asr-hotwords-regression.ts`.
- Startup logs belong in `server.ts`, for example the ready URL and startup
  failure.

## What To Log

- Voice/protocol lifecycle milestones that explain timing and stuck states:
  upstream open/close, buffered PCM flush count, finish queued/sent, final seen,
  decode errors, and provider error frames.
- Key lesson/session summaries: session start/end, interaction counts, token
  usage, LLM latency, and emitted actions.
- Smoke/regression script progress and output paths.
- Error paths for new endpoints or services, as required by `CLAUDE.md`.

## What Not To Log

- Never log real credentials: MiMo API keys, Doubao access keys, app IDs used as
  secrets, OAuth secrets, JWTs, or full database connection strings.
- Avoid logging full raw user audio or any derived binary payloads.
- Avoid noisy per-token/per-frame logs in hot paths unless the output is guarded
  as temporary debugging and removed before completion.

## Log Levels In Practice

- Use `console.log` for expected lifecycle events and local diagnostic counters.
- Use `console.warn` for recoverable browser/audio issues, as in recorder
  prewarm and lesson TTS-open fallback.
- Use `console.error` for process/script failures, as in `server.ts` startup
  failure and smoke script failures.

## Common Mistakes

- Do not add permanent logs that print request bodies containing secrets or
  parent PIN data.
- Do not remove diagnostic ASR/TTS lifecycle logs casually; they are how timing
  issues like buffered PCM, missing final frames, and provider close behavior are
  debugged.
- If a log is added only for a temporary investigation, remove it before the
  task is finished unless it becomes part of the operational contract.

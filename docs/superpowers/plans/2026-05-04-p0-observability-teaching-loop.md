# P0 Observability + Teaching Loop Plan

> Lightweight GoalPower plan. No sub-agents.

**Spec:** `docs/superpowers/specs/2026-05-04-p0-observability-teaching-loop.md`

## Tasks

- [x] Add focused tests for current-word detection and prompt guardrails.
- [x] Move word attempt counting out of `addAssistantMessage`; detect attempts from user input before LLM response.
- [x] Write detected word attempts to `word_performance` via `upsertWordPerformance`.
- [x] Track ASR usage from `LessonController` final ASR result into `/api/chat?action=message`.
- [x] Track TTS usage from generated assistant speech in `session.tokenUsage` and interaction logs.
- [x] Update `docs/architecture.md` and `docs/TODO.md`.
- [x] Run `pnpm test` and `pnpm exec tsc --noEmit`.

## Implementation Notes

- ASR does not have a true token unit here. Use recognized text length as the existing `tokens` field until a provider-native metric exists.
- TTS is requested by the browser-side TTS WebSocket, while chat generation happens in `/api/chat`. Count TTS usage from the assistant `speech` string because every successful response is sent to TTS by `LessonController`.
- Word correctness is intentionally conservative: lowercase English token exact match only.

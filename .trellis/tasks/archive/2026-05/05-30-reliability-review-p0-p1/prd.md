# Fix P0/P1 reliability review findings

## Goal

Fix the P0 and P1 findings from the full-project review so the app starts cleanly from a fresh local database, TTS startup is resilient to upstream handshake delay, and lesson start failures are recoverable from the UI.

## Requirements

### P0

* Fresh DB API initialization:
  * `/api/progress`, `/api/stats`, and `/api/sessions` must work on a fresh SQLite database without requiring `/api/chat` to be called first.
  * The fix must avoid polluting existing local data.
* TTS upstream handshake buffering:
  * Client control messages sent before Doubao `ConnectionStarted` must not be dropped or sent to a non-open upstream socket.
  * `session-start`, `text-chunk`, `session-finish`, and `session-cancel` should preserve order.
* Lesson start failure recovery:
  * If `LessonController.startLesson()` cannot start the server session, the lesson screen must not remain stuck in a started/busy intro state.
  * The UI should return to a retryable not-started state or otherwise expose a clear retry path.

### P1

* Add regression coverage for fresh DB API initialization.
* Add regression coverage for delayed TTS upstream readiness.
* Add regression coverage for lesson start failure recovery.

## Acceptance Criteria

* [x] A fresh temp `DATABASE_PATH` passes `/api/progress`, `/api/stats`, and `/api/sessions` smoke checks.
* [x] TTS proxy tests prove control frames are buffered and flushed after upstream readiness.
* [x] UI/controller tests prove failed lesson start does not leave the page stuck.
* [x] `pnpm lint` passes.
* [x] `pnpm exec tsc --noEmit` passes.
* [x] `pnpm test` passes.
* [x] `pnpm run smoke` passes with a temp fresh DB and mock voice env.

## Out of Scope

* P2 migration framework.
* Session persistence/resume.
* Log policy cleanup beyond what is necessary for this fix.
* Real Doubao or MiMo credential validation.

## Notes

The review reproduced the fresh DB failure with:

```bash
DATABASE_PATH=/tmp/eduagent-smoke-empty-review.db VOICE_MOCK=true MIMO_BASE_URL=https://mock.local/v1 MIMO_API_KEY=mock-key pnpm run smoke
```

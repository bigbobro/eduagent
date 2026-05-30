# SessionStore and database migrations

## Goal

Introduce two architecture foundations that reduce future reliability risk:

1. A `SessionStore` boundary so lesson session ownership is no longer hardwired to a module-level `Map`.
2. A lightweight SQLite migration mechanism so future schema changes are explicit, versioned, and testable.

This task is an architecture foundation task, not a full product resume feature.

## What I already know

* Current lesson sessions live in the module-level `sessions` map in `src/lib/agent/session.ts`.
* A browser refresh or dev-server restart can invalidate the in-memory session ID.
* Durable lesson records already live in SQLite through `lesson_logs`, `interaction_logs`, and `word_performance`.
* Current schema creation is `CREATE TABLE IF NOT EXISTS` in `src/lib/db/schema.ts`.
* Recent reliability work added `ensureDatabaseInitialized()` for read-only aggregate routes and documented fresh-DB contracts.
* Project guidance requires architecture docs and `.trellis/spec/` updates when changing DB/session/runtime boundaries.

## Assumptions

* MVP should preserve current runtime behavior: active lesson state may still be in memory after this task.
* MVP should create a seam for persistence/resume without implementing full cross-restart lesson resume.
* Migration mechanism should stay lightweight and local; no ORM or heavy migration framework.
* Existing tests and smoke scripts should remain the quality bar.

## Requirements

### SessionStore boundary

* Define a narrow store interface for active lesson sessions.
* Move direct `sessions` map ownership behind that interface.
* Keep the initial implementation in memory unless a small SQLite-backed metadata write is necessary for the migration story.
* Preserve existing session API behavior:
  * `createSession(course)`
  * `getSession(id)`
  * `endSession(id)`
  * `setSessionPhase(id, phase)`
  * `recordQuizAnswer(...)`
  * `streamUserInput(...)`
* Make the boundary easy to replace later with SQLite-backed resume support.

### Migration mechanism

* Add a minimal schema version table or equivalent durable marker.
* Convert current table creation into versioned, idempotent migration steps.
* Keep migrations additive and safe for existing local `db/eduagent.db`.
* Ensure fresh DB initialization still works for:
  * `/api/progress`
  * `/api/stats`
  * `/api/sessions`
  * `/api/chat`
* Avoid hiding data backfills in route handlers.

### Documentation and specs

* Update `docs/architecture.md` for the new session store and migration boundaries.
* Update `.trellis/spec/backend/database-guidelines.md` for migration contracts.
* Update `.trellis/spec/backend/agent-layer.md` or equivalent session guidance for `SessionStore`.

## Acceptance Criteria

* [x] `src/lib/agent/session.ts` no longer owns the active session map directly; it delegates through a `SessionStore` abstraction.
* [x] Existing lesson/session behavior remains compatible with current API and controller tests.
* [x] SQLite initialization uses explicit versioned migration steps.
* [x] Fresh temp DB tests prove migration bootstraps all required tables.
* [x] Existing aggregate API fresh DB tests still pass.
* [x] `pnpm lint` passes.
* [x] `pnpm exec tsc --noEmit` passes.
* [x] `pnpm test` passes.
* [x] `pnpm run smoke` passes with a temp DB and mock voice env.
* [x] `pnpm smoke:lesson` passes if session/agent/voice boundaries are touched.

## Definition of Done

* Implementation is scoped to architecture foundation, not feature expansion.
* Tests cover migration idempotency and fresh DB initialization.
* Tests cover `SessionStore` behavior or preserve existing session tests through the new boundary.
* Architecture and Trellis specs are updated in the same task.
* No unrelated UI, prompt, course data, or voice provider changes are included.

## Out of Scope

* Full lesson resume after process restart.
* Multi-user accounts or auth.
* Cloud database support.
* ORM adoption.
* Public deployment concerns.
* Changing parent dashboard semantics beyond keeping aggregates working.

## Open Questions

* Should the MVP persist only schema version metadata, or also persist enough session metadata to detect expired sessions more gracefully?

Recommended answer: persist only schema version metadata in this task. Keep session metadata/resume as a follow-up, because full resume requires serializing `LessonMemory`, token usage, current phase, and course compatibility.

## Technical Notes

Likely files:

* `src/lib/agent/session.ts`
* new `src/lib/agent/session-store.ts` or similar
* `src/lib/db/schema.ts`
* `src/lib/init.ts`
* `src/lib/db/index.ts`
* `tests/api/fresh-db-init.test.ts`
* `src/lib/agent/*.test.ts`
* `docs/architecture.md`
* `.trellis/spec/backend/database-guidelines.md`
* `.trellis/spec/backend/agent-layer.md`

Existing context to preserve:

* `ensureDatabaseInitialized()` must remain usable by read-only aggregate routes without provider env validation.
* `/api/chat` still needs provider env validation through `ensureInitialized()`.
* `VOICE_MOCK=true` must keep local and CI-style smoke paths working.

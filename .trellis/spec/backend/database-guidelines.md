# Database Guidelines

EduAgent currently uses `better-sqlite3` directly. There is no ORM and no
separate migration framework.

## Connection And Initialization

- Use `getDb()` from `src/lib/db/index.ts` to access the database. It resolves
  `process.env.DATABASE_PATH || './db/eduagent.db'`, enables WAL mode, and turns
  on foreign keys.
- Initialize tables through `ensureInitialized()` in `src/lib/init.ts`, which
  calls `initDatabase()` once after env validation. The `/api/chat` route does
  this because lesson sessions create and finish logs.
- Read-only aggregate API routes currently call `getDb()` directly; see
  `/api/progress`, `/api/stats`, and `/api/sessions`.

## Schema Conventions

Schema lives in `src/lib/db/schema.ts` and is created with
`CREATE TABLE IF NOT EXISTS`:

- `lesson_logs`: one row per lesson session. Stores `id`, `course_id`,
  `start_time`, `end_time`, `interaction_count`, and serialized `token_usage`.
- `interaction_logs`: one row per user/AI turn or quiz answer. JSON-like fields
  (`actions`, `model_calls`) are stored as strings.
- `word_performance`: per-lesson word attempts with `attempts`, `correct`, and
  `needs_review`.

Use snake_case table and column names in SQLite, then map to camelCase in
TypeScript result objects, as `src/lib/stats.ts` does with aliases such as
`course_id AS courseId`.

## Query Patterns

- Keep write helpers in `src/lib/db/queries.ts`. Existing helpers use
  `db.prepare(...).run(...)` with positional parameters.
- Serialize structured fields explicitly at the write boundary:
  `finishLessonLog` serializes `tokenUsage`, and `insertInteraction` serializes
  `actions` and `modelCalls`.
- Keep aggregation functions pure and injectable. `buildProgressSnapshot(db,
  courses)` and `buildSessionList(db, courses, limit)` accept the DB and course
  registry as parameters, which lets tests pass an in-memory database.
- Clamp user-controlled query params in the route before calling aggregators.
  `src/app/api/sessions/route.ts` clamps `limit` to `1..50`.

## Migrations

There is no migration history yet. Schema changes currently belong in
`initDatabase()` with compatible `CREATE TABLE IF NOT EXISTS` or additive
changes. If a change needs backfill, document it in `docs/architecture.md` and
add a script under `scripts/` rather than hiding it in a route handler.

## Tests

- Use in-memory SQLite for DB/API tests. Existing examples:
  `tests/api/progress.test.ts`, `tests/api/stats.test.ts`,
  `tests/api/sessions.test.ts`, `src/lib/progress.test.ts`, and
  `src/lib/stats.test.ts`.
- Mock `@/lib/db` when testing route handlers so tests do not touch the local
  `db/eduagent.db` file.
- Test both empty database shape and non-empty aggregation behavior.

## Common Mistakes

- Do not read or write SQLite directly in UI components.
- Do not store long-term mastery semantics in session-local fields such as
  `clearedCardIds`; durable progress is derived from `word_performance`.
- Do not copy table JSON strings around as typed objects without parsing or
  serializing at the boundary.

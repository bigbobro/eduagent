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
- Read-only aggregate API routes call `ensureDatabaseInitialized()` from
  `src/lib/init.ts` before reading. They must not require voice/provider env
  credentials just to render journal or parent dashboards.

## Scenario: Fresh DB Aggregate Routes

### 1. Scope / Trigger

- Trigger: changes to `/api/progress`, `/api/stats`, `/api/sessions`,
  `src/lib/init.ts`, or aggregate helpers that affect first-run DB access.
- Reason: fresh local checkouts and temp smoke databases may hit dashboard APIs
  before any lesson has called `/api/chat`.

### 2. Signatures

- `ensureDatabaseInitialized(): void` -> creates SQLite tables only.
- `ensureInitialized(): void` -> validates provider env, then calls
  `ensureDatabaseInitialized()`.
- `GET /api/progress`, `GET /api/stats`, `GET /api/sessions` -> call
  `ensureDatabaseInitialized()` before `getDb()`.

### 3. Contracts

- Aggregate routes must create the schema if `DATABASE_PATH` points to a new
  file.
- Aggregate routes must not validate `DOUBAO_*` or `MIMO_*` env variables.
- `/api/chat` continues to use `ensureInitialized()` because it needs provider
  readiness and writes lesson logs.

### 4. Validation & Error Matrix

- Fresh DB + aggregate route first -> 200 with empty snapshots/lists.
- Missing provider env + aggregate route -> still 200 if DB can be opened.
- Missing provider env + `/api/chat` -> env error from `ensureInitialized()`.

### 5. Good/Base/Bad Cases

- Good: temp `DATABASE_PATH` then `/api/progress` returns all course words with
  zero attempts.
- Base: existing DB returns normal aggregate data.
- Bad: `/api/progress` throws `no such table: word_performance` until a lesson
  is started.

### 6. Tests Required

- Route-level test with a temp `DATABASE_PATH` and no `/api/chat` call first.
- Existing in-memory API tests should still cover empty and non-empty aggregate
  shapes.
- `pnpm run smoke` should pass with a temp DB and mock voice env.

### 7. Wrong vs Correct

#### Wrong

```ts
export async function GET() {
  return NextResponse.json(buildProgressSnapshot(getDb(), allCourses));
}
```

#### Correct

```ts
export async function GET() {
  ensureDatabaseInitialized();
  return NextResponse.json(buildProgressSnapshot(getDb(), allCourses));
}
```

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
- Preserve course-card presentation fields in progress aggregators. Journal and
  done-page UI render `WordMastery` through `PictureCard`, so
  `buildProgressSnapshot(db, courses)` must copy `imageUrl` from each course
  word card instead of returning only mastery counters.
- Clamp user-controlled query params in the route before calling aggregators.
  `src/app/api/sessions/route.ts` clamps `limit` to `1..50`.

## Progress Snapshot Artwork Contract

### 1. Scope / Trigger

- Trigger: changes to `/api/progress`, `src/lib/progress.ts`, or
  `src/types/progress.ts` that alter `WordMastery`.
- Reason: `/journal` depends on the progress response for both mastery data and
  artwork; dropping `imageUrl` makes collected cards render placeholder stripes.

### 2. Signatures

- `buildProgressSnapshot(db: Database, courses: Course[]): ProgressSnapshot`
- `GET /api/progress -> ProgressSnapshot`

### 3. Contracts

- `WordMastery.word`: `WordCard.english`
- `WordMastery.zh`: `WordCard.chinese`
- `WordMastery.imageUrl`: `WordCard.imageUrl`
- `attempts`, `correct`, `masteryStars`, and `lastPracticed` remain derived
  from `word_performance` joined through `lesson_logs`.

### 4. Validation & Error Matrix

- Empty DB -> every course word still appears with `imageUrl`, `attempts=0`,
  `correct=0`, `masteryStars=0`, and `lastPracticed=null`.
- Unknown DB word -> ignored unless it exists in the course registry.
- Missing course card artwork -> caught by course data tests, not by the
  progress aggregator.

### 5. Good/Base/Bad Cases

- Good: mastered `banana` returns counters plus `/images/food/banana.png`.
- Base: unattempted `apple` returns zero counters plus `/images/food/apple.png`.
- Bad: returning only `word` and `zh` forces Journal cards into placeholder art.

### 6. Tests Required

- `src/lib/progress.test.ts` must assert that `imageUrl` survives from course
  cards into `ProgressSnapshot.words`.
- Component tests that render journal word cards should assert an accessible
  image slot exists for at least one collected word.

### 7. Wrong vs Correct

#### Wrong

```ts
return { word: c.english, zh: c.chinese, attempts, correct };
```

#### Correct

```ts
return { word: c.english, zh: c.chinese, imageUrl: c.imageUrl, attempts, correct };
```

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

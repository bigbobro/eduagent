# Directory Structure

EduAgent is a single Next.js app, not a monorepo. Backend code is split by
runtime boundary rather than by generic "service/controller" folders.

## Runtime Entry Points

- `server.ts` is the only process entry point for local dev and production
  start. It loads `.env.local` before importing modules that read `process.env`,
  prepares Next, and routes WebSocket upgrades for `/api/voice/asr` and
  `/api/voice/tts`.
- `src/app/api/**/route.ts` contains App Router HTTP/SSE endpoints. Route
  handlers should stay thin: parse request input, call `src/lib/**`, and return
  `NextResponse` or an SSE `Response`.
- `src/lib/voice/*-proxy.ts` owns server-side WebSocket bridging to Doubao.
  These files are protocol adapters and should not own lesson business rules.
- `src/lib/agent/**` owns lesson session state, MiMo prompt/stream handling,
  SSE framing, memory, and progress events.
- `src/lib/db/**`, `src/lib/progress.ts`, and `src/lib/stats.ts` own durable
  SQLite reads/writes and aggregate views.

## Current Layout

```text
server.ts                         custom Next server + WS upgrade routing
src/app/api/chat/route.ts         lesson chat, phase-transition, quiz, end
src/app/api/courses/route.ts      course registry JSON
src/app/api/progress/route.ts     journal progress snapshot
src/app/api/stats/route.ts        parent dashboard stats
src/app/api/sessions/route.ts     parent session list
src/lib/agent/                    in-memory sessions, prompt, SSE, memory
src/lib/voice/                    Doubao codec, ASR/TTS clients and proxies
src/lib/audio/                    browser audio recorder/player helpers
src/lib/db/                       better-sqlite3 singleton, schema, writes
src/lib/mimo/llm.ts               MiMo chat/completions adapter
src/data/courses/                 source-of-truth course definitions
src/types/                        shared contracts used by API and UI
scripts/                          smoke, report, and provider regression tools
tests/api/                        route-level tests with mocked DB
```

## Placement Rules

- Put new HTTP endpoints under `src/app/api/<name>/route.ts`. Export
  `dynamic = 'force-dynamic'` when the route reads SQLite state, as in
  `src/app/api/progress/route.ts`, `stats/route.ts`, and `sessions/route.ts`.
- Put persistent data writes in `src/lib/db/queries.ts`, not inside route
  handlers. Existing examples are `createLessonLog`, `finishLessonLog`,
  `insertInteraction`, and `upsertWordPerformance`.
- Put aggregate read models outside routes when they contain logic. Existing
  examples are `buildProgressSnapshot` in `src/lib/progress.ts` and
  `buildSessionList` in `src/lib/stats.ts`.
- Put provider protocol parsing/encoding in `src/lib/voice/doubao-codec.ts`.
  Keep ASR/TTS proxy files focused on connection lifecycle, buffering, headers,
  and upstream/client frame translation.
- Put lesson business rules in `src/lib/agent/**` or
  `src/lib/voice/lesson-controller.ts` / `phased-lesson-controller.ts`,
  depending on whether the rule belongs server-side or browser orchestration.

## Examples To Follow

- `src/app/api/chat/route.ts`: action-dispatched route handler with explicit
  status codes and SSE headers.
- `src/lib/agent/session.ts`: in-memory session map plus durable interaction
  writes after a streamed LLM turn.
- `src/lib/voice/asr-proxy.ts`: WebSocket proxy that handles upstream readiness,
  PCM buffering, finish control frames, and structured client error messages.
- `src/lib/progress.ts`: pure aggregation function that accepts a DB instance
  and course list, making it straightforward to unit test.

Avoid adding a new generic backend folder unless the code has a clear runtime
boundary that does not fit these existing modules.

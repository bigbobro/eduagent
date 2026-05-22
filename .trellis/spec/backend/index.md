# Backend Development Guidelines

These guidelines describe the current EduAgent backend: a Next.js 14 app with a
custom `server.ts` for WebSocket upgrades, in-memory lesson sessions, SQLite
lesson logs, MiMo LLM streaming, and Doubao ASR/TTS proxy modules.

## Pre-Development Checklist

- Read `CLAUDE.md` before changing backend behavior; protocol, state-machine,
  latency, and module-responsibility changes must update `docs/architecture.md`
  in the same work.
- Identify the layer you are touching: API route (`src/app/api/**`), agent
  session (`src/lib/agent/**`), voice proxy/client (`src/lib/voice/**`),
  persistence (`src/lib/db/**`, `src/lib/progress.ts`, `src/lib/stats.ts`), or
  scripts (`scripts/**`).
- For voice/provider work, check `docs/architecture.md` and
  `docs/DOUBAO Protocol/{asr,tts}.md` before editing source.
- Keep real credentials out of source, docs, tests, logs, and commit messages.
  Use example env values only.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Backend module ownership and routing | Filled |
| [Database Guidelines](./database-guidelines.md) | SQLite schema, query helpers, progress aggregators | Filled |
| [Error Handling](./error-handling.md) | API, SSE, WebSocket, provider, and client error patterns | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Required tests and review gates for backend changes | Filled |
| [Logging Guidelines](./logging-guidelines.md) | Current console logging style and sensitive-data limits | Filled |
| [Agent Layer](./agent-layer.md) | memory/session/prompt contracts: actions timing, ASR verify, R5 show_card whitelist, R6 closing guard currentWord exempt, R7 mastered auto-advance, assessedMemory invariant | Filled |

## Quality Check

- Run `pnpm test` for shared backend changes. For narrow changes, also run the
  directly relevant file, for example `pnpm test src/lib/voice/doubao-codec.test.ts`
  or `pnpm test tests/api/progress.test.ts`.
- Run `pnpm exec tsc --noEmit` before completing implementation.
- For page/API smoke coverage, use `pnpm run smoke` after starting the dev
  server when routes or course visibility change.
- For Doubao ASR hot-word changes, run `pnpm run voice:asr-hotwords` when real
  provider credentials and fixture audio are available.

## Representative Code Examples

Route handlers should be thin and delegate logic:

```ts
// src/app/api/progress/route.ts
export const dynamic = 'force-dynamic';

export async function GET() {
  const snap = buildProgressSnapshot(getDb(), allCourses);
  return NextResponse.json(snap);
}
```

Database writes should stay behind prepared helpers:

```ts
// src/lib/db/queries.ts
db.prepare(
  'INSERT INTO lesson_logs (id, course_id, start_time) VALUES (?, ?, ?)'
).run(id, courseId, new Date().toISOString());
```

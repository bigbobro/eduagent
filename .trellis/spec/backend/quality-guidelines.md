# Quality Guidelines

Backend quality is defined by state-machine safety, provider boundary tests, and
documentation sync. Type-check success alone is not enough for voice or lesson
flow changes.

## Required Patterns

- Keep API routes thin and delegate logic to `src/lib/**`.
- Use the existing event names and discriminated unions where they exist:
  `StreamUserEvent`, `ToolAction`, `AgentResponse`, `PhaseName`, and
  `CardProgressState`.
- Keep `show_card` as the current-card source of truth. `src/lib/agent/memory.ts`
  applies attempt assessment to the previous current card before syncing a new
  `show_card` action; tests cover this ordering.
- Normalize LLM `show_card` actions before emitting SSE and committing memory.
  In interactive teaching, stale actions for cleared cards or non-current
  targets must be filtered or replaced with the next active word from
  `teachingHints.newCardIds`; do not rely on prompt wording alone for this.
- Treat `cleared` as session-local progress only. Do not describe it as durable
  mastery.
- For provider protocol work, encode/decode with `src/lib/voice/doubao-codec.ts`
  and add codec/proxy tests instead of hand-building frames in feature code.
- Preserve `VOICE_MOCK=true` behavior so local and CI tests can run without real
  Doubao/MiMo calls.

## Forbidden Patterns

- Do not expose Doubao or MiMo keys with `NEXT_PUBLIC_*` variables or client-side
  imports.
- Do not close ASR WebSocket directly on stop; use the finish control-frame flow
  so Doubao can return final text.
- Do not put durable progress writes in React components or browser controllers.
- Do not add dictionary-style ASR correction for one lesson's observed mistakes.
  The current product direction is raw ASR plus LLM attempt assessment.
- Do not introduce long-lived global state outside the existing session map,
  recorder/audio singletons, or DB singleton without documenting lifecycle and
  cleanup.

## Testing Requirements

- Pure logic: add focused Vitest coverage next to the module, following
  `src/lib/agent/memory.test.ts`, `src/lib/progress.test.ts`, and
  `src/lib/stats.test.ts`.
- Protocol encoding/decoding: update `src/lib/voice/doubao-codec.test.ts`.
- API routes: use route-level tests under `tests/api/` or next to the route.
  Mock the DB with in-memory SQLite where needed.
- Lesson phase/state behavior: cover controller transitions in
  `src/lib/voice/phased-lesson-controller.test.ts` or
  `src/lib/voice/lesson-controller` tests if added.
- Course data changes: run and extend `src/data/courses/*.test.ts`.
- Any backend change should pass `pnpm exec tsc --noEmit` and the relevant
  `pnpm test ...` target; broader shared changes should pass `pnpm test`.

## Documentation Sync

Update `docs/architecture.md` in the same task when changing:

- module responsibilities or cross-module data flow
- Doubao/MiMo protocol adaptation
- `LessonController` or `PhasedLessonController` state transitions
- `SpeechExtractor`, PCM buffering, recorder lifecycle, or timeout thresholds
- performance-relevant decisions such as prewarm, buffering, and final fallback

## Code Review Checklist

- Are secrets still server-only?
- Does every async error path release state/resources?
- Are SSE/WebSocket event shapes still compatible with the browser controller?
- Does session-local progress stay separate from durable `word_performance`?
- Are tests asserting the behavior that could regress, not just rendering shape?

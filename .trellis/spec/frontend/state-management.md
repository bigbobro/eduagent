# State Management

There is no global React store. State is intentionally split between local React
state, browser-side controller classes, server in-memory sessions, and SQLite
aggregates.

## State Categories

- **Local UI state**: component-only state such as hover/active card labels in
  `IntroPhase`, quiz index/retry count in `ReinforcePhase`, and loading/error
  flags in `HomePage`, `JournalClient`, and `ParentsClient`.
- **Controller state**: long-lived browser orchestration state in
  `LessonController` and `PhasedLessonController`. React components subscribe
  with `.on()` / `.off()` and render the emitted state.
- **Server session state**: the `sessions` map in `src/lib/agent/session.ts`.
  It owns the active `LessonMemory`, token usage, current phase, and course for
  an in-progress lesson.
- **Durable progress**: SQLite tables, especially `lesson_logs`,
  `interaction_logs`, and `word_performance`, read through `/api/progress`,
  `/api/stats`, and `/api/sessions`.
- **Local browser security state**: parent PIN behavior lives in `src/lib/pin.ts`
  and parent components. Keep it separate from lesson progress.

## Lesson Flow State

- `LessonController` owns the audio/chat state machine:
  `idle -> greeting -> awaiting -> listening -> thinking -> speaking -> awaiting`
  plus `ending`.
- `PhasedLessonController` owns the outer course phase:
  `intro -> interactive -> reinforcement -> done`.
- `PhasedLessonView` stores controller instances in refs and mirrors emitted
  phase/busy/active-card state into React.
- `InteractivePhase` mirrors lesson state, subtitle, and current card from
  controller events. It should not duplicate ASR/TTS state-machine logic.

## Server And Durable State Boundaries

- `clearedCardIds`, `cardProgress`, and `cardAttemptStreak` are session-local
  learning flow state. They decide whether this lesson can advance.
- Long-term word progress comes from `word_performance` and is rendered through
  `ProgressSnapshot` / `StatsSnapshot`.
- A browser refresh or dev-server restart can invalidate the in-memory session.
  Current UI handles chat 404 by asking the learner to re-enter the course.

## Derived State

- Keep derived UI state close to the component. `InteractivePhase` maps
  `LessonStateName` to Bunny mood/pose with local `Record` constants.
- Keep aggregate progress derivation in pure backend helpers:
  `masteryStarsFromRatio`, `buildProgressSnapshot`, and `buildStatsSnapshot`.
- Avoid storing a value that can be reliably derived from course data and DB
  rows unless it is needed for an in-progress session.

## Common Mistakes

- Do not introduce Zustand/Redux/context for state that already has a clear
  controller or local component owner.
- Do not treat `cleared` as durable mastery; it only means a card can advance in
  the current session.
- Do not make components depend directly on SQLite schema details. Use typed API
  snapshots from `src/types/progress.ts`.

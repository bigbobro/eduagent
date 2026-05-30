# State Management

There is no global React store. State is intentionally split between local React
state, browser-side controller classes, server in-memory sessions, and SQLite
aggregates.

## State Categories

- **Local UI state**: component-only state such as active card labels in
  `IntroFrame`, quiz index/retry count in `ReinforcementFlow`, and loading/error
  flags in `HomeStudy`, `JournalClient`, and `ParentsClient`.
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
- Intro is a short opening gate only. When the opening greeting finishes and
  `LessonController` returns to `awaiting`, `PhasedLessonController` should
  immediately transition to `interactive`; do not wait for every word card to be
  introduced during intro.
- Interactive card display must follow `show_card` for both word cards and
  `sentence_*` cards. If the teacher speaks a target sentence, the hero card
  must switch to the matching sentence card; progress counters and phase
  advancement still count word cards only.
- `show_card` actions are normalized on the server before SSE emission. The UI
  should still ignore any action that points at an already cleared word card,
  including a `sentence_*` card mapped to that cleared word, so a stale action
  cannot visually jump back to completed material.
- The interactive prompt must carry a deterministic current-target rule:
  continue the current uncleared word card, otherwise move to the first
  uncleared word in `teachingHints.newCardIds`; do not jump back to cleared word
  cards unless the learner explicitly asks to review.
- `PhasedLessonView` stores controller instances in refs and mirrors emitted
  phase/busy/active-card state into React.
- `PhasedLessonView` treats `PhasedLessonController.startLesson() === false` as
  a failed startup and returns to the not-started intro screen so the start
  button remains retryable.
- `LessonMandalaV2` mirrors lesson state, subtitle, and current card from
  controller events. It should not duplicate ASR/TTS state-machine logic.
- Reinforcement `repeat-after-me` quizzes reuse `LessonController` recording,
  but call `startListening({ routeToChat: false })`. This still emits
  `asr-final` for local quiz scoring, then returns to `awaiting` without
  sending the utterance through `/api/chat?action=message`. Interactive lesson
  recording should keep the default chat-routed behavior.

## Scenario: Interactive `show_card` Target Guard

### 1. Scope / Trigger

- Trigger: interactive lesson turns span LLM output, server memory, SSE actions,
  controller events, and `LessonMandalaV2` display. Prompt text alone is not a
  sufficient guard against stale or off-order card switches.

### 2. Signatures

- Server helper: `normalizeAssistantActions(memory, course, response): ToolAction[]`.
- SSE event: `{ type: 'actions', actions: ToolAction[], state_update }`.
- Tool action: `{ tool: 'show_card', params: { card_id: string } }`.

### 3. Contracts

- In interactive teaching, the active word is the current uncleared word card,
  otherwise the first uncleared word in `course.teachingHints.newCardIds`.
- Server must emit and commit normalized `show_card` actions only. Cleared word
  cards and non-current targets are filtered or replaced with the active word.
- Sentence cards are display-only in interactive progress. A sentence card is
  valid only when it maps to the active word by `sentence_<wordId>` or shared
  word image.
- UI must ignore any received `show_card` whose owning word card is already in
  `clearedCardIds`.

### 4. Validation & Error Matrix

- Unknown `card_id` -> ignore action.
- Cleared word card -> replace with active word on server; ignore in UI if it
  still reaches the component.
- Sentence for cleared/non-current word -> replace with active word on server;
  ignore in UI if it still reaches the component.
- Correct assessment with missing or stale `show_card` -> server appends the
  next active word card.

### 5. Good/Base/Bad Cases

- Good: `egg` is correct and next active word is `rice`; stale `show_card egg`
  becomes `show_card rice`.
- Base: active word is `milk`; `show_card sentence_milk` displays the sentence
  card while word progress remains word-only.
- Bad: after `egg` is cleared, a later `show_card egg` must not move the hero
  card back to egg.

### 6. Tests Required

- Unit test `normalizeAssistantActions` for cleared-card replacement and
  correct-assessment fallback.
- Component test `LessonMandalaV2` for ignoring a `show_card` targeting an
  already cleared word.
- Prompt test verifying current target and sentence-card mapping remain present
  in the interactive prompt.

### 7. Wrong vs Correct

#### Wrong

Let every LLM `show_card` directly update `currentCardId` and the hero card.

#### Correct

Normalize `show_card` against session progress before SSE/commit, then keep a
small UI guard using the latest progress snapshot.

## Scenario: Lesson Start Failure Recovery

### 1. Scope / Trigger

- Trigger: changes to `LessonController.startLesson()`,
  `PhasedLessonController.startLesson()`, or `PhasedLessonView` start handling.
- Reason: initial `/api/chat?action=start` can fail before a server session
  exists; the learner must be able to retry without refreshing the page.

### 2. Signatures

- `LessonController.startLesson(courseId): Promise<boolean>`
- `PhasedLessonController.startLesson(): Promise<boolean>`
- `PhasedLessonView.handleStart()` sets `started=true` optimistically, then
  rolls back when the phased controller returns `false`.

### 3. Contracts

- Startup success -> `true`; normal intro-to-interactive flow continues.
- Startup failure -> `false`; controller state returns to `idle`, intro busy is
  cleared, and `started` is reset to `false`.
- TTS open and mic prewarm failures remain recoverable warnings; they do not by
  themselves make `startLesson()` return `false`.

### 4. Validation & Error Matrix

- `/api/chat?action=start` 500/404/no body -> emit an error, state `idle`,
  return `false`.
- `LessonController.startLesson()` throws unexpectedly -> phased controller
  clears busy and returns `false`.
- Successful SSE start -> return `true`.

### 5. Good/Base/Bad Cases

- Good: failed start shows the original start button again.
- Base: successful start reaches interactive after the opening TTS finishes.
- Bad: failed start leaves `started=true` with intro locked and no retry path.

### 6. Tests Required

- `LessonController` test for failed start returning `false` and state `idle`.
- `PhasedLessonController` test for clearing intro busy on false start.
- `PhasedLessonView` test for returning to the start screen.

### 7. Wrong vs Correct

#### Wrong

```tsx
setStarted(true);
await phased.startLesson();
```

#### Correct

```tsx
setStarted(true);
if ((await phased.startLesson()) === false) {
  setStarted(false);
}
```

## Server And Durable State Boundaries

- `clearedCardIds`, `cardProgress`, and `cardAttemptStreak` are session-local
  learning flow state. They decide whether this lesson can advance.
- Long-term word progress comes from `word_performance` and is rendered through
  `ProgressSnapshot` / `StatsSnapshot`.
- A browser refresh or dev-server restart can invalidate the in-memory session.
  Current UI handles chat 404 by asking the learner to re-enter the course.

## Derived State

- Keep derived UI state close to the component. `LessonMandalaV2` maps
  `LessonStateName` to `PictureCard` state and Cat mood with local
  `Record` constants.
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

# Agent Layer Contracts

Covers `src/lib/agent/{memory,session,prompt}.ts` and `src/lib/voice/lesson-controller.ts`.
These are the modules that turn raw LLM output + ASR text into safe lesson state.

> **Currency note (2026-05-24)** — The R5 / R7 / `getNextWordCardId` sections
> below describe the **R7-era** implementation (pre-2026-05-23). They were
> superseded by **R-C server-authoritative 2-hit clearance** (commits
> `9bbcc77`, `4ad4708`). Read those sections as design rationale, not as the
> current code. Current behavior lives in:
> - `src/lib/agent/memory.ts` — search for `// R-C` comments
> - `src/lib/agent/guards/` — guard pipeline (R-D, 2026-05-24)
> - `## state_update schema (R-C — server-authoritative)` section below
> - `## Guard Pipeline (R-D — extract guards from streamUserInput)` section below
> - `## Test fixtures & mocks` section below
>
> Key replacements:
> - `getNextWordCardId` function → deleted; replaced by inline
>   `findFirstUncleared(excludeId)` inside `normalizeAssistantActions`.
> - R7 LLM-correct → server auto-advance → replaced by R-C 2-hit ASR literal
>   counting (`cardCorrectCount[cardId] >= 2 → cleared`).
> - R5 whitelist `{currentCard, nextCard}` → R-C `forceCardId` (stay on
>   current until cleared, then auto-advance one card).
> - R4/R6 closing guard + R-B premature-closing + normalize + speech-align
>   inline in `streamUserInput` → extracted to `src/lib/agent/guards/` as
>   composable `GuardFn[]` pipeline (R-D, 2026-05-24).

---

## actions / TTS Timing

### Convention: buffer show_card until TTS finishes

`LessonController` must NOT emit `'actions'` immediately when the SSE `actions`
event arrives. Instead store in `pendingActions: ToolAction[] | null` and flush
from `tts.on('session-finished')`.

```ts
// WRONG — card flips before teacher finishes speaking
case 'actions':
  this.emit('actions', actions);

// CORRECT
case 'actions':
  this.pendingActions = actions;
  // ... flushed in tts.on('session-finished')
```

**Why**: SSE `actions` arrives before TTS audio finishes. Immediate emit causes
the visual card flip to race the teacher voice, so a child sees "monkey" while
the audio still says "where is the elephant".

**Release rules** — `pendingActions` must be cleared on ALL exit paths:
- Normal: `tts.on('session-finished')` → emit, then null
- TTS error: sync ASR context from buffered actions, emit them so the UI does not freeze, then null
- AbortError / `endLesson`: null (lesson over)

Stale `pendingActions` from one turn must never leak into the next turn.

---

## Static quiz TTS via LessonController

### Convention: reinforcement prompts do not call the LLM

`LessonController.speakStatic(text)` is the browser contract for deterministic
reinforcement quiz speech. It must reuse the existing TTS long connection,
start a normal TTS session, set state to `quiz-speaking`, and resolve only after
the TTS session has finished and the player is idle.

Contracts:
- Call only from `awaiting`; reject if the controller is listening, thinking,
  speaking, greeting, or already running another static speech.
- Do not POST to `/api/chat` and do not consume SSE.
- Empty text is a no-op.
- TTS error, timeout, or `endLesson` must reject the pending promise and clear
  the pending static-speech slot.
- UI callers must treat `quiz-speaking` as locked input state.

Usage rules:
- `QuizPickWordFrame` speaks `prompt + correct English word` before accepting
  PictureCard picks.
- `ReinforceFrame` speaks `targetText` before enabling repeat-after-me
  recording.
- Wrong answers with retry attempts remaining speak
  `再听一次: ${prompt || targetText}` before the next attempt.
- `PhasedLessonController` emits reinforcement `phase-change` after
  `phase-transition` TTS finishes, so the first static quiz prompt does not
  collide with transition speech on the one-session TTS connection.

Tests required:
- `lesson-controller` covers `speakStatic` happy path, TTS error rejection, and
  concurrent-call dedup.
- Quiz frame tests cover static prompt construction and locked input.

---

## Scenario: ASR hot_words window follows lesson card progress

### 1. Scope / Trigger
- Trigger: changing ASR session context or `LessonController` action/progress timing.
- Scope: browser `LessonController` + `AsrClient` query fields + server `asr-proxy` hot_words payload.

### 2. Signatures
- `setAsrSessionContext({ courseId?, cardId?, clearedCardIds?, targetWords? })`
- ASR WebSocket URL: `/api/voice/asr?courseId=<id>&cardId=<id>&clearedCardIds=<comma-list>`
- Server payload: `buildAsrRequestPayload(session).request.corpus.context`

### 3. Contracts
- `courseId` is set in `LessonController.startLesson(courseId)` before the first ASR turn.
- `cardId` is updated only when buffered `show_card` actions flush after TTS finishes, so the ASR bias matches the card visible for the next user utterance.
- `clearedCardIds` is updated from `progress_snapshot` and sent with the next ASR connection.
- When `cardId` is present and valid, server hot_words must be `{ currentCard.english, next uncleared wordCard.english }`.
- When `cardId` is absent or stale, server falls back to explicit `targetWords` or all course word cards.
- Doubao wire format remains `request.corpus.context = JSON.stringify({ hotwords: [{ word }] })`.

### 4. Validation & Error Matrix
- Missing `courseId` -> no course-derived hot_words; omit `corpus` unless explicit target words exist.
- Stale `cardId` -> ignore the W2 window and fallback to target words/course words.
- `clearedCardIds` contains the immediate next card -> skip it and choose the next uncleared word card.
- TTS error/endLesson -> do not leave stale ASR context; if buffered actions are emitted on error, sync context from those actions; if the lesson ends, clear context with the lesson.

### 5. Good/Base/Bad Cases
- Good: visible card `dog`, cleared `cat` -> ASR hot_words `dog`, `bird`.
- Base: lesson just started, no visible card yet -> ASR hot_words all course word cards.
- Bad: using full 12-word course list after `show_card: dog` -> weakens short-word bias and can repeat the cat/frog failure class.

### 6. Tests Required
- `asr-client` test: session context URL includes `courseId`, omits `cardId` when unset, and includes `clearedCardIds` when present.
- `asr-proxy` test: W2 window overrides full `targetWords`, skips cleared next cards, and stale `cardId` falls back.
- `lesson-controller` test: `progress_snapshot` + flushed `show_card` updates ASR context after TTS session-finished.
- Real regression: `pnpm run voice:asr-hotwords` when Doubao credentials/network are available; assert avgDiff >= 30pp and no baseline-passing case regresses.

### 7. Wrong vs Correct

#### Wrong
```ts
// Builds a broad list for every turn; short words compete with the whole course.
setAsrSessionContext({ courseId, targetWords: allCourseWords });
```

#### Correct
```ts
// Course fallback first, then visible-card W2 once show_card flushes.
setAsrSessionContext({ courseId, cardId, clearedCardIds });
```

---

## Memory: attempt assessment contracts

### Contract: `applyAttemptAssessment(memory, assessment, rawAsrText?)`

`rawAsrText` is the verbatim ASR string from the user's microphone.

**R-C target matching**:

- Lower-case target word and raw ASR.
- Build target candidates from `WordCard.english` plus explicit
  `WordCard.asrAliases`.
- Keep ASCII letters/digits and CJK characters, deleting separators before
  comparing. This makes `ice cream`, `ice-cream`, and `icecream` equivalent,
  and allows a course to opt in aliases such as `pie` -> `派`.
- Do not treat every `WordCard.chinese` value as a hit by default. Chinese
  translations only count when the course explicitly lists them in
  `asrAliases`.
- Count hits against the current word card id, not against
  `state_update.current_word`.

**When a raw ASR target hit exists**:

| condition | outcome |
|-----------|---------|
| current card has < 1 prior hit | → `attempted`, `cardCorrectCount[cardId] = 1` |
| current card reaches 2 hits | → `cleared`, append `clearedCardIds`, lock further counting |
| current card is already `cleared` | → ignore further hits |

**When no raw ASR target hit exists**:

| condition | outcome |
|-----------|---------|
| `assessment.result === 'correct'` | → no progress credited + `console.warn` |
| `assessment.result === 'close' || 'wrong'` | → increment streak; third miss marks `needs_review` |
| `assessment.result === 'off_topic'` or missing assessment | → no progress change |

**When `assessment.card_id !== memory.currentCardId`**: ignore silently + `console.warn`. Do not apply the assessment to a different card.

**Why**: LLM routinely judges `correct` for phonetically similar but wrong words
(e.g. "fog" scored as "frog"). Raw ASR is the ground truth; LLM assessment is
confirmation bias when token overlap is absent.

### Pattern: thread rawAsrText from API route → session → memory

```
/api/chat (route.ts)
  → streamUserInput(session, userText)         # userText = ASR string
      → normalizeAssistantActions(…, rawAsrText=userText)
          → applyAttemptAssessment(…, rawAsrText)
```

Never infer `rawAsrText` from a re-processed field. Pass the original string.

---

## Memory: canShowCard contracts (R5 — current)

> **Supersedes R3** (2026-05-22). The old "any non-cleared word card is showable"
> rule was too permissive: in the 2026-05-22 实测课 the LLM repeatedly emitted
> `show_card: cat` long after cat passed, and the gate let it through whenever
> cat happened to still be `attempted`. See `docs/lesson-reports/2026-05-22-427f287b.md`.

### Contract: word card whitelist `{currentCard, nextCard}`

A word card is showable **iff** its id is either `memory.currentCardId` (when
that card is not itself cleared) or `getNextWordCardId(memory, course)`.

```ts
// WRONG — pre-R5, any non-cleared word card passed
state === 'untouched' || state === 'attempted' || state === 'needs_review'

// CORRECT — R5 whitelist
const isCurrent = cardId === memory.currentCardId;
const isCurrentCleared = memory.cardProgress[memory.currentCardId] === 'cleared';
const isNext = cardId === getNextWordCardId(memory, course);
return (isCurrent && !isCurrentCleared) || isNext;
```

**Why**:
- The "currentCard is itself cleared" branch defends against stale state where
  R7 (below) hasn't yet replaced `currentCardId` but the card has already been
  promoted to cleared. Allowing show_card on a cleared current re-runs drill.
- Anything other than current/next is either a backward jump (regression) or a
  forward skip; both are wrong by lesson design.
- Sentence cards (`sentence_*`) keep their pre-R5 rule: must be tied to the
  active word card and that word card must not be cleared.

**Trade-off accepted**: students who say "再说一次 cat" cannot trigger a
show_card back to cleared cat. Prompt does not advertise this affordance.

### Helper: `getNextWordCardId(memory, course)`

```ts
export function getNextWordCardId(memory: LessonMemory, course: Course): string {
  const wordCardIds = new Set(course.cards.filter(c => c.kind === 'word').map(c => c.id));
  const currentId = memory.currentCardId;
  return course.teachingHints.newCardIds.find(
    id => wordCardIds.has(id)
       && id !== currentId
       && memory.cardProgress[id] !== 'cleared'
  ) || '';
}
```

Empty string is a valid result (all cards cleared). All callers must handle
empty-string nextCard as no-op.

---

## Memory: mastered auto-advance (R7)

### Contract: server-side hard push when LLM forgets to advance

When the current card is **freshly cleared this turn**,
`normalizeAssistantActions` appends `show_card: nextCardId` if the LLM didn't
already emit one. This prevents the 2026-05-22 turtle bug (n=30-35) where the
student said "Turtle" correctly 6 times in a row but the LLM kept drilling.

### **CRITICAL INVARIANT — trigger MUST read assessedMemory, NOT raw assessment**

```ts
// WRONG — uses raw LLM judgment, ignores R2 literal-verify downgrade
if (response.state_update.attempt_assessment?.result === 'correct') {
  push(show_card: nextCard);  // fires even when R2 downgraded "correct" → attempted
}

// CORRECT — uses post-assessment cardProgress
const originalCurrentId = memory.currentCardId;
const wasNotCleared = memory.cardProgress[originalCurrentId] !== 'cleared';
const isNowCleared  = assessedMemory.cardProgress[originalCurrentId] === 'cleared';
if (wasNotCleared && isNowCleared) {
  push(show_card: getNextWordCardId(assessedMemory, course));
}
```

**Why it matters**: R2 (ASR literal verify) downgrades LLM-self-reported
`correct → attempted` when raw ASR doesn't contain the target word literal.
If R7 fired on raw assessment, the card UI would flip forward while
`cardProgress` still reads `attempted` — exactly the **state desync** R7
is supposed to *prevent*. Always derive R7's trigger from the same
`assessedMemory` that downstream commit will use.

### Dedup

If LLM already emitted `show_card: nextCardId`, R7 must not push a duplicate.
Check `normalizedActions.some(a => a.tool === 'show_card' && a.params.card_id === nextCardId)`
before appending.

---

## Cross-cutting invariant: normalize uses assessedMemory, not memory

Three normalize branches (R5 whitelist filter, R7 mastered push, R1 fallback
push when LLM emitted nothing showable) **must all see the same memory**:

```ts
// In normalizeAssistantActions:
const assessedMemory = applyAttemptAssessment(memory, response, rawAsrText);
// ↑ This is the source of truth for THIS turn's progress.

const nextCardId = getNextWordCardId(assessedMemory, course);  // ← uses assessed
const filtered = response.actions.filter(a => canShowCard(a, assessedMemory));
//                                                          ↑ uses assessed
// R7 push, R1 fallback — both use assessedMemory + nextCardId computed above.
```

**Why**: if any branch reads stale `memory.cardProgress`, you get:
- whitelist passes a card that's actually been cleared this turn
- nextCard returns the just-cleared card itself
- fallback pushes a card the assessment already promoted out

This is the same class of bug as R7 reading raw assessment. The fix is the
same shape: always anchor to `assessedMemory`.

---

## state_update schema (R-C — server-authoritative)

> **Scope / Trigger**: changing the LLM JSON response schema, adding new
> "state" fields, or wiring LLM-reported state into server logic.

### Contract: LLM may only report 2 fields

`AgentResponse.state_update` (see `src/types/tools.ts`) is **closed** to:

| field | who reads it | why LLM still reports it |
|---|---|---|
| `current_word?: string` | `session.ts` closing guard (R6 exemption) | Identifies which word LLM thinks it's actively teaching, so R6 can whitelist legitimate mentions vs hallucinated unlearned-word enumeration |
| `attempt_assessment?: { card_id, result, should_advance, evidence }` | `memory.ts` `applyAttemptAssessment` (R-C path B fallback, streak/needs_review only) | R-C uses ASR literal hits (path A) for `cleared`; LLM judgment is only used for non-hit streak tracking |

**Forbidden — must NOT be added back to the schema**:

| forbidden field | why | who owns it now |
|---|---|---|
| `phase` | Phase transitions are UX events (intro → interactive → reinforcement → done), not LLM decisions. LLM cannot observe `quiz-answer` events or `intro-busy` state | `PhasedLessonController` (browser) |
| `words_learned` | LLM hallucinates "today we learned cat, dog, frog" even when only cat was actually said. R-C accumulates `wordsLearned` server-side from R2 hits | `applyAttemptAssessment` `mergeUnique(memory.wordsLearned, [targetCard.english])` on 2nd hit |
| `current_card_id` | LLM repeatedly re-emits `show_card: cat` long after cat was cleared. Server `normalizeAssistantActions` computes `forceCardId` from `memory.currentCardId` + clearance state | `normalizeAssistantActions` `forceCardId` (R-C modes 1-4) |
| `generated_content` | Never wired. Was a placeholder for "LLM generates a sentence/question" path that never got built | (dead — deleted 2026-05-24) |

### Why this is server-authoritative

LLM is a **reactive component**: given turn context + ASR, produce speech +
optionally `show_card` + optionally an `attempt_assessment`. **Anything the
server can derive itself, the server derives.** Phase comes from UI events.
Words-learned comes from ASR counting. Current-card comes from memory +
forceCardId. The LLM's job is teaching speech and on-the-fly assessment, not
state authority.

### Validation & Error Matrix

| LLM output | server behavior |
|---|---|
| Reports only `current_word` + `attempt_assessment` (good) | Process normally |
| Reports extra unknown fields (e.g. LLM hallucinates `phase: 'closing'`) | **Silently ignored** — `JSON.parse` + `result.state_update.X` returns undefined for absent fields; presence of extras does not throw. No zod validation needed |
| Reports `current_word` only (missing `attempt_assessment`) | R-C path A (R2 hit) still works; path B (streak) is skipped — acceptable fallback |
| Reports `attempt_assessment.card_id !== memory.currentCardId` | Ignored + `console.warn` — see "Memory: attempt assessment contracts" above |
| Reports nothing (malformed / empty `state_update`) | `current_word` defaults to '', `attempt_assessment` undefined — R-C path B skipped, path A unaffected |

### Wrong vs Correct

#### Wrong — "future me wants LLM to report phase so we can save a round trip"

```ts
// In prompt.ts output schema:
{
  state_update: {
    current_word: '...',
    attempt_assessment: { ... },
    phase: 'opening|review|learning|quiz|closing',  // ❌
  }
}
// In session.ts:
session.currentPhase = result.state_update.phase ?? session.currentPhase;  // ❌
```

**Why wrong**: LLM does not know about UI events. It cannot observe quiz
answers, intro hotspot clicks, or dev-panel phase jumps. Trusting LLM phase
desynchronizes server `currentPhase` from `PhasedLessonController.phase`,
which the UI is actually rendering. The 2026-05-22 implementation had this
bug — closing summaries fired in interactive phase because LLM jumped phase
unilaterally.

#### Correct — "LLM reports observation, server owns state"

```ts
// In prompt.ts:
{
  state_update: {
    current_word: '...',  // what LLM thinks it's teaching now
    attempt_assessment: { card_id, result, should_advance, evidence },
  }
}
// In session.ts:
// session.currentPhase only changes via /api/chat?action=phase-transition
// (called by PhasedLessonController after intro/interactive/reinforcement signals)
```

### Tests Required

- `src/lib/agent/memory.test.ts`: assert `commitAssistantStreamResult` does
  not read `state_update.phase` / `state_update.words_learned` / `state_update.current_card_id`
  (test must fail at compile time if these fields are re-added to `AgentResponse`)
- `src/lib/agent/prompt.test.ts`: assert generated system prompt does not
  contain the strings `current_card_id` / `words_learned` / `generated_content`
  in the schema example
- Smoke (`pnpm smoke:lesson`): same as before; behavior unchanged externally

### Future extension protocol

If a future feature needs LLM-reported state beyond `current_word` +
`attempt_assessment`:

1. **First** prove the server cannot derive it (e.g. "intent classification"
   genuinely requires LLM reasoning, not derivable from ASR + memory).
2. **Then** prove `PhasedLessonController` ownership doesn't fit (e.g. it's
   not a UI lifecycle event).
3. **Then** add the field to `AgentResponse.state_update` + this spec section
   + a Validation matrix entry.

Do not add new state fields opportunistically.

---

## Guard Pipeline (R-D — extract guards from streamUserInput)

> **Scope / Trigger**: adding a new closing/normalize/speech guard;
> reordering existing guards; changing how `streamUserInput` consumes the LLM
> response.
>
> **Code**: `src/lib/agent/guards/` (5 files) + `src/lib/agent/session.ts`
> `streamUserInput` skeleton. Refactored 2026-05-24 from a 169-line inline
> blob to a 60-line skeleton + 4-guard pipeline.

### Why this exists

Between 2026-05-22 and 2026-05-23, the guard set grew from R1–R4 → R5/R6/R7
→ R-A → R-B → R-C (5 turns of inline edits to `streamUserInput`). Each new
guard had to find a position in the existing 169-line function body and
match the local variable names. The pipeline extraction makes adding a new
guard a single push to a typed array.

### Contract: `GuardFn` shape

```ts
// src/lib/agent/guards/index.ts
export interface GuardContext {
  speech: string;
  actions: ToolAction[];
  stateUpdate: AgentResponse['state_update'];
  memory: LessonMemory;     // ← read-only view (see invariant below)
  course: Course;
  asrText?: string;
  currentPhase: PhaseName;
}

export type GuardFn = (ctx: GuardContext) => GuardContext;
```

Input and output have **the same shape**. A guard that does nothing returns
`ctx` unchanged. A guard that overrides speech returns
`{ ...ctx, speech: '...' }`. No side-effects beyond `console.warn` /
`console.error` for diagnostics.

### Contract: `GuardContext.memory` is a read-only view

Guards MUST NOT mutate `ctx.memory`. Memory updates happen **after** the
pipeline runs, inside `commitTurn` (which calls
`commitAssistantStreamResult`). If a guard mutates memory mid-pipeline:

- Downstream guards may see partially-updated state and make wrong decisions
- `commitTurn` re-derives state from `memory` + the post-pipeline
  `{ speech, actions, stateUpdate }` — mutation would double-apply

This invariant is enforced by convention only (TypeScript can't make a deep
readonly view ergonomically). Reviewers must flag any guard that does
`ctx.memory.X = Y` or `ctx.memory.X.push(...)`.

### Contract: `runPipeline` fail-safe semantics

```ts
export function runPipeline(ctx: GuardContext, guards: GuardFn[]): GuardContext {
  return guards.reduce((acc, guard) => {
    try {
      return guard(acc);
    } catch (err) {
      console.error('[guard]', guard.name, 'failed:', err);
      return acc;  // ← skip this guard, pipeline continues with prior ctx
    }
  }, ctx);
}
```

A guard throwing is **not fatal** — the next guard runs against the
pre-throw ctx. Rationale: a broken guard in production should degrade
gracefully (skip its effect, log the error) rather than blow up the whole
turn and ship `[error]` to the child's audio.

The try/catch is **per-guard, not pipeline-wide**. Normal `return` values
are not error-wrapped — `reduce` propagates them naturally.

### Contract: guards array order is sensitive — do NOT reshuffle

Current order in `streamUserInput`:

```ts
runPipeline(ctx, [
  closingGuard,            // R4/R6
  prematureClosingGuard,   // R-B
  normalizeActions,        // R-C wrapper
  speechCardAlign,         // speech vs forceCardId
]);
```

| guard | reads from prior ctx | writes |
|---|---|---|
| `closingGuard` | `speech`, `memory.wordsLearned`, `stateUpdate.current_word`, `course.cards` | `speech` (override) |
| `prematureClosingGuard` | `speech`, `currentPhase`, `memory.cardProgress`, `course.cards` | `speech` (override), `actions` (force-push next untouched) |
| `normalizeActions` | `actions`, `memory.currentCardId`, `memory.cardProgress`, `course.teachingHints`, `asrText`, `stateUpdate` | `actions` (R-C forceCardId) |
| `speechCardAlign` | `actions` (post-normalize), `speech`, `memory.currentCardId`, `course.cards` | `speech` (override if mismatch) |

**Why this order**:

- `closingGuard` and `prematureClosingGuard` rewrite `speech` BEFORE
  normalize. They can also push new `show_card` actions (premature-closing
  does this). Normalize then reconciles those actions with R-C `forceCardId`.
- `normalizeActions` is the source of truth for which card is visible this
  turn (`forceCardId`). `speechCardAlign` MUST run AFTER normalize because
  it compares `speech` against the **post-normalize** primary card to detect
  speech/show_card mismatch.
- Swapping `normalizeActions` ↔ `speechCardAlign` causes align to see the
  pre-normalize (possibly LLM-hallucinated) card and either no-op when it
  should fire, or fire on a card normalize is about to reject.

### Design Decision: keep `normalizeAssistantActions` in `memory.ts`

**Context**: When extracting guards, the natural temptation is to move every
guard's logic into `guards/<name>.ts` for symmetry. `normalizeActions` is
the largest guard (~70 lines) and the most "guard-shaped" — it reads ctx,
returns a transformed `actions` array.

**Options Considered**:

1. Move `normalizeAssistantActions` (and its private helper
   `applyAttemptAssessment`) into `guards/normalize-actions.ts`.
2. Keep `normalizeAssistantActions` in `memory.ts`;
   `guards/normalize-actions.ts` is a thin wrapper that calls it.

**Decision**: Option 2 (wrapper). Reasons:

- `applyAttemptAssessment` is tightly coupled to `LessonMemory` mutation
  helpers (`markWordCorrect`, `markWordIncorrect`, `updateWordPerformance`,
  `mergeUnique`). Moving it to `guards/` would require exporting those
  helpers from `memory.ts`, widening the public API surface.
- `memory.test.ts` has extensive coverage of `normalizeAssistantActions`
  internals. Moving the function would force splitting/duplicating those
  tests, with no behavior gain.
- The wrapper costs ~10 LOC and zero indirection at runtime.

**Wrapper shape** (`guards/normalize-actions.ts`):

```ts
import { normalizeAssistantActions } from '../memory';
import type { GuardFn } from './index';

export const normalizeActions: GuardFn = (ctx) => ({
  ...ctx,
  actions: normalizeAssistantActions(
    ctx.memory,
    ctx.course,
    { speech: ctx.speech, actions: ctx.actions, state_update: ctx.stateUpdate },
    ctx.asrText,
  ),
});
```

**Do not move `normalizeAssistantActions` into `guards/`** — even if a
future PR "cleans up the boundary" with that justification. The boundary is
intentional.

### Don't: mutate `ctx.memory` inside a guard

```ts
// WRONG — guard mutates shared state
export const myGuard: GuardFn = (ctx) => {
  if (someCondition) {
    ctx.memory.wordsLearned.push('hallucinated');  // ❌
    ctx.memory.currentCardId = 'whatever';         // ❌
  }
  return ctx;
};

// CORRECT — guard only returns a new ctx; memory commits happen later
export const myGuard: GuardFn = (ctx) => {
  if (someCondition) {
    // diagnose, override speech / actions / stateUpdate as needed.
    return { ...ctx, speech: 'override' };
  }
  return ctx;
};
```

`commitTurn` (in `session.ts`) is the **only** place that mutates session
memory, and it does so from the post-pipeline ctx fields, not from memory
itself.

### Don't: swap `normalizeActions` ↔ `speechCardAlign` order

```ts
// WRONG — align runs before normalize, sees LLM's stale card
runPipeline(ctx, [closingGuard, prematureClosingGuard, speechCardAlign, normalizeActions]);

// CORRECT — normalize first, align observes the authoritative card
runPipeline(ctx, [closingGuard, prematureClosingGuard, normalizeActions, speechCardAlign]);
```

If a future guard adds another speech rewrite that must happen
post-normalize, put it after `speechCardAlign`. If it must happen
pre-normalize, put it next to `prematureClosingGuard`. Document the choice
in the guard file header.

### Pattern: adding a new guard

1. Create `src/lib/agent/guards/<name>.ts` exporting a `GuardFn`. Add a
   header comment naming the rule (e.g. `// R-E: <one-line purpose>`).
2. Create `src/lib/agent/guards/<name>.test.ts` with at least one positive
   case (trigger fires, ctx changes) and one negative case (trigger doesn't
   fire, ctx unchanged).
3. Decide insert position by data dependency, not by intuition:
   - Reads/writes `actions`? Probably near `normalizeActions`.
   - Reads/writes `speech` only? Probably near `closingGuard` /
     `speechCardAlign`.
   - Reads `stateUpdate` only? Near the front.
4. Push to the `guards` array in `streamUserInput` with a one-line comment
   explaining the position choice.
5. Run `pnpm test` + `pnpm exec tsc --noEmit` + `pnpm smoke:lesson`. Smoke
   is **required** per `CLAUDE.md` for any `src/lib/agent/**` change.

### Validation & Error Matrix

| condition | runPipeline behavior |
|---|---|
| All guards return ctx normally | Pipeline returns the final ctx |
| Guard throws | `console.error('[guard] <name> failed: <err>')`, pipeline continues with prior ctx |
| Guard returns `undefined` / `null` | Pipeline continues with that value — downstream guards will likely crash on `ctx.X` access. **Not defended against**; treat as a bug in the guard, fix the guard |
| Guard mutates `ctx.memory` | No runtime error; `commitTurn` will see inconsistent state. **Not defended against**; convention only |

### Tests Required

- `src/lib/agent/guards/run-pipeline.test.ts` — covers: normal sequence,
  single guard throws (pipeline continues), all guards throw (pipeline
  returns original ctx), empty guards array
- Per-guard test files — at minimum, one positive + one negative case
- `src/lib/agent/closing-guard.test.ts` (the **old** integration test in
  the agent root, not the new unit test in `guards/`) is **kept on purpose**
  — it tests the guard through `streamUserInput` end-to-end, providing an
  E2E layer the new unit tests don't cover. Do not delete it.
- Smoke (`pnpm smoke:lesson`) — verify `[normalize] snapshot` JSON output
  is byte-identical to a baseline pre-refactor smoke output

### Wrong vs Correct

#### Wrong — "I'll add the new guard inline, it's faster"

```ts
// In streamUserInput, after extractor.finalize():
const result = extractor.finalize();
// ... R-E: new guard inline
if (someEdgeCase) {
  result.speech = 'override';
  result.actions = [];
}
const ctx = { speech: result.speech, ... };
runPipeline(ctx, [closingGuard, ...]);
```

**Why wrong**: the inline path bypasses the pipeline's fail-safe wrap; the
new edge case is invisible to future readers looking at the guards array;
the next guard added will have to choose between inline or pipeline,
producing inconsistent style.

#### Correct — push to the array

```ts
// src/lib/agent/guards/my-edge-case.ts
export const myEdgeCaseGuard: GuardFn = (ctx) => {
  if (!someEdgeCase(ctx)) return ctx;
  return { ...ctx, speech: 'override', actions: [] };
};

// src/lib/agent/session.ts:
runPipeline(ctx, [
  closingGuard,
  prematureClosingGuard,
  myEdgeCaseGuard,      // ← inserted here because it overrides speech, runs after closing/premature
  normalizeActions,
  speechCardAlign,
]);
```

---

## Prompt: closing guard (R4 + R6 — two-layer defense)

---

## Prompt: closing guard (two-layer defense)

### Layer 1 — prompt constraint always injected

The "总结约束" block in `buildMemoryContext` must be injected unconditionally
(no `phase === 'closing'` guard). LLM can enter summary mode mid-lesson; the
constraint must be in context for every turn.

```ts
// WRONG
if (phase === 'review' || phase === 'closing') {
  lines.push('总结约束: ...');
}

// CORRECT
lines.push('总结约束（任何阶段均有效）: ...');
```

### Layer 2 — server-side speech scan before commit (R4 + R6)

After LLM stream completes, before `commitAssistantStreamResult`, scan
`result.speech` for any course `targetWords` not in `memory.wordsLearned`.

**R6 (2026-05-22)** — the unlearned filter must exempt **both** sides of the
"current word" signal:

```ts
const llmCurrentWord    = (result.state_update.current_word || '').toLowerCase();
const memoryCurrentWord = (memory.currentWord || '').toLowerCase();

const unlearnedMentioned = course.targetWords.filter(w => {
  if (memory.wordsLearned.includes(w)) return false;
  const wLower = w.toLowerCase();
  if (wLower === llmCurrentWord || wLower === memoryCurrentWord) return false;  // R6
  return speechContainsWord(result.speech, w);
});
if (unlearnedMentioned.length > 0) {
  result.speech = `今天我们一起练了 ${memory.wordsLearned.join('、') || '一些新词'},你说得很努力!下次再来玩吧。`;
}
```

**Why R6 is necessary**: pre-R6, teaching cat would trigger Layer 2 every turn
(cat ∈ targetWords, cat ∉ wordsLearned, LLM speech says "cat") and the entire
turn's speech got replaced with the wrap-up template. In the 2026-05-22 实测课
this fired ~40/70 turns. The currently-being-taught word is a legitimate
mention; only OTHER unlearned words are hallucinations to block.

**Why OR (memory + LLM) instead of just one**: `memory.currentWord` reflects
**last turn's** committed state; `state_update.current_word` is what the LLM
*claims* this turn. Trusting only one creates a one-turn gap when the lesson
advances to a new card. OR-of-both closes the gap.

**Scope**: only overwrites server-side memory + DB. Client already received
streaming audio for this turn — that is acceptable. The replacement ensures
lesson-report and next-turn LLM history are clean.

**Why Layer 2 is still necessary (post-R6)**: even with R6 whitelisting the
current word, LLM still hallucinates OTHER target words (e.g. lists "giraffe"
in a closing when only "cat" and "dog" were covered). Prompt alone is
insufficient.

---

## Test fixtures & mocks

> **Scope / Trigger**: changing `src/types/tools.ts` (`ToolAction` shape),
> `src/data/courses/*` structure, or `mockStreamLLM` in `src/lib/mimo/llm.ts`.
> Triggered by `VOICE_MOCK=true` test runs and offline-dev usage.

### Contract: mockStreamLLM output must satisfy live type contracts

`mockStreamLLM` (in `src/lib/mimo/llm.ts`) emits a fixed JSON string that the
real streaming pipeline then parses as `AgentResponse`. Two invariants:

1. **Schema parity** — every field shape must match the current `AgentResponse`
   and `ToolAction` types. Specifically:
   - `actions[*]` must satisfy `ToolAction` (currently `{ tool: 'show_card', params: { card_id: string } }`)
   - `state_update` must satisfy the closed schema in the section above (only
     `current_word` + `attempt_assessment` allowed)
2. **Data parity** — every referenced `card_id` must exist in a real course in
   `src/data/courses/*`. The current mock uses `card_id: 'cat'` which is the
   first word card of `animals` course (`src/data/courses/animals.ts`).

### The 2026-05-24 incident (cautionary example)

**Symptom**: `VOICE_MOCK=true` path was silently broken for months. Tests
passed because they didn't exercise the post-normalize pipeline that
type-checks `actions`.

**Cause**: commit `130a71f` (2026-05-05) introduced the `show_card` protocol
and changed `ToolAction` from `{ tool: 'show', params: { image_id } }` to
`{ tool: 'show_card', params: { card_id } }`. The mock was not updated. It
kept emitting the old shape:

```ts
// Pre-2026-05-24 mockStreamLLM (broken since 2026-05-05):
actions: [{ tool: 'show', params: { image_id: 'boat' } }],  // ❌ violates ToolAction
```

This survived because:
- `JSON.parse` doesn't validate against the TS type
- Normalize's `for (const action of response.actions) { if (action.tool !== 'show_card') continue; }` silently dropped the bad action
- No test asserted that `VOICE_MOCK=true` end-to-end produces a non-empty
  normalized `actions` array

### Convention: PR self-check when touching contract surfaces

When a PR modifies any of:

- `src/types/tools.ts` (`ToolAction`, `AgentResponse`, `state_update` shape)
- `src/data/courses/*` (course IDs, card IDs, schema)
- The output schema in `src/lib/agent/prompt.ts`

**The PR self-check must include**:

```bash
# 1. Mock parity — open llm.ts, eyeball mockStreamLLM output:
#    - actions[*] satisfies current ToolAction type?
#    - state_update satisfies current schema?
#    - all referenced card_id values exist in real courses?
VOICE_MOCK=true pnpm test

# 2. Smoke under mock:
VOICE_MOCK=true pnpm dev > /tmp/dev.log 2>&1 &
# manually launch animals lesson, confirm no [normalize] show_card rejected warnings
```

### Validation & Error Matrix

| mock output condition | downstream behavior |
|---|---|
| `actions[*].tool` matches current `ToolAction` shape | Normalize passes through; `forceCardId` math applies normally |
| `actions[*].tool` is stale (e.g. `'show'` instead of `'show_card'`) | Silently filtered out — `[normalize]` console log will be missing the `llmActions` entry |
| `actions[*].params.card_id` references a non-existent card | `[normalize] show_card rejected by R-C` warning fires every turn — VISIBLE in dev console |
| `state_update` includes forbidden fields (e.g. `phase`) | Silently ignored (per state_update schema section) — no error, but those fields do nothing |
| `state_update.current_word` is missing | R6 falls back to `memory.currentWord` — works |

### Wrong vs Correct

#### Wrong — "I changed the protocol, mocks can wait"

```ts
// In src/types/tools.ts:
export type ToolName = 'show_card' | 'play_audio';  // ✨ new tool added
export interface PlayAudioParams { audio_id: string; }
// ... but mockStreamLLM still only emits 'show_card'.
```

**Why wrong**: not by itself broken (the mock just doesn't exercise the new
tool), but if a future contract change deprecates `show_card` and only
`play_audio` remains, the mock breaks silently.

#### Correct — "every contract change → mock review same PR"

```ts
// Same PR: update mockStreamLLM to emit a representative example of the new
// tool, OR add a comment noting that mock is intentionally not updated and
// why (e.g. "play_audio requires audio fixtures, mocked separately in
// audio-fixture.ts").
```

### Tests Required

- Unit: `VOICE_MOCK=true pnpm test` must pass (run as part of full `pnpm test`,
  no separate command needed — `phase-transition.test.ts` / `quiz-answer.test.ts`
  / `progress-snapshot.test.ts` already set `VOICE_MOCK=true`)
- Integration: any new contract surface (tool / card schema) added to the
  PR self-check list above
- Regression: when `VOICE_MOCK=true pnpm dev` is started, no
  `[normalize] show_card rejected` warning should fire in the first turn

---

## Prompt input quantification contract

### 1. Scope / Trigger

- Trigger: changing `src/lib/agent/prompt.ts`, `getMessagesForLLM`, or the
  `streamLLM(systemPrompt, messages)` call shape in `src/lib/agent/session.ts`.
- Reason: lesson reports use `model_calls.llm.inputBreakdown` to decide where
  prompt slimming should happen. The breakdown must describe the same prompt
  and messages actually sent to MiMo, not a separately reconstructed prompt.

### 2. Signatures

- `buildPromptInput(course, memory, phase, messages, inputTokens?)`
  returns `{ systemPrompt, breakdown }`.
- `InteractionLog.modelCalls.llm.inputBreakdown?: PromptInputBreakdown`.
- `scripts/lesson-report-data.ts` reads
  `interaction_logs.model_calls.llm.inputBreakdown` and aggregates it under
  `tokens.llm.promptInputBreakdown`.

### 3. Contracts

- `buildPromptInput().systemPrompt` must be byte-for-byte equal to
  `buildSystemPrompt(course, memory, phase)`.
- `breakdown.systemChars` must equal `systemPrompt.length`.
- `breakdown.messageChars` must equal the sum of the exact `messages[].content`
  strings passed to `streamLLM`.
- Buckets must include:
  `static_rules`, `phase_rules`, `course_definition`, `lesson_state`,
  `summary_constraints`, `history`, and `prompt_separators`.
- `estimatedTokens` is a proportional estimate based on MiMo `prompt_tokens`;
  it is not a tokenizer-accurate bucket count. The exact provider value remains
  `llm.inputTokens`.

### 4. Validation & Error Matrix

| condition | behavior |
|---|---|
| New interaction has `inputBreakdown` | Report aggregates tracked turn, average chars, largest bucket, and estimated token share |
| Old interaction lacks `inputBreakdown` | Report remains backward compatible with `trackedTurns: 0` |
| Bucket is missing or malformed in one stored row | Report skips malformed bucket fields and continues aggregating valid rows |
| MiMo reports `inputTokens = 0` | Bucket `estimatedTokens` may be absent; char counts still provide a baseline |

### 5. Good/Base/Bad Cases

- Good: `streamUserInput` builds `messages` once, calls `buildPromptInput`, sends
  `promptInput.systemPrompt` and the same `messages` to `streamLLM`, then stores
  `promptInput.breakdown` with provider token estimates after `done`.
- Base: existing historical report rows have only `llm.inputTokens`; report
  shows token totals and an empty prompt-input breakdown.
- Bad: report script re-runs `buildSystemPrompt` against current code for an old
  session. That would measure today's prompt, not the prompt actually sent.

### 6. Tests Required

- `src/lib/agent/prompt.test.ts`: assert `buildPromptInput().systemPrompt`
  equals `buildSystemPrompt()` and bucket chars sum to `totalChars`.
- `src/lib/agent/session-prompt-input.test.ts`: assert `streamUserInput`
  persists an `inputBreakdown` aligned with the actual `streamLLM` arguments.
- `scripts/lesson-report-data.test.ts`: assert report aggregation identifies
  the largest bucket and remains compatible with rows that lack breakdown data.
- Smoke: `pnpm smoke:lesson` after agent changes, because this touches the
  `/api/chat` LLM request path.

### 7. Wrong vs Correct

#### Wrong

```ts
const systemPrompt = buildSystemPrompt(course, memory, phase);
await streamLLM(systemPrompt, getMessagesForLLM(memory));
const breakdown = buildPromptInput(course, memory, phase, getMessagesForLLM(memory)).breakdown;
```

This calls `getMessagesForLLM` twice and can drift if message selection changes.

#### Correct

```ts
const messages = getMessagesForLLM(memory);
const promptInput = buildPromptInput(course, memory, phase, messages);
await streamLLM(promptInput.systemPrompt, messages);
```

The prompt sent to MiMo and the measured breakdown share one construction path.

---

## Testing matrix

| Fix | Test file | Key assertion |
|-----|-----------|---------------|
| R1 actions timing | `lesson-controller.test.ts` | `emit('actions')` fires AFTER `session-finished`, not immediately on SSE |
| R2 ASR verify — match | `memory.test.ts` | rawAsrText containing token → `cleared` |
| R2 ASR verify — mismatch | `memory.test.ts` | rawAsrText without token → `attempted` + streak+1 |
| R2 ASR verify — undefined | `memory.test.ts` | undefined rawAsrText → trust LLM, no block |
| ~~R3~~ | superseded by R5 (see below) | — |
| R4 closing override | `closing-guard.test.ts` | speech containing unlearned word → replaced with template |
| R5 whitelist accept current | `memory.test.ts` | `canShowCard(currentCard, ...)` when not cleared → true |
| R5 whitelist accept next | `memory.test.ts` | `canShowCard(getNextWordCardId(...), ...)` → true |
| R5 whitelist reject jump | `memory.test.ts` | `canShowCard(frog when current=dog, next=bird)` → false; output falls back to current/next |
| R5 whitelist reject cleared current | `memory.test.ts` | `canShowCard(currentCard when itself cleared)` → false |
| R6 currentWord exempt | `closing-guard.test.ts` | speech contains currentWord (not in learned) → NOT replaced |
| R6 other unlearned still caught | `closing-guard.test.ts` | speech contains currentWord + other unlearned word → replaced |
| R7 mastered auto-advance | `memory.test.ts` | LLM emits `correct` + empty `actions` → output contains `show_card: nextCard` |
| R7 dedup | `memory.test.ts` | LLM emits `correct` + `show_card: nextCard` → output has exactly one `show_card: nextCard` |
| R7 last card no-op | `memory.test.ts` | clearing the last word card → no extra `show_card` appended |
| **R7 assessedMemory invariant** | `memory.test.ts` | LLM `correct` but ASR literal mismatch (R2 downgrade) → no auto-advance |
| R7 + R5 integration (turtle 2026-05-22) | `memory.test.ts` | replay turn n=30-style state → output advances to lion |

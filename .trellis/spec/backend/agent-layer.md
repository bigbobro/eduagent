# Agent Layer Contracts

Covers `src/lib/agent/{memory,session,prompt}.ts` and `src/lib/voice/lesson-controller.ts`.
These are the modules that turn raw LLM output + ASR text into safe lesson state.

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
- TTS error: null (discard, no flip)
- AbortError / `endLesson`: null (lesson over)

Stale `pendingActions` from one turn must never leak into the next turn.

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

**When `assessment.result === 'correct'`**:

| condition | outcome |
|-----------|---------|
| `rawAsrText` contains the target word (case-insensitive, punctuation stripped) | → `cleared` (normal) |
| `rawAsrText` present but does NOT contain target word | → `attempted` + `streak+1` + `console.warn` |
| `rawAsrText` is `undefined` | → fallback: trust LLM (current behavior, no block) |

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

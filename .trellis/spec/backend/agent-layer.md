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

## Memory: canShowCard contracts

### Contract: word card showability

A word card is showable if and only if its `CardProgressState` is
`'untouched'`, `'attempted'`, or `'needs_review'`.

```ts
// WRONG — only allows activeWordCardId
card.id === activeWordCardId && cardProgress[card.id] !== 'cleared'

// CORRECT — any non-cleared word card is valid
const state = cardProgress[card.id] ?? 'untouched';
state === 'untouched' || state === 'attempted' || state === 'needs_review'
```

**Why**: `activeWordCardId` enforces strict sequential order from `newCardIds`.
When a user explicitly asks "can we do frog?" the LLM outputs `show_card: frog`
but the old gate silently rewrites it back to `cat`. The new rule lets LLM card
selection stand as long as the card hasn't been cleared.

**Cleared cards**: still rejected — `cleared` means the child already mastered
that word this session; showing it again would be regression.

**getActiveWordCardId**: kept as fallback for turns where LLM doesn't specify
a card.

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

### Layer 2 — server-side speech scan before commit

After LLM stream completes, before `commitAssistantStreamResult`, scan
`result.speech` for any course `targetWords` not in `memory.wordsLearned`.

```ts
const unlearnedMentioned = course.targetWords.filter(
  w => !memory.wordsLearned.includes(w) && speechContainsWord(result.speech, w)
);
if (unlearnedMentioned.length > 0) {
  result.speech = `今天我们一起练了 ${memory.wordsLearned.join('、') || '一些新词'},你说得很努力!下次再来玩吧。`;
}
```

**Scope**: only overwrites server-side memory + DB. Client already received
streaming audio for this turn — that is acceptable. The replacement ensures
lesson-report and next-turn LLM history are clean.

**Why Layer 2 is necessary**: even with Layer 1, LLM hallucinates target words
from its training data (e.g. lists "giraffe" in a closing when only "cat" and
"dog" were covered). Prompt alone is insufficient.

---

## Testing matrix

| Fix | Test file | Key assertion |
|-----|-----------|---------------|
| R1 actions timing | `lesson-controller.test.ts` | `emit('actions')` fires AFTER `session-finished`, not immediately on SSE |
| R2 ASR verify — match | `memory.test.ts` | rawAsrText containing token → `cleared` |
| R2 ASR verify — mismatch | `memory.test.ts` | rawAsrText without token → `attempted` + streak+1 |
| R2 ASR verify — undefined | `memory.test.ts` | undefined rawAsrText → trust LLM, no block |
| R3 non-sequential jump | `memory.test.ts` | LLM show_card for non-active untouched card → accepted |
| R3 cleared rejected | `memory.test.ts` | LLM show_card for cleared card → rejected |
| R4 closing override | `closing-guard.test.ts` | speech containing unlearned word → replaced with template |

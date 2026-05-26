# Fix reinforcement quiz card selection blocking

## Goal

Fix the reinforcement pick-word quiz so a learner can continue after the review transition. The quiz prompt should play deterministically, then the answer cards should unlock. A transient controller/TTS timing state must not leave the cards permanently disabled or skip the actual quiz prompt.

## What I Already Know

- The user hit this in a real course on 2026-05-26: the review transition speech played, but the actual prompt "我们现在来复习一下句子吧。看这张图，这是什么？" was missing and the pick-word cards could not be selected.
- The latest real session `baec0f6f-f6b7-4f09-873c-ed036f188af2` had 35 interactions and ended because the lesson could not continue.
- `QuizPickWordFrame` locks card selection while its static prompt is playing or the controller state is `quiz-speaking`.
- `LessonController.speakStatic(text)` is only valid from `awaiting`; it rejects during `speaking`, `greeting`, `listening`, `thinking`, or concurrent static speech.
- `PhasedLessonController` is intended to emit the reinforcement phase only after transition TTS finishes, but the UI should still be robust to timing drift or transient `speakStatic` rejection.

## Requirements

- The first pick-word prompt in reinforcement must retry or wait until the controller can accept static TTS.
- Cards must unlock only after the quiz prompt has successfully finished, not merely because a failed `speakStatic` call settled.
- The fix must stay local to reinforcement UI/controller-boundary behavior unless tests prove a controller change is required.
- Preserve the existing locked-input contract for `quiz-speaking`.

## Acceptance Criteria

- [x] `QuizPickWordFrame` covers entering while the controller is not yet `awaiting`, then becoming `awaiting`: it speaks the prompt and unlocks cards.
- [x] `QuizPickWordFrame` covers a transient `speakStatic` rejection: it retries instead of marking the prompt done.
- [x] Wrong answer retry behavior in `ReinforcementFlow` still speaks the retry prompt.
- [x] Targeted tests pass for reinforcement components and lesson controller static TTS.
- [x] `pnpm exec tsc --noEmit`, `git diff --check`, and the lesson smoke command pass or any blocker is documented.

## Out of Scope

- Redesigning reinforcement quiz content.
- Changing provider protocol, TTS connection semantics, or ASR behavior.
- Mobile/touch-specific compatibility work.

## Technical Notes

- Relevant files: `src/components/lesson/QuizPickWordFrame.tsx`, `src/components/lesson/ReinforceFrame.tsx`, `src/components/lesson/ReinforcementFlow.tsx`, `src/lib/voice/lesson-controller.ts`, and related tests.
- Frontend spec requires controller event subscriptions to clean up and component behavior tests for user-visible interaction.
- Backend agent-layer spec defines `speakStatic` as the deterministic reinforcement speech contract.

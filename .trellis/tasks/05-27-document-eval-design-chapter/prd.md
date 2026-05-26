# Document Eval design chapter

## Goal

Add a standalone Eval design chapter to `docs/architecture.md` so the architecture explains why Eval exists, what design philosophy it follows, what it evaluates, and how it turns lesson data into Agent iteration decisions.

## What I Already Know

- The current architecture only mentions Eval v1 in the file history and lesson-report tooling section.
- The user wants Eval to be part of the overall architecture design, not a small implementation note.
- Eval v1 is deterministic and data-backed: it uses `lesson_logs`, `interaction_logs`, `word_performance`, course definitions, token usage, and prompt input breakdown.
- Eval is not LLM-as-judge and does not evaluate the child as a learner; it evaluates a lesson session as an Agent runtime instance.

## Requirements

- Add a dedicated architecture chapter for Eval before the tooling/report-generator section.
- Explain why Eval is necessary for this Agent project.
- Explain the design philosophy: deterministic first, session-level, decision-oriented, bounded scope, and comparable across runs.
- Describe the five Eval v1 dimensions: `sessionHealth`, `costContext`, `teachingLoop`, `agentBehavior`, `nextIterationSignals`.
- Clarify what Eval v1 intentionally does not evaluate.
- Keep existing implementation references accurate without changing runtime behavior.

## Acceptance Criteria

- [x] `docs/architecture.md` has a standalone Eval chapter.
- [x] The chapter connects Eval to Agent evolution and decisions such as Prompt Slimming v1.
- [x] Existing section numbering and references remain coherent.
- [x] `git diff --check` passes.

## Out of Scope

- Code changes to `scripts/lesson-report-data.ts`.
- New Eval metrics or schema changes.
- New dashboard or report template changes.
- Committing/pushing unless the user asks for it after review.

## Technical Notes

- Existing implementation anchor: `scripts/lesson-report-data.ts` `EvalScorecard`.
- Existing architecture note: `docs/architecture.md` currently mentions Eval v1 in file history and the report-generator section.
- Existing PRD: `.trellis/tasks/archive/2026-05/05-26-eval-v1-lesson-quality-scorecard/prd.md`.

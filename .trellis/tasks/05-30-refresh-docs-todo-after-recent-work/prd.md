# Refresh docs TODO after recent completed work

## Goal

Update `docs/TODO.md` so it reflects the current project state after the recent completed Prompt Slimming v1 and ESLint gate work, without changing runtime code or broadening the roadmap.

## What I already know

* `docs/TODO.md` is the repo's strategic backlog entry point.
* The current TODO header and backlog still read like the 2026-05-23 state.
* Prompt input quantification, Eval v1, Prompt Slimming v1, and non-interactive ESLint configuration have been completed and archived.
* The working tree was clean before this task started.

## Assumptions

* This is a documentation-only refresh.
* The update should keep the existing backlog structure and only correct stale status, next-step wording, and completed-record entries.
* The next real product decision should still be driven by a fresh real lesson plus Eval output.

## Requirements

* Refresh the top status note in `docs/TODO.md` to the current post-05-28 state.
* Move Prompt Slimming v1 from an active first-step backlog item to completed/proven baseline status.
* Keep future cost/latency work as a follow-up only if real Eval data still shows it is the main bottleneck.
* Remove or rewrite stale "等回归稳定后启动" wording where the prerequisite work already happened.
* Mark ESLint gate cleanup as completed so it is no longer listed as远期 backlog.
* Do not edit application code, specs, architecture docs, or archived task files.

## Acceptance Criteria

* [x] `docs/TODO.md` no longer presents Prompt input quantification / Prompt Slimming v1 / ESLint gate as undone.
* [x] The next-step section points to a fresh real lesson and Eval report as the decision gate.
* [x] Remaining backlog items are still present where they have not been implemented: Hybrid pre-rendering, session persistence/resume, course-authoring skill, memory/autonomy/voice UX follow-ups.
* [x] `git diff --check -- docs/TODO.md` passes.

## Definition of Done

* `docs/TODO.md` is updated surgically.
* The Trellis task records the documentation scope.
* No unrelated file changes are included.

## Out of Scope

* Runtime behavior changes.
* New Eval metrics.
* Rewriting `docs/architecture.md`.
* Running a real lesson or generating a new lesson report.
* Implementing any backlog item.

## Technical Notes

* Evidence files inspected:
  * `.trellis/tasks/archive/2026-05/05-26-prompt-input-slimming/prd.md`
  * `.trellis/tasks/archive/2026-05/05-27-prompt-slimming-v1/prd.md`
  * `.trellis/tasks/archive/2026-05/05-27-prompt-slimming-v1/measurement.md`
  * `.trellis/workspace/bigbobro/journal-1.md`
  * `docs/architecture.md`

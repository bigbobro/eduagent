# Review and Update TODO

## Goal

Update `docs/TODO.md` so it reflects the current 2026-05-23 lesson stabilization state, not the older 2026-05-22 second-test plan.

## What I already know

- The selected long-term backlog item says logging should be added when debugging becomes painful.
- The latest voice/card-sync debugging already added enough lightweight diagnostics through lesson reports, smoke checks, and targeted logs.
- The current TODO still says the next step is the second animals real test, but 2026-05-23 reports and fixes have already moved the project beyond that point.
- The recent pushed fix stabilized push-to-talk, speech/show_card alignment, reinforcement question unlocking, and smoke coverage.

## Requirements

- Mark the logging cleanup item as completed rather than leaving it in the long-term backlog.
- Update the next-step section to the current post-fix regression focus.
- Keep Hybrid TTS/teacher architecture parked unless the next real regression still proves teacher-agent quality or runtime cost is the main bottleneck.
- Add only useful backlog adjustments surfaced by the latest reports.

## Acceptance Criteria

- [x] `docs/TODO.md` no longer presents 2026-05-22 "second test" as the current state.
- [x] `docs/TODO.md` records the 2026-05-23 stabilization work as completed.
- [x] Long-term backlog no longer contains the completed logging cleanup item.
- [x] The next action is concrete and testable.

## Verification

- `git diff --check -- docs/TODO.md .trellis/tasks/05-23-review-and-update-todo/prd.md`
- `python3 ./.trellis/scripts/task.py validate 05-23-review-and-update-todo`
- `rg` confirmed old "第二轮实测" / "2026-05-22 更新版" wording is gone from `docs/TODO.md`.

## Out of Scope

- No product/code behavior changes.
- No test implementation beyond light markdown/diff validation.

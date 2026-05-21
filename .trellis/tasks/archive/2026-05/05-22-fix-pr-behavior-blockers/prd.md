# Fix PR Behavior Blockers

## Goal

Make PR #3 mergeable by fixing the three remaining user-visible behavior blockers without expanding scope.

## Requirements

* Journal must choose a meaningful active course in the expanded 10-course catalog, not always the first course.
* Journal empty state must mean no practiced words across all courses, not merely zero 3-star mastered words.
* The in-lesson done screen's "再来一节" action must actually restart the current lesson flow.
* The in-lesson done screen must not claim all course words were learned when the phase reached done through retry limits or partial progress.

## Acceptance Criteria

* [x] A progress snapshot with activity only in a non-first course opens that course in the Journal detail pane.
* [x] A progress snapshot with attempts but no 3-star mastered words does not show the empty Journal state.
* [x] Clicking "再来一节" from the in-lesson done screen resets the lesson UI to the intro/start state for the same course.
* [x] In-lesson done metrics are derived from cleared/current lesson progress, not the full course word count.
* [x] Focused tests cover the three behavior fixes.
* [x] `pnpm test`, `pnpm exec tsc --noEmit`, and `git diff --check origin/main...HEAD` pass.

## Out of Scope

* No new course content.
* No redesign beyond minimal UI affordance needed for course selection.
* No broad PR review expansion.
* No architecture HTML/JSON regeneration unless directly required by the fixes.

## Technical Notes

* Relevant files: `src/components/journal/JournalPage.tsx`, `src/components/journal/JournalPage.test.tsx`, `src/components/lesson/PhasedLessonView.tsx`, `src/components/lesson/PhasedLessonView.test.tsx`, `src/lib/voice/phased-lesson-controller.ts`.
* Existing verification already passed for test/type/build/smoke/image audit before this task; this task should keep those green and add focused behavioral coverage.

# Address PR Review Findings

## Goal

Fix the confirmed PR review issues before merging `feature/cc-ui-refresh`: prevent reinforcement repeat-after-me audio from triggering both quiz handling and normal chat handling, reduce course image payload risk, correct completion CTA routing, and remove unused done-page course fetching that can hide progress.

## What I Already Know

- PR review found four confirmed issues:
  - Repeat-after-me in reinforcement calls local quiz answer handling from `asr-final`, then the same ASR final continues through `LessonController.handleAsrFinal` into `/api/chat` as a normal `message`.
  - `public/images` currently contains 120 PNGs, roughly 257 MB total, and every PNG is over 1 MB.
  - Lesson chip and hero cards render the same original PNG through `IllustrationSlot` CSS background images, so thumbnails do not have a smaller asset path.
  - `course:image-audit` checks missing, tiny, and extra images only; it does not enforce maximum byte size or dimensions.
  - The in-lesson done screen wires `DoneCelebrateFrame.onAgain` to `/lesson/<courseId>/done` instead of restarting `/lesson/<courseId>`.
  - `LessonDoneClient` fetches `/api/courses` into unused state; if that request fails, progress falls back to empty data.
- Current course authoring contract expects one PNG per word card under `public/images/<courseId>/<wordCardId>.png`; sentence cards reuse their target word image.
- Existing tests cover successful course data shape, basic phase transitions, reinforcement flow, and done frame button callbacks, but they do not cover the repeat-after-me double-submit path or in-lesson done `onAgain` routing.

## Decisions

- The target branch is the current PR branch, `feature/cc-ui-refresh`; fixes should be added on this branch.
- The task should stay focused on the four review findings and avoid broader UI redesign.
- Image strategy for this task: keep existing `.png` URLs and course data unchanged, optimize/downscale the checked-in PNGs, and add audit limits for maximum dimensions/bytes. Do not introduce WebP/AVIF, Next Image, or separate thumbnail manifests in this iteration.
- Reinforcement repeat-after-me should still use the existing ASR recorder and `asr-final` event, but it should not create a normal AI chat turn for quiz scoring.

## Requirements

- Reinforcement repeat-after-me:
  - A child recording during a repeat-after-me quiz is handled once.
  - Correct/incorrect quiz recording still reaches `recordQuizAnswer`.
  - The same ASR final must not trigger `/api/chat?action=message` or teacher TTS for the prior quiz answer.
  - Existing interactive lesson recording outside reinforcement must keep the normal `/api/chat?action=message` behavior.

- Image assets and audit:
  - Course images remain referenced by existing course data paths.
  - All checked-in course PNGs should be optimized to a bounded payload appropriate for web delivery.
  - `pnpm course:image-audit` should fail on missing, tiny, extra, oversized, or over-dimensioned course images.
  - Course authoring docs/spec should state the maximum image size/dimension expectations if the contract changes.

- Completion flow:
  - The in-lesson done screen `再来一节` action restarts the current course.
  - The dedicated `/lesson/<id>/done` page keeps its existing restart behavior.

- Done page progress:
  - `LessonDoneClient` should not fetch unused course data.
  - A `/api/courses` problem should not erase or replace valid progress data on the done page.

## Acceptance Criteria

- [x] A test proves repeat-after-me ASR in reinforcement does not call the normal chat message path while still recording quiz answer state.
- [x] A test or component-level assertion proves the in-lesson done screen `再来一节` routes to `/lesson/<courseId>`.
- [x] A test or regression check proves `LessonDoneClient` no longer depends on `/api/courses` for rendering progress.
- [x] `pnpm course:image-audit` enforces maximum byte size and dimensions and passes on the optimized assets.
- [x] Existing course data tests still pass, including 12 word cards, 4 sentence cards, and sentence image reuse.
- [x] `pnpm test` passes.
- [x] `pnpm build` passes.

## Verification

- `pnpm test` passed: 41 files, 178 tests.
- `pnpm exec tsc --noEmit` passed.
- `pnpm course:image-audit` passed with expected=120, missing=0, tiny=0, oversized=0, overDimensioned=0, invalid=0, extra=0.
- `pnpm build` passed.
- `SMOKE_PORT=3991 pnpm run smoke` passed. A first smoke attempt on 3001 failed because that port was already occupied by another process.
- `git diff --check` passed.

## Definition of Done

- Code changes are scoped to the four review findings.
- Tests are added or updated for behavior changes.
- Image optimization is reproducible enough for future course assets.
- Course authoring docs/spec are updated if image constraints are changed.
- Git status is clean except expected Trellis task/session files before commit.
- Changes are committed and pushed to the PR branch after verification.

## Out of Scope

- Adding new courses.
- Regenerating artwork with ImageGen.
- Switching the app to WebP/AVIF or a new image CDN pipeline.
- Reworking the full lesson UI layout or visual design.
- Changing pronunciation scoring quality beyond avoiding the double-submit/chat side effect.

## Technical Notes

- Main affected files from review:
  - `src/components/lesson/ReinforceFrame.tsx`
  - `src/components/lesson/ReinforcementFlow.tsx`
  - `src/lib/voice/lesson-controller.ts`
  - `src/app/api/chat/route.ts`
  - `src/lib/agent/session.ts`
  - `src/components/lesson/PhasedLessonView.tsx`
  - `src/app/lesson/[id]/done/LessonDoneClient.tsx`
  - `src/components/magic/IllustrationSlot.tsx`
  - `src/components/magic/PictureCard.tsx`
  - `scripts/prepare-course-image-jobs.ts`
  - `docs/course-authoring-standard.md`
  - `.trellis/spec/frontend/course-authoring.md`
- Existing verification from review:
  - `pnpm test` passed: 39 files, 174 tests.
  - `pnpm build` passed.
  - Current `pnpm course:image-audit` passed only because it lacks oversized image checks.
- Context files curated for implementation and check:
  - `.trellis/spec/frontend/course-authoring.md`
  - `.trellis/spec/frontend/component-guidelines.md`
  - `.trellis/spec/frontend/state-management.md`
  - `.trellis/spec/frontend/quality-guidelines.md`
  - `.trellis/spec/backend/quality-guidelines.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`

## Open Questions

- None.

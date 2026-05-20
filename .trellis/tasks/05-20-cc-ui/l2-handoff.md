# L2 Handoff: CC UI Refresh

Date: 2026-05-21
Branch: `feature/cc-ui-refresh`

## Scope Delivered

- Replaced the frontend visual system with the CC hand-drawn Magic Academy direction.
- Kept voice protocol, `LessonController`, route structure, APIs, and server behavior intact.
- Completed the required data naming switch: `theme` -> `tone`, `courseTheme` -> `courseTone`, and removed `sceneImage`.
- Replaced the old UI surfaces with:
  - `HomeStudy`
  - `IntroFrame`
  - `LessonMandalaV2`
  - `QuizPickWordFrame`
  - `ReinforceFrame`
  - `ReinforcementFlow`
  - `DoneCelebrateFrame`
  - `JournalPage`
  - `PINGateFrame`
  - `ParentsPage`
- Deleted the old Bunny / scene / LetterCard / BloomButton / WordBook / SubtitleBar / legacy parents and legacy UI components.
- Generated and installed six 1024x1024 watercolor food PNGs:
  - `public/images/food/apple.png`
  - `public/images/food/banana.png`
  - `public/images/food/bread.png`
  - `public/images/food/milk.png`
  - `public/images/food/egg.png`
  - `public/images/food/rice.png`

## L1 Machine Checks

- `pnpm exec tsc --noEmit`: pass
- `pnpm test`: pass, 32 files / 152 tests
- After the Journal artwork fix:
  - `pnpm test src/components/journal/JournalPage.test.tsx src/lib/progress.test.ts tests/api/progress.test.ts`: pass, 3 files / 14 tests
  - `pnpm exec tsc --noEmit`: pass
  - `pnpm test`: pass, 32 files / 152 tests
  - `pnpm build`: pass
  - `git diff --check`: pass
- `pnpm build`: pass
- `pnpm run lint`: not a configured lint check yet; it opens Next's ESLint initializer because the repo has no ESLint config or ESLint dependencies.
- `pnpm run dev`: pass on `http://localhost:3000`
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`: `200`
- `curl -s http://localhost:3000/api/courses`: returns the food course with `"tone":"peach"`
- Additional live route/API probes returned `200`: `/lesson/food`, `/lesson/food/done`, `/journal`, `/parents`, `/api/progress`, `/api/sessions`, `/api/stats`.
- `git grep -l "bunny" src/`: no matches
- `git grep -l "CourseTheme\|courseTheme\|sceneImage" src/`: no matches
- `git ls-files src/components/bunny src/components/scene`: no output.

`pnpm run smoke` was not run because it requires starting a second tsx dev server and the sandbox escalation request was rejected by the current usage-limit policy. The required PRD L1 route/API checks above were run against the live dev server on port 3000.

## Visual Evidence

- `/lesson/food`: `/private/tmp/eduagent-lesson-fixed.png`
- `/journal`: `/private/tmp/eduagent-journal-fixed2.png`

During visual review, `/journal` initially showed striped placeholders because `WordMastery` did not carry `imageUrl` from course cards. This is fixed by passing course card artwork through `/api/progress` and into `PictureCard`. A follow-up screenshot also confirmed the decorative Mochi no longer overlaps the rice card.

## L2 Manual Checklist

- [ ] HANDOFF §12 visual checklist 12 items pass.
- [ ] One real food lesson reaches listening / recording / correct / tryAgain with visibly distinct states.
- [ ] Quiz covers one correct and one wrong path with visible feedback.
- [ ] Reinforce fill-in sentence shows colored empty vs filled state.
- [ ] Done page shows 5 stars, stats, and both CTAs.
- [ ] `/journal` shows the collected food cards based on real progress.
- [ ] `/parents` first-time 4-digit PIN setup unlocks the stats panel.
- [ ] `prefers-reduced-motion` disables sparkle motion.

## Notes For Reviewer

- The rice asset was regenerated once because the first image looked like a single grain and was weak for child recognition; the installed version is a small bowl of cooked rice.
- `ParentsPage` intentionally shows placeholders for streak and accuracy because those fields are not available from the current stats layer.

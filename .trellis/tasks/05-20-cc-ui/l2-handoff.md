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
- `pnpm test`: pass, 36 files / 162 tests
- After the Journal artwork fix:
  - `pnpm test src/components/journal/JournalPage.test.tsx src/lib/progress.test.ts tests/api/progress.test.ts`: pass, 3 files / 14 tests
  - `pnpm exec tsc --noEmit`: pass
  - `pnpm test`: pass, 32 files / 152 tests
  - `pnpm build`: pass
  - `git diff --check`: pass
- After the PIN remaining-attempts fix:
  - `pnpm test src/components/parents/PINGateFrame.test.tsx src/lib/pin.test.ts tests/design-tokens.test.ts`: pass, 3 files / 15 tests
  - `pnpm exec tsc --noEmit`: pass
  - `pnpm test`: pass, 32 files / 154 tests
  - `pnpm build`: pass
  - `pnpm run smoke` with `SMOKE_PORT=59425`: pass
  - `git diff --check`: pass
- After the L2 regression coverage pass:
  - `pnpm test src/components/lesson/QuizPickWordFrame.test.tsx src/components/lesson/ReinforceFrame.test.tsx src/components/lesson/DoneCelebrateFrame.test.tsx src/app/parents/ParentsClient.test.tsx`: pass, 4 files / 7 tests
  - `pnpm exec tsc --noEmit`: pass
  - `pnpm test`: pass, 35 files / 159 tests
  - `pnpm build`: pass
  - `pnpm run smoke` with `SMOKE_PORT=59426`: pass
  - `git diff --check`: pass
- After the live lesson state-mapping coverage pass:
  - `pnpm test src/components/lesson/LessonMandalaV2.test.tsx src/components/lesson/QuizPickWordFrame.test.tsx src/components/lesson/ReinforceFrame.test.tsx src/components/lesson/DoneCelebrateFrame.test.tsx src/app/parents/ParentsClient.test.tsx`: pass, 5 files / 10 tests
  - `pnpm exec tsc --noEmit`: pass
  - `pnpm test`: pass, 36 files / 162 tests
  - `pnpm build`: pass
  - `pnpm run smoke` with `SMOKE_PORT=59427`: pass
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

`pnpm run smoke` now passes when run on an available port (`SMOKE_PORT=59427`). A previous run on `3002` failed because that port was already occupied by an unrelated local `hyperframes preview` process, so it was a false negative.

## Visual Evidence

- `/lesson/food`: `/private/tmp/eduagent-lesson-fixed.png`
- `/journal`: `/private/tmp/eduagent-journal-fixed2.png`

During visual review, `/journal` initially showed striped placeholders because `WordMastery` did not carry `imageUrl` from course cards. This is fixed by passing course card artwork through `/api/progress` and into `PictureCard`. A follow-up screenshot also confirmed the decorative Mochi no longer overlaps the rice card.

During HANDOFF §12 audit, the parent PIN gate initially showed a generic wrong-PIN message but not the required remaining-attempt count. This is fixed: the first two wrong attempts now show `不对哦,还剩 2 次` and `不对哦,还剩 1 次`; the third attempt still enters the existing lockout flow.

Additional L2 regression tests now cover LessonMandala live state mapping (`listening -> recording`, `thinking -> tryAgain`, cleared progress -> `correct`), quiz correct/wrong visual states, Reinforce empty-vs-filled color state, Done page 5-star/data/two-CTA rendering, and first-time `/parents` PIN setup flowing into the stats panel.

## L2 Manual Checklist

- [ ] HANDOFF §12 visual checklist 12 items pass.
- [ ] One real food lesson reaches listening / recording / correct / tryAgain with visibly distinct states.
- [ ] Quiz covers one correct and one wrong path with visible feedback.
- [ ] Reinforce fill-in sentence shows colored empty vs filled state.
- [ ] Done page shows 5 stars, stats, and both CTAs.
- [ ] `/journal` shows the collected food cards based on real progress.
- [ ] `/parents` first-time 4-digit PIN setup unlocks the stats panel.
- [ ] `prefers-reduced-motion` disables sparkle motion.

## Remaining Definition of Done

- Human L2 acceptance still needs explicit confirmation from the reviewer.
- After L2 passes, merge `feature/cc-ui-refresh` into `main`.
- After merge, archive the Trellis task and record the session journal.

## Notes For Reviewer

- The rice asset was regenerated once because the first image looked like a single grain and was weak for child recognition; the installed version is a small bowl of cooked rice.
- `ParentsPage` intentionally shows placeholders for streak and accuracy because those fields are not available from the current stats layer.

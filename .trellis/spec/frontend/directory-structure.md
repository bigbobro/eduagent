# Directory Structure

Frontend code is organized by screen and reusable visual domain. The project
uses App Router pages as thin route shells and keeps substantial UI in
`src/components/**` or route-local client wrappers.

## Current Layout

```text
src/app/
  page.tsx                         magic study home, course books
  lesson/[id]/page.tsx             server route shell
  lesson/[id]/LessonClient.tsx     client course fetch + PhasedLessonView
  lesson/[id]/done/                lesson completion page
  parents/                         parent dashboard route/client
  journal/                         word journal route/client
  api/                             backend routes, not UI code
src/components/
  magic/                           CC design atoms: Cat, PaperBg, PaperButton, PictureCard
  lesson/                          lesson frames, mandala, quizzes, reinforcement, done
  home/                            HomeStudy
  parents/                         PINGateFrame and ParentsPage
  journal/                         JournalPage
  ui/                              root ErrorBoundary and SVGDefs only
src/hooks/
  useSpacebar.ts                   push-to-talk keyboard hook
public/images/<course>/            course card PNGs
public/worklets/                   browser AudioWorklet scripts
```

## App Router Pattern

- Route files should stay small. `src/app/lesson/[id]/page.tsx` only passes the
  route param to `LessonClient`.
- Client-only screens/components start with `'use client'` and own browser APIs,
  `useRouter`, `fetch`, controller instances, and event subscriptions.
- Data-loading pages currently fetch internal JSON routes from the client:
  `HomePage` fetches `/api/courses`, `JournalClient` fetches `/api/progress`,
  and `ParentsClient` fetches `/api/stats` plus `/api/sessions`.

## Component Organization

- Put lesson-flow UI in `src/components/lesson/**`.
  `PhasedLessonView` composes `IntroFrame`, `LessonMandalaV2`,
  `ReinforcementFlow`, and `DoneCelebrateFrame`.
- Put reusable CC visual atoms in `src/components/magic/**`; use `PaperBg` for
  full-screen paper surfaces and `PictureCard` for word/sentence cards.
- Put domain-specific UI near its screen (`parents`, `journal`, `home`) rather
  than expanding `components/ui`.
- Keep `components/ui` narrow. Current shared primitives live in
  `src/components/magic/**`; `components/ui` owns root shell utilities such as
  `ErrorBoundary` and `SVGDefs`.

## Assets

- Course card art lives under `public/images/<theme>/<cardId>.png`.
- Introduction phases do not require `scene.svg`; `IntroFrame` renders
  `sceneCaption` / `narrationHint` plus card chips, per
  `docs/course-authoring-standard.md`.
- Audio worklets live in `public/worklets/` because `AudioWorklet.addModule()`
  loads them by URL.

## Naming Conventions

- React component files use PascalCase (`PhasedLessonView.tsx`,
  `PaperButton.tsx`).
- Hook files use `use*` naming (`useSpacebar.ts`).
- Route-local client wrappers use `*Client.tsx`.
- Tests sit next to components/libs or under `tests/**` for route/API coverage.

## Examples To Follow

- `src/app/lesson/[id]/LessonClient.tsx`: route-local client data fetcher.
- `src/components/lesson/LessonMandalaV2.tsx`: subscribes to controller events
  and maps lesson state to UI.
- `src/components/magic/PictureCard.tsx`: canonical typed visual card.
- `src/components/home/HomeStudy.tsx`: typed props, a11y labels, and course tone
  mapping.

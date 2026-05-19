# Directory Structure

Frontend code is organized by screen and reusable visual domain. The project
uses App Router pages as thin route shells and keeps substantial UI in
`src/components/**` or route-local client wrappers.

## Current Layout

```text
src/app/
  page.tsx                         home yard, course letters
  lesson/[id]/page.tsx             server route shell
  lesson/[id]/LessonClient.tsx     client course fetch + PhasedLessonView
  lesson/[id]/done/                lesson completion page
  parents/                         parent dashboard route/client
  journal/                         word journal route/client
  api/                             backend routes, not UI code
src/components/
  lesson/                          lesson phases, quizzes, word book, subtitles
  scene/                           full-screen scene backgrounds/frames
  bunny/                           Bunny character SVG
  home/                            course letter card
  parents/                         PIN, stats, settings, session rows
  journal/                         word shelf/entry
  ui/                              shared button/surface/stars/pin/icons
src/hooks/
  useSpacebar.ts                   push-to-talk keyboard hook
public/images/<course>/            course card PNGs and structured scene.svg
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
  `PhasedLessonView` composes `IntroPhase`, `InteractivePhase`, and
  `ReinforcePhase`.
- Put reusable scene shells in `src/components/scene/**`; use `SceneFrame` to
  select the background variant and entry motion.
- Put domain-specific UI near its screen (`parents`, `journal`, `home`) rather
  than expanding `components/ui`.
- Keep `components/ui` for small shared primitives such as `Button`, `Surface`,
  `Stars`, `PinPad`, and icons.

## Assets

- Course card art lives under `public/images/<theme>/<cardId>.png`.
- Introduction scene assets use `public/images/<theme>/scene.svg` and stable
  `card-<id>` hotspot ids, per `docs/course-authoring-standard.md`.
- Audio worklets live in `public/worklets/` because `AudioWorklet.addModule()`
  loads them by URL.

## Naming Conventions

- React component files use PascalCase (`PhasedLessonView.tsx`,
  `BloomButton.tsx`).
- Hook files use `use*` naming (`useSpacebar.ts`).
- Route-local client wrappers use `*Client.tsx`.
- Tests sit next to components/libs or under `tests/**` for route/API coverage.

## Examples To Follow

- `src/app/lesson/[id]/LessonClient.tsx`: route-local client data fetcher.
- `src/components/lesson/InteractivePhase.tsx`: subscribes to controller events
  and maps lesson state to UI.
- `src/components/scene/SceneFrame.tsx`: shared shell with typed variants.
- `src/components/home/LetterCard.tsx`: typed props, a11y label, theme mapping,
  and Framer Motion button.

# Component Guidelines

Components are functional React components with explicit TypeScript props,
Tailwind classes, and small local helpers. Most user-facing components are
client components because the app depends on browser audio, routing, and
interaction state.

## Component Structure

Follow the local shape used by `PaperButton`, `LessonMandalaV2`, and
`PictureCard`:

- `'use client'` first when the file uses hooks, browser APIs, Framer Motion, or
  event handlers.
- Imports.
- Local types/interfaces.
- Local constants and small helper functions.
- Exported component.
- Private subcomponents only when they are tightly coupled to the file, as in
  `ParentsPage.tsx` or `JournalPage.tsx`.

Keep heavy orchestration out of JSX. `LessonMandalaV2` subscribes to
`LessonController` events in an effect, derives simple render state, and leaves
ASR/TTS details inside the controller.

## Props Conventions

- Define named `interface *Props` near the component.
- Use imported domain types for data contracts: `Course`, `Quiz`, `WordCard`,
  `LessonController`, `StatsSnapshot`, and `ProgressSnapshot`.
- For discriminated unions, narrow with `Extract`, as in `QuizPickWordProps` and
  `QuizRepeatAfterMeProps`.
- Prefer callbacks with domain-shaped payloads, for example
  `onAnswer({ correct, picked })`, not separate loosely related arguments.

## Styling Patterns

- Use Tailwind utility classes and project tokens from `tailwind.config.ts`:
  `paper`, `ink`, `butter`, `mint`, `peach`, `rounded-paper-*`,
  `shadow-paper`, `font-zh`, `font-display`, and `font-en`.
- Use `PaperBg` for full-screen paper backgrounds and keep app views as the
  actual first screen, not explanatory or marketing pages.
- Use `PictureCard` for word/sentence cards. It is the canonical card primitive
  for hero, tile, and chip presentations.
- Inline styles are acceptable for token-driven dynamic values, such as
  `palette[course.tone]` backgrounds.

## Accessibility

- Interactive non-form elements should be real `<button type="button">`.
- Icon or visual-only navigation buttons need `aria-label`, as in the home page
  ladder/door buttons and journal/parents back buttons.
- Decorative images should use `alt=""` and `aria-hidden="true"`, while semantic
  images need labels. `Cat` exposes `role="img"` and `aria-label="Mochi 麻吉"`.
- Focus-visible ring classes are part of the UI contract. Tests check this for
  `PaperButton`.
- Pointer controls should handle cancellation. Push-to-talk controls handle
  `onPointerCancel` and `onPointerLeave`.

## Common Mistakes

- Do not create a second mascot system; current code uses one storybook `Cat`
  with `mood`.
- Do not bypass `LessonController` by calling ASR/TTS clients directly from
  lesson components.
- Do not add card UI that assumes long-term mastery from session-local
  `clearedCardIds`.
- Do not reintroduce structured scene hotspots or hard-coded course geometry for
  introductions; `IntroFrame` renders course cards from the current course data.

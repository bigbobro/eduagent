# Component Guidelines

Components are functional React components with explicit TypeScript props,
Tailwind classes, and small local helpers. Most user-facing components are
client components because the app depends on browser audio, routing, and
interaction state.

## Component Structure

Follow the local shape used by `BloomButton`, `InteractivePhase`, and
`SceneFrame`:

- `'use client'` first when the file uses hooks, browser APIs, Framer Motion, or
  event handlers.
- Imports.
- Local types/interfaces.
- Local constants and small helper functions.
- Exported component.
- Private subcomponents only when they are tightly coupled to the file, as in
  `Bunny.tsx`.

Keep heavy orchestration out of JSX. `InteractivePhase` subscribes to
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
  `bunny-*` colors, `rounded-bunny-*`, `shadow-*`, `font-zh`, and `font-en`.
- Use `SceneFrame` for full-screen scene backgrounds instead of adding unrelated
  page wrappers.
- Use Framer Motion for scene/card transitions where it already exists
  (`SceneFrame`, `LetterCard`, `WordBook`). Do not introduce another animation
  system for similar UI.
- Inline styles are acceptable for dynamic geometry such as scene hotspot
  percentages in `IntroPhase` or computed letter positions in `HomePage`.

## Accessibility

- Interactive non-form elements should be real `<button type="button">`.
- Icon or visual-only navigation buttons need `aria-label`, as in the home page
  ladder/door buttons and journal/parents back buttons.
- Decorative images should use `alt=""` and `aria-hidden="true"`, while semantic
  images need labels. `Bunny` exposes `role="img"` and `aria-label="Bunny 老师"`.
- Focus-visible ring classes are part of the UI contract. Tests check this for
  `Button` and `BloomButton`.
- Pointer controls should handle cancellation. `BloomButton` uses pointer
  capture and handles `onPointerCancel` / `onPointerLeave`.

## Common Mistakes

- Do not create a second Bunny or separate partial mascot system; current code
  uses one full-body `Bunny` with `pose` and `mood`.
- Do not bypass `LessonController` by calling ASR/TTS clients directly from
  lesson components.
- Do not add card UI that assumes long-term mastery from session-local
  `clearedCardIds`.
- Do not hard-code course ids in generic components unless the current component
  is explicitly food-only, like `IntroPhase` scene slot geometry.

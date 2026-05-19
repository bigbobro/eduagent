# Quality Guidelines

Frontend quality depends on preserving the lesson state machine, push-to-talk
ergonomics, accessibility labels, and the bunny visual system.

## Required Patterns

- Use React Testing Library for component behavior tests. Existing examples:
  `BloomButton.test.tsx`, `IntroPhase.test.tsx`, `QuizPickWord.test.tsx`,
  `ReinforcePhase.test.tsx`, and `PhasedLessonView.test.tsx`.
- Test pure browser-event helpers directly when possible. `useSpacebar.test.ts`
  validates the global keyboard behavior through `attachSpacebarHandlers`.
- Keep focus-visible styles and accessible labels on interactive controls.
- Preserve reduced-motion behavior in `src/app/globals.css`: most animations are
  reduced, but `.bunny-motion` remains because Bunny mood animation is semantic
  feedback.
- Use design tokens from `tailwind.config.ts`; tests in
  `tests/design-tokens.test.ts` guard the bunny palette, radii, and shadows.

## Forbidden Patterns

- Do not start recording from UI when the lesson is not `awaiting` or
  `listening`. Speaking interruption is intentionally unsupported.
- Do not call `AsrClient`, `TtsClient`, `PcmPlayer`, or recorder APIs directly
  from lesson components; go through `LessonController`.
- Do not remove pointer-cancel/leave handling from press controls.
- Do not add unlabelled icon-only buttons.
- Do not introduce generic visual palettes that bypass the bunny design tokens.

## Testing Requirements

- Component changes: add or update the closest `*.test.tsx`.
- Hook changes: test the pure event wiring and React cleanup behavior.
- Lesson state/phase changes: update controller tests and at least one component
  integration test if the rendered behavior changes.
- Course UI/data changes: update course tests and run `pnpm test src/data/courses`.
- Route/page changes: run `pnpm run smoke` when practical, because the app is
  full-screen and route regressions are easy to miss.

## Review Checklist

- Does text fit in fixed controls and full-screen layouts?
- Are all interactive elements reachable by keyboard or intentionally pointer
  only with an equivalent keyboard path?
- Does every controller event subscription clean up with `.off()`?
- Are loading, empty, and error states present for fetch-driven screens?
- Does the UI still reflect the current course registry, which is currently only
  `food`?

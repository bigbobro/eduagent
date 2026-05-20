# Hook Guidelines

The project currently has one shared custom hook: `useSpacebar`. Most other
stateful behavior lives directly in client components or controller classes.

## Custom Hook Pattern

`src/hooks/useSpacebar.ts` is the model:

- Export a pure attachment function (`attachSpacebarHandlers`) for easy unit
  testing without React.
- Keep mutable callback/enabled state in refs so event listeners are attached
  once and still see latest props.
- Clean up document-level listeners in the effect teardown.
- If teardown happens during an active press, reset the pressed ref and call
  `onUp` so recording does not get stuck.

Use this split when adding hooks that wrap global browser events.

## Keyboard Interaction Rules

- Ignore repeated keydown events.
- Ignore Space when an input, textarea, or contenteditable element is focused.
- Gate `onDown` with an `enabled` ref, but still allow keyup to stop an already
  active press.
- Prevent default only for handled Space press/release.

These rules are covered by `src/hooks/useSpacebar.test.ts`.

## Data Fetching

There is no React Query/SWR layer. Client screens fetch internal API routes with
`fetch` inside `useEffect` and store `loading/error/data` in local state:

- `src/app/page.tsx` -> `/api/courses`
- `src/app/lesson/[id]/LessonClient.tsx` -> `/api/courses`
- `src/app/journal/JournalClient.tsx` -> `/api/progress`
- `src/app/parents/ParentsClient.tsx` -> `/api/stats` and `/api/sessions`

Follow that pattern unless the app gains repeated server-state needs that
justify a dedicated data fetching abstraction.

## Naming Conventions

- Shared hooks use `use*` filenames and exports.
- Pure helper functions inside hook files should not use the `use` prefix.
- Hook options should be typed with an exported interface when tests or multiple
  components use it.

## Common Mistakes

- Do not attach document/window listeners directly in components when the logic
  is shared or needs careful teardown; extract a hook with a testable pure
  attachment function.
- Do not include changing callbacks in a global-listener effect dependency array
  unless reattaching is intentional. Use refs for latest callbacks instead.
- Do not start push-to-talk while `LessonController` is not in `awaiting` or
  `listening`; lesson views such as `LessonMandalaV2` compute `canHold` before
  enabling `useSpacebar`.

# Frontend Development Guidelines

The EduAgent frontend is a full-screen children's learning app built with
Next.js App Router, React client components, Tailwind CC magic-academy design
tokens, and controller-driven lesson views. The main lesson UI is driven by
browser-side controller classes that emit state, subtitle, action, and progress
events.

## Pre-Development Checklist

- Confirm whether the change touches the lesson flow, home/journal/parents
  surfaces, shared UI, course data, or audio interaction.
- Read `docs/architecture.md` before changing lesson state, ASR/TTS playback,
  or phase transitions.
- Reuse the current CC palette, paper radii, paper shadows, and font tokens from
  `tailwind.config.ts`.
- Keep the experience as the actual app screen. Do not replace app views with
  marketing or explanatory pages.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | App Router, components, hooks, assets | Filled |
| [Component Guidelines](./component-guidelines.md) | Props, composition, styling, a11y, motion | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Current custom hook patterns and data fetching | Filled |
| [State Management](./state-management.md) | Local, controller, server, durable state boundaries | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Required frontend tests and review checks | Filled |
| [Type Safety](./type-safety.md) | Shared contracts and runtime validation limits | Filled |

## Quality Check

- Run `pnpm test` for shared frontend changes. For narrow edits, run the closest
  component/hook test file first.
- Run `pnpm exec tsc --noEmit`.
- For course visibility, route, or page-level changes, use `pnpm run smoke`
  after a dev server is available.
- Add or update React Testing Library coverage for user-visible behavior,
  keyboard/pointer interaction, and a11y labels.

## Representative Code Examples

Components should type props locally and clean up controller subscriptions:

```tsx
// src/components/lesson/LessonMandalaV2.tsx
interface LessonMandalaV2Props {
  course: Course;
  controller: LessonController;
}

useEffect(() => {
  controller.on('state', onState);
  return () => controller.off('state', onState);
}, [controller]);
```

Shared UI should use typed variants and CC magic design tokens:

```tsx
// src/components/magic/PaperButton.tsx
const sizeCx: Record<PaperButtonSize, string> = {
  sm: 'rounded-paper-md px-[18px] py-2 text-base',
  md: 'rounded-[22px] px-[26px] py-3 text-xl',
  lg: 'rounded-paper-lg px-9 py-4 text-[26px]',
};
```

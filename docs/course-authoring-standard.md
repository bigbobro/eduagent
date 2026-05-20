# Course Authoring Standard

> Stable entrypoint for Codex-generated courses. This document defines how a new lesson is produced after the three-phase lesson structure lands.

## 1. Course Shape

Every regular theme course should teach **words plus short sentences**, not a word-picture catalog.

- Use 6-10 `word` cards for concrete, visual targets.
- Define 1-2 core sentence patterns in `objectives.sentences`.
- Default to `word` cards + sentence objectives. Use `kind: 'sentence'` cards only when the sentence itself needs a dedicated visual card, such as abstract relations in a future time/number course.
- Keep the sentence load light for 3-6 year olds. A regular theme course should practice one sentence pattern deeply before adding another.

Example sentence goals:

```ts
objectives: {
  sentences: ['This is a ___.', 'I like ___.'],
}
```

## 2. Three-Phase Content

Three phases are about learning flow, not three unrelated activities.

- `introduction`: introduce the lesson through `sceneCaption` + `narrationHint`; `<IntroFrame>` renders Mochi and a locked PictureCard chip grid. Do not require the child to speak.
- `interactive`: first practice the target word, then naturally expand into one core short sentence.
- `reinforcement`: check word comprehension with `pick-word`, and check spoken production with short-sentence `repeat-after-me`.

`repeat-after-me.targetText` should be a real child-sayable phrase or sentence, for example `This is an apple.` or `I like milk.`. Avoid using only command wrappers such as `Say apple.` for regular theme courses.

## 3. Assets

Codex may use ImageGen for course artwork, but generated images are assets, not the course structure.

- Generate one clean single-subject image per word card, saved under `public/images/<theme>/<cardId>.png`.
- Do not burn English or Chinese text into generated images.
- Keep single-card art centered, simple, child-friendly, and visually consistent.
- The introduction phase does not require a scene asset. It uses course text plus card metadata; word-card PNGs are enough.
- Do not add hotspot-only scene contracts to new courses unless a future task reintroduces structured scene interaction.

## 4. Required Files

For each new three-phase course:

- `src/data/courses/<courseId>.ts`: one exported `Course` object with `cards`, `objectives.sentences`, `teachingHints`, and `phases`.
- `public/images/<theme>/<cardId>.png`: one generated or curated single-card image per word card.
- Registration in `allCourses` exported from `src/data/courses/index.ts`.
- `src/data/courses/<courseId>.test.ts`: course-specific integrity checks.

## 5. Quiz Rules

Minimum reinforcement set for a regular 6-card course:

- 3 `pick-word` quizzes for comprehension.
- 2 `repeat-after-me` quizzes for short sentence production.
- Every quiz must reference existing card ids.
- `pick-word.distractorCardIds` must contain 2-3 valid cards and must not include `correctCardId`.
- `repeat-after-me.targetText` should include a target word inside a short sentence from `objectives.sentences`.

## 6. Verification

Before a course is considered ready:

- `pnpm exec tsc --noEmit`
- `pnpm test src/data/courses`
- Course-specific tests confirm card ids are unique, quiz references are valid, PNG card images exist, and the introduction phase has usable `sceneCaption` / `narrationHint` content.
- `/api/courses` returns the new course.
- `/lesson/<courseId>` can enter `introduction` and render `<IntroFrame>` with Mochi plus the locked card chip grid.

Full lesson-flow smoke testing belongs to the implementation plan for the relevant runtime change.

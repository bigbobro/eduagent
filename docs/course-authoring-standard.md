# Course Authoring Standard

> Stable entrypoint for Codex-generated courses. This document defines how a new lesson is produced after the three-phase lesson structure lands.

## 1. Course Shape

Every regular theme course should teach **12 words plus 4 short sentences**, not a word-picture catalog.

- Use exactly 12 `word` cards for concrete, visual targets.
- Add exactly 4 `sentence` cards for the short-sentence practice visuals.
- Define exactly 4 real short sentences in `objectives.sentences`.
- Each short sentence must use one of the 12 target words. Choose 4 different target words unless there is a product reason not to.
- Each `sentence` card's `english` must exactly match one entry in `objectives.sentences`.
- Keep the sentence load light for 3-6 year olds. Sentences should be short, real things a child can repeat.

Example sentence goals:

```ts
objectives: {
  sentences: ['This is an apple.', 'I like milk.', 'I want water.', 'I eat rice.'],
}
```

## 2. Three-Phase Content

Three phases are about learning flow, not three unrelated activities.

- `introduction`: introduce the lesson through `sceneCaption` + `narrationHint`; `<IntroFrame>` renders Mochi and a locked PictureCard chip grid. Do not require the child to speak.
- `interactive`: first practice the target word, then naturally expand into one core short sentence. Runtime progress still counts word cards only.
- `reinforcement`: check word comprehension with `pick-word`, and check spoken production with four short-sentence `repeat-after-me` targets.

`repeat-after-me.targetText` should be a real child-sayable phrase or sentence, for example `This is an apple.` or `I like milk.`. `repeat-after-me.cardId` must reference the matching `kind: 'sentence'` card. Avoid using only command wrappers such as `Say apple.` for regular theme courses.

## 3. Assets

Codex may use ImageGen for course artwork, but generated images are assets, not the course structure.

- Generate one clean single-subject image per word card with Codex built-in `image_gen`, saved under `public/images/<courseId>/<wordCardId>.png`.
- Do not generate sentence-scene images. A sentence card's `imageUrl` must reuse the image for the target teaching word used in that sentence.
- Do not burn English or Chinese text into generated images.
- Keep single-card art centered, simple, child-friendly, and visually consistent.
- The introduction phase does not require a scene asset. It uses course text plus card metadata; word-card PNGs are enough.
- Do not add hotspot-only scene contracts to new courses unless a future task reintroduces structured scene interaction.
- Use `pnpm course:image-jobs -- --course <courseId>` to turn word-card course data into a JSONL prompt queue for Codex built-in `image_gen`.
- Use `pnpm course:image-audit` to list missing PNGs, tiny placeholder-sized PNGs, and unreferenced course PNGs.
- Generate each queued prompt through Codex built-in `image_gen`; after moving the selected output into `public/images/<courseId>/`, delete the corresponding `.codex/generated_images/...` scratch source so local generated-image storage does not accumulate.
- Do not add an API key, CLI batch, sub-agent, or fallback generation path for course assets.

## 4. Required Files

For each new three-phase course:

- `src/data/courses/<courseId>.ts`: one exported `Course` object with `cards`, `objectives.sentences`, `teachingHints`, and `phases`.
- `public/images/<courseId>/<wordCardId>.png`: one ImageGen-produced single-card image per word card. Sentence cards reuse target word-card images and do not add separate files.
- Registration in `allCourses` exported from `src/data/courses/index.ts`.
- `src/data/courses/<courseId>.test.ts`: course-specific integrity checks.

Courses are not pages. New courses must use the existing `/lesson/[id]` dynamic route and the shared lesson UI.

## 5. Quiz Rules

Minimum reinforcement set for a regular 12-card course:

- 4 `pick-word` quizzes for comprehension.
- 4 `repeat-after-me` quizzes for short sentence production.
- Every quiz must reference existing card ids.
- `pick-word.correctCardId` and `pick-word.distractorCardIds` must reference `word` cards; distractors must contain 2-3 valid cards and must not include `correctCardId`.
- `repeat-after-me.cardId` must reference a `sentence` card, and `targetText` must equal that card's `english` value and one of the 4 sentences from `objectives.sentences`.

## 6. Verification

Before a course is considered ready:

- `pnpm exec tsc --noEmit`
- `pnpm test src/data/courses`
- `pnpm course:image-audit` reports zero missing, tiny, and unreferenced PNGs.
- Course tests confirm each course has 12 word cards, 4 sentence cards, 4 target sentences, card ids are unique, target sentences use course words, sentence cards reuse the matching target word image, quiz references are valid, PNG card images exist, and the introduction phase has usable `sceneCaption` / `narrationHint` content.
- `/api/courses` returns the new course.
- `/lesson/<courseId>` can enter `introduction` and render `<IntroFrame>` with Mochi plus the locked card chip grid.

Full lesson-flow smoke testing belongs to the implementation plan for the relevant runtime change.

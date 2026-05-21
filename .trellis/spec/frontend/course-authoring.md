# Course Authoring

Use this spec when the task is only to add, expand, or regenerate lesson
courses. Courses are app data, not pages.

## Scope / Trigger

- Trigger: adding a new visible course, changing course card content, or
  regenerating course card artwork for the CC magic-academy UI.
- Route contract: do not add per-course pages. Every course enters the same
  dynamic route, `/lesson/[id]`, through the shared registry.
- Registry contract: add the exported `Course` object to `allCourses` in
  `src/data/courses/index.ts`. `/api/courses`, home, journal, stats, and
  lesson pages all consume this registry.

## Signatures

- Course file: `src/data/courses/<courseId>.ts`
- Export: `export const <courseId>Course: Course = { ... }`
- Word-card image path: `/images/<courseId>/<wordCardId>.png`
- Source word-card asset path in repo: `public/images/<courseId>/<wordCardId>.png`
- Sentence-card `imageUrl`: reuse the image URL of the target word used in
  that sentence. Do not create `sentence-*.png` assets.
- Registry: `export const allCourses: Course[] = [...]`

## Course Contract

Each regular 3-6 year old theme course must define:

- `id`: lowercase stable slug, matching the image folder.
- `title`: Chinese theme name plus English theme name, such as `颜色 Colors`.
- `description`: short Chinese description.
- `targetAge: [3, 6]`.
- `tone`: one of `peach`, `butter`, `mint`, `sky`, `lilac`.
- `cards`: exactly 16 cards for a regular theme course: 12 concrete `word`
  cards plus 4 `sentence` practice cards.
- `drillParts`: non-empty syllable or chunk list for every card.
- `objectives.sentences`: exactly 4 real child-sayable short sentences, not
  abstract templates. Each sentence must use one target word from the course's
  12 word cards.
- `teachingHints`: opening, review/new ids, quiz prompts, closing.
- `phases.introduction`: `sceneCaption` and `narrationHint`.
- `phases.interactive`: keep `{}` unless the lesson runtime contract changes.
- `phases.reinforcement.quizzes`: at least 4 `pick-word` and 4
  `repeat-after-me` items. The 4 `repeat-after-me.targetText` values should
  correspond to the 4 short sentences in `objectives.sentences`, and each
  `repeat-after-me.cardId` must reference the matching `sentence` card.

## ImageGen Asset Contract

Course artwork is part of the product capability. Do not replace it with local
Pillow/canvas/SVG placeholder drawing when producing real course resources.

- Generate word-card art with Codex built-in `image_gen`.
- Use one clean single-subject image per word card and save the final selected
  image to `public/images/<courseId>/<wordCardId>.png`.
- Do not generate separate sentence-card scene images. Each sentence card must
  reuse the image URL of the target word used in the sentence.
- Do not burn English or Chinese text into the image.
- Use the CC visual direction: soft watercolor storybook illustration,
  warm off-white paper background, centered subject, child-friendly, no
  photorealism, no 3D gloss, no neon.
- `image_gen` is the production path for course resources in Codex. Do not add
  an API/CLI fallback path.
- After the project asset has been saved, remove the corresponding source file
  under `.codex/generated_images/...` so generated scratch space does not grow
  indefinitely.
- Use `pnpm course:image-jobs -- --course <courseId>` to create the JSONL prompt
  queue for word-card assets. The script only prepares prompts and target paths;
  the actual generation still happens through Codex built-in `image_gen`.
  Add `--missing-only` only for incremental repair.
- Use `pnpm course:image-audit` before final verification. It must report no
  missing, tiny, or unreferenced course PNGs.

Prompt baseline:

```text
Use case: illustration-story
Asset type: EduAgent course card PNG for a 3-6 year old English lesson
Primary request: Generate one clean single-subject illustration for the word "<word>".
Subject: <plain subject description>, centered and easy for a young child to recognize.
Style: soft watercolor storybook illustration, hand-painted paper texture, gentle irregular ink outline, CC magic-academy picture book.
Composition: one subject only, centered, about 70% of the frame, generous padding, square image.
Background: warm off-white paper background (#FBF5E6), subtle paper grain.
Avoid: no English text, no Chinese text, no letters, no watermark, no realistic photography, no 3D render, no neon, no glossy plastic.
```

## Validation & Error Matrix

| Condition | Required response |
|-----------|-------------------|
| New course is not in `allCourses` | Add registry entry before completion |
| Course needs its own page | Reject the page split; use `/lesson/[id]` |
| Word card references missing image | Generate/save PNG under `public/images/<courseId>/` |
| Sentence card references `sentence-*.png` | Change it to the matching target word-card image URL |
| Local placeholder art was created | Replace with ImageGen asset before commit |
| Generated source remains after project save | Delete the scratch source file |
| Quiz references unknown card id | Fix data; do not hide with type assertions |
| Home only shows a subset of courses | Update home UI/tests so registry courses are visible |

## Tests Required

- `src/data/courses/course-data.test.ts`: every registered course has valid
  card ids, non-empty `drillParts`, PNG images, phase text, and valid quizzes.
- Generic registry tests must assert each regular course has exactly 12 word
  cards, exactly 4 sentence cards, exactly 4 target sentences, and every target
  sentence contains at least one word from the course cards. Sentence cards must
  reuse that target word card's image URL.
- Course-specific tests are optional for a large batch when the generic registry
  test covers the invariant; add targeted tests for unusual lesson structures.
- `tests/api/courses.test.ts`: `/api/courses` returns the visible registry in
  the intended order.
- Home/UI tests should prove all registry courses are reachable when the course
  catalog grows.
- Run `pnpm test src/data/courses tests/api/courses.test.ts` for course-only
  work, then `pnpm exec tsc --noEmit`; run smoke if route visibility changes.

## Wrong vs Correct

Wrong:

```ts
// Adds a separate page or unregistered data file.
src/app/lesson/food/page.tsx
src/data/courses/colors.ts // not imported by allCourses
```

Correct:

```ts
// src/data/courses/index.ts
import { colorsCourse } from './colors';
import { foodCourse } from './food';

export const allCourses: Course[] = [foodCourse, colorsCourse];
```

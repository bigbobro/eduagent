# Course Authoring

Use this spec during planning and implementation whenever the task is to add,
expand, generate, or regenerate lesson courses, course materials, word cards,
sentence cards, or course artwork. Courses are app data, not pages.

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
- `asrAliases`: optional explicit ASR hit aliases. Use only when a real ASR
  transcript can reasonably represent the English target, for example
  `pie` -> `派`. Do not populate it from every Chinese translation; saying
  `蛋糕` should not automatically clear `cake`.
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
- Optimize/downscale the final checked-in PNG before commit. Course PNGs must
  be at or below 512px on each side and 800000 bytes per file.
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
  missing, tiny, oversized, over-dimensioned, invalid, or unreferenced course
  PNGs.

### Batch ImageGen Workflow

Large course-image jobs must be planned as a filesystem workflow, not as one
long Codex chat that continuously carries generated image results.

- Before generating more than 30 images, create or inspect the
  `pnpm course:image-jobs` JSONL manifest and confirm the exact target paths.
- Work in batches of 10-20 word-card images. Save each accepted image directly
  to `public/images/<courseId>/<wordCardId>.png`, then run the closest
  `pnpm course:image-audit -- --course <courseId>` check before continuing.
- In chat updates, report only course ids, counts, target paths, and audit
  results. Do not paste base64, binary payloads, bulk image data, or large
  previews into the conversation.
- Do not keep one Codex thread as the primary execution surface for 100+ image
  jobs. Finish a course or small batch, checkpoint the filesystem state, and
  resume later from `git status`, the manifest, and audit results in a fresh
  session if the conversation becomes large.
- Do not regenerate assets that already pass audit unless the user explicitly
  asks for a visual replacement.
- After each batch is saved and audited, delete only the matching scratch files
  under `.codex/generated_images/...`; never delete project assets from
  `public/images/...` as part of cache cleanup.

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
| ASR often transcribes the English target as a homophone or transliteration | Add a narrow `asrAliases` entry and a regression test |
| ASR alias is just the Chinese meaning | Do not add it unless it is also the expected ASR form for the English sound |

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

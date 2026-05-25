# Type Safety

The project uses TypeScript interfaces and discriminated unions. There is no
runtime schema library such as Zod.

## Type Organization

- Course contracts live in `src/types/course.ts`: `Course`, `WordCard`,
  `PhaseName`, `Quiz`, and phase structures.
- Agent/tool contracts live in `src/types/tools.ts`: `ToolAction` and
  `AgentResponse`.
- Lesson/session memory contracts live in `src/types/session.ts`:
  `LessonMemory`, `CardProgressState`, `InteractionLog`, and `TokenUsage`.
- Parent/journal aggregate contracts live in `src/types/progress.ts`.
- Component-local props should be defined near the component unless shared by
  multiple files.

## Discriminated Unions

- Use `Quiz['type']` to switch between quiz variants.
- Use `Extract<Quiz, { type: 'pick-word' }>` and
  `Extract<Quiz, { type: 'repeat-after-me' }>` for component props, following
  `QuizPickWord.tsx` and `QuizRepeatAfterMe.tsx`.
- Keep `ToolName` narrow. The current only supported tool is `show_card`; do not
  reintroduce legacy `show`, `focus`, or `annotate` actions.

## Required Course Data

- Every `WordCard` requires `drillParts: string[]`.
- `WordCard.asrAliases?: string[]` is optional and narrow. Use it only for
  explicit ASR hit aliases that should count as the English target, such as
  `pie` -> `派`. Do not mirror every Chinese translation into `asrAliases`.
- Regular visible courses should include exactly 12 word cards, exactly 4
  sentence cards, exactly 4 child-sayable target sentences in
  `objectives.sentences`, `teachingHints`, and `phases`.
- The 4 target sentences are real practice sentences, not blank templates. Each
  one must use a target word from the course's 12 cards.
- `repeat-after-me.cardId` should reference the matching `kind: 'sentence'`
  card. `pick-word` quizzes should only reference `kind: 'word'` cards.
- Current registry exports `allCourses` and `getCourseById` from
  `src/data/courses/index.ts`; new courses must register there and add
  course-specific integrity tests.
- Course content is data, not routing. Do not add per-course pages; the shared
  `/lesson/[id]` route must resolve courses through `allCourses`.
- Word-card assets must be PNG files generated through Codex built-in
  `image_gen` and saved under `public/images/<courseId>/<wordCardId>.png`.
  Sentence cards reuse the image URL of the target word used in the sentence;
  do not create `sentence-*.png` assets. See `course-authoring.md` for the full
  generation and cleanup contract.

## Runtime Validation

Because there is no schema library, runtime validation is explicit:

- API route actions validate required session/course existence and phase values.
- Course tests validate ids, image files, quiz references, and introduction text.
- ASR/TTS proxy message parsing uses guarded JSON parsing and ignores malformed
  non-critical frames.

## Common Patterns

- Use `Record<Union, Value>` for complete maps such as Cat mood mappings,
  PictureCard state mappings, and Tailwind class maps.
- Use explicit return types for exported helpers and public controller methods.
- Use type-only imports (`import type`) for contracts used only at compile time.

## Forbidden Patterns

- Do not make `drillParts` optional.
- Avoid broad `any` in new code. Existing `any` is mostly at untyped transport
  boundaries (`MessageEvent`, parsed JSON, test mocks); narrow immediately after
  parsing when adding new behavior.
- Do not rely on type assertions to hide invalid course data. Add tests that
  prove the data shape instead.

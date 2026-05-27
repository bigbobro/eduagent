# Prompt Slimming v1 Measurement

Representative fixture:

```ts
buildPromptInput(foodCourse, createMemory(), 'interactive', [
  { role: 'user', content: 'Apple.' },
], 2693)
```

## Before

- totalChars: 5065
- systemChars: 5059
- static_rules: 2481 chars
- course_definition: 1260 chars
- phase_rules: 410 chars
- lesson_state: 732 chars
- summary_constraints: 153 chars
- prompt_separators: 23 chars
- history: 6 chars

## After

- totalChars: 3527
- systemChars: 3521
- static_rules: 1206 chars
- course_definition: 997 chars
- phase_rules: 410 chars
- lesson_state: 732 chars
- summary_constraints: 153 chars
- prompt_separators: 23 chars
- history: 6 chars

## Result

- Total fixture reduction: 30.4%
- static_rules reduction: 51.4%
- course_definition reduction: 20.9%

The course_definition pass is intentionally small: card ids, English/Chinese labels,
drillParts, asrAliases, new-card order, and sentence mapping remain in prompt input.

## Post-Change Smoke / Eval

Command:

```bash
VOICE_MOCK=true MIMO_BASE_URL=http://mock.local MIMO_API_KEY=mock pnpm smoke:lesson
pnpm exec tsx scripts/lesson-report-data.ts 538f2711-afad-4318-9bc8-236ba9fb73d7
```

Result:

- Smoke report: `docs/lesson-reports/smoke-2026-05-27T16-37-29-753Z.md`
- Smoke status: 11/11 lesson steps passed; 2/2 UI push-to-talk checks passed
- Eval `speech_card_alignment`: not emitted; mismatch count 0
- Eval `premature_closing`: not emitted; premature closing count 0
- Eval `token_data_integrity`: not emitted; `tokensCorrupted=false`
- Eval prompt breakdown: 12 tracked turns; avgTotalChars 3860; largest bucket
  `static_rules` at 31.34% estimated token share

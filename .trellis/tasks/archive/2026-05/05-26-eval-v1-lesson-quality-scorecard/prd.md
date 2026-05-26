# Eval v1 lesson quality scorecard

## Goal

Add a deterministic Eval v1 scorecard to the existing lesson report data
pipeline so recent lesson sessions can be compared by measurable session
health, cost/context, teaching-loop outcomes, agent behavior risks, and
next-iteration signals. This turns the current hand-written lesson-report
diagnostics into structured data without introducing LLM-as-judge scoring.

## What I already know

- The active user goal asks for Eval v1 on `eduagent`, with verification through
  targeted report-data tests, full tests, TypeScript, `git diff --check`, and a
  fresh lesson smoke/report run.
- `scripts/lesson-report-data.ts` already exposes `ReportData` with session,
  token, anomaly, interaction, and `tokens.llm.promptInputBreakdown` fields.
- Durable per-session teaching outcome data exists in `word_performance`
  (`attempts`, `correct`, `needs_review`) and can be joined by `lesson_id`.
- Existing reports manually evaluate coverage, stuck loops, card/speech
  mismatch, token cost, and iteration candidates.
- Scope should stay in the reporting/data layer first. Do not change lesson
  Agent behavior unless a tiny data exposure is strictly needed.

## Assumptions

- Eval v1 should be deterministic JSON emitted by `buildReport()`, not a prose
  judgement or LLM-generated score.
- `word_performance.correct >= 2` is the closest existing data signal for a
  word being cleared in this session, matching the current R-C two-hit rule.
- Residual speech/show_card mismatch can be estimated from final persisted
  `ai_response` and normalized persisted `actions`.
- Stuck-loop detection should use consecutive turns where the last word
  `show_card` stays on the same card, with a conservative threshold of 3 turns.

## Requirements

- Add a top-level `eval` object to `ReportData`.
- `eval.sessionHealth` quantifies whether the session ended, duration,
  interaction count consistency, provider usage tracking, token integrity, and
  LLM request/interactions ratio.
- `eval.costContext` includes LLM token totals/averages and prompt input
  breakdown coverage/largest bucket data.
- `eval.teachingLoop` quantifies target words, attempted words, cleared words,
  needs-review words, coverage rate, clear rate, attempts per cleared word, and
  stuck-card runs.
- `eval.agentBehavior` quantifies residual speech/show_card mismatch,
  premature closing phrases before all words are cleared, empty AI responses,
  empty-action turns, and repeated assistant speech.
- `eval.nextIterationSignals` emits deterministic signal keys and reasons for
  likely next work, such as `prompt_input_slimming`, `teaching_loop_stuck`,
  `coverage_gap`, `speech_card_alignment`, `provider_tracking`, or
  `token_data_integrity`.
- Historical sessions without `word_performance` or `inputBreakdown` remain
  readable and default to zero/empty Eval metrics rather than throwing.

## Acceptance Criteria

- [ ] `pnpm test scripts/lesson-report-data.test.ts` passes and covers Eval v1
  normal, missing-data, and signal-trigger cases.
- [ ] `pnpm test` passes.
- [ ] `pnpm exec tsc --noEmit` passes.
- [ ] `git diff --check` passes.
- [ ] `pnpm smoke:lesson` passes.
- [ ] A fresh `pnpm tsx scripts/lesson-report-data.ts <smoke-session-id>` run
  emits `eval.sessionHealth`, `eval.costContext`, `eval.teachingLoop`,
  `eval.agentBehavior`, and `eval.nextIterationSignals`.

## Definition of Done

- Report data changes are implemented with focused unit tests.
- `docs/architecture.md` documents Eval v1 as part of the lesson-report data
  layer.
- Trellis spec is updated if the report-data contract changes.
- Changes are committed, the Trellis task is archived, and the active goal is
  marked complete only after all evidence is current and inspected.

## Out of Scope

- LLM-as-judge scoring.
- New classroom Agent behavior, prompt behavior, ASR behavior, TTS behavior, or
  UI behavior.
- New database migrations or persistent score storage.
- A public dashboard or frontend visualization.

## Technical Notes

- Data flow: SQLite `lesson_logs` + `interaction_logs` + `word_performance`
  -> `scripts/lesson-report-data.ts` -> JSON stdout -> lesson-report markdown.
- Existing docs: `docs/architecture.md` section 10 describes the report data
  layer and should be updated.
- Existing specs: `.trellis/spec/backend/database-guidelines.md`,
  `.trellis/spec/backend/quality-guidelines.md`, and
  `.trellis/spec/backend/agent-layer.md` cover the persistence/report boundary.

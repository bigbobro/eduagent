# brainstorm: Prompt input quantification

## Goal

Quantify per-round LLM input composition in the lesson loop so the next optimization decision is based on data, not intuition. This MVP should explain where input tokens are going before any prompt slimming or behavior changes are attempted.

## What I already know

* The user agrees Prompt input slimming is the next strategic area after real lesson testing passed.
* The MVP is not slimming yet. The MVP is measurement: collect enough data to decide the next move.
* Recent real reports repeatedly show high LLM input:
  * `docs/lesson-reports/2026-05-23-6c423b9e.md`: avg input around 2300 tokens.
  * `docs/lesson-reports/2026-05-23-d26e730b.md`: avg input 2774 tokens.
  * `docs/lesson-reports/2026-05-25-ef13ca3c.md`: avg input 2935 tokens, total input 140862 over 48 requests.
* The latest real test reportedly passed, so this task should not re-open ASR, iPad/touch, speech/show_card, or `ice cream` matching as primary scope.
* `docs/TODO.md` already frames this as the next item once real regression is stable: quantify `buildSystemPrompt`, course definition, and history window before deciding what to slim.
* Existing working tree has unrelated dirty docs/spec changes before this task: `docs/TODO.md` and `.trellis/spec/frontend/course-authoring.md`.

## Assumptions

* Product priority is decision-quality first: understand cost/latency drivers before editing prompt behavior.
* A later slimming task may target avg input below 1500, but this task should not claim that reduction as its own success criterion.
* Prompt compression should be measurable before and after; this task creates the "before" baseline and breakdown.

## Requirements

* Add instrumentation and/or report support that breaks down LLM input into meaningful buckets, at minimum:
  * role/static rules
  * phase rules
  * course definition: word cards, sentence cards, objectives, teaching hints
  * current lesson state / target control
  * summary/closing constraints
  * LLM message history
* Persist or expose the breakdown in a way that can be read after a real lesson without re-running the session.
* Produce a baseline from at least one representative 12-word course/session so the next task can decide which bucket to slim first.
* Do not reduce repeated prompt payload in this MVP unless the change is strictly required to measure it.
* Preserve the behavior contracts currently protected by guards:
  * 2 raw-ASR target hits before word-card progression.
  * speech matches the card actually emitted after normalization.
  * closing/summary text cannot enumerate unlearned words.
  * explicit `asrAliases` still appear where the LLM needs them for assessment language.
* Keep the scope surgical. Do not rewrite the agent architecture, switch to pre-rendered Hybrid TTS, or add cross-session memory in this task.

## Acceptance Criteria

* [x] A baseline measurement exists for current prompt/message sizes before any compression work.
* [x] Per-turn LLM input is broken down by source bucket in logs, DB model_calls, lesson-report data, or an equivalent durable artifact.
* [x] A representative lesson report or generated analysis can answer: "which bucket is the largest input contributor?"
* [x] The output supports a concrete next-step recommendation: slim system rules, course definition, state context, history, or defer slimming.
* [x] Existing speech/show_card and R-C progression tests remain green.
* [x] Tests cover the measurement path so prompt breakdown data stays aligned with the actual LLM request.
* [x] `pnpm test` and `pnpm exec tsc --noEmit` pass.

## Definition of Done

* Tests added/updated for prompt/message measurement and report/instrumentation.
* Lesson-report or debug output can explain whether high input came from system prompt, course data, state, or history.
* PRD or TODO records the data-backed recommendation for the follow-up slimming task.
* Docs/TODO or architecture notes are updated only if the runtime contract changes.
* No unrelated dirty files are included in the work commit.

## Out of Scope

* Actual prompt slimming or avg-input reduction targets.
* Hybrid pre-rendered speech/TTS architecture.
* Idle/proactive autonomy.
* Long-term memory or dynamic course selection.
* ASR provider changes or pronunciation scoring vendors.
* Course content expansion.

## Technical Notes

* `src/lib/agent/session.ts` builds the per-turn LLM call with `buildSystemPrompt(session.course, session.memory, session.currentPhase)` plus `getMessagesForLLM(session.memory)`.
* `src/lib/agent/prompt.ts` currently includes full role rules, phase rules, full course info, full target word/sentence card lists, teaching hints, state, target control, word performance, and summary constraints in every system prompt.
* `src/lib/agent/memory.ts` keeps and sends the latest 12 messages via `MAX_HISTORY = 12` and `getMessagesForLLM`.
* `scripts/lesson-report-data.ts` computes avg/max LLM input from `interaction_logs.model_calls.llm.inputTokens`, but it does not yet break input down by source.
* A quick local character baseline for `treats` interactive with 12 history messages showed about 5393 system prompt chars and 158 message chars in the toy fixture; real token usage is higher because model tokenization and real messages are larger, but it confirms the system prompt is the dominant static payload.

## Baseline Measurement

Generated after adding the measurement helper, using `treats` interactive phase with 12 message-history entries and no prompt compression:

| bucket | chars |
|---|---:|
| role/static rules | 2481 |
| course definition | 1418 |
| lesson state / target control | 908 |
| phase rules | 410 |
| LLM message history | 158 |
| summary / closing constraints | 153 |
| prompt separators | 23 |

Total: 5551 chars = 5393 system chars + 158 history chars.

Initial recommendation for the follow-up slimming task: wait for one real lesson with persisted `inputBreakdown`, then compare estimated token shares. If the real data follows this baseline, slim static rules first, then course definition. History is not the first target unless real user/teacher messages are much longer than this fixture.

Smoke-generated real session check (`4641bfd8-5bb0-4570-9451-19cd3bad030d`) after implementation:

* tracked LLM turns: 12
* largest bucket: `static_rules`
* top average buckets: `static_rules` 2481 chars / 1240 estimated tokens, `course_definition` 1252 chars / 626 estimated tokens, `lesson_state` 887 chars / 443 estimated tokens

## Verification

* `pnpm test src/lib/agent/prompt.test.ts scripts/lesson-report-data.test.ts`
* `pnpm test src/lib/agent/session-prompt-input.test.ts`
* `pnpm exec tsc --noEmit`
* `pnpm test`
* `git diff --check`
* `pnpm smoke:lesson`

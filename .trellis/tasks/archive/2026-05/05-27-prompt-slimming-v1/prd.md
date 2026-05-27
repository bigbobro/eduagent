# Prompt Slimming v1

## Goal

Reduce per-round LLM prompt input in the lesson loop while preserving the current Agent behavior contracts. This is the first real slimming iteration after prompt input quantification and Eval v1: it should prove we can lower context cost without regressing card progression, speech/card alignment, closing safety, or reinforcement flow.

## What I Already Know

- Prompt input quantification is already implemented and archived under `05-26-prompt-input-slimming`.
- Eval v1 now reports `costContext`, `teachingLoop`, `agentBehavior`, and `nextIterationSignals`.
- Recent measured sessions repeatedly show high LLM input:
  - Real sessions have been around 2600-2900 average input tokens per LLM turn.
  - The latest visible smoke/current-code report showed `avgInputPerRound = 2693`.
  - The largest prompt bucket is `static_rules` at about 46% estimated token share.
  - The second largest bucket is `course_definition` at about 23% estimated token share.
- History is currently a smaller bucket, so it is not the first slimming target.
- The user does not currently have time for a fresh real lesson test, so this task must be verifiable with deterministic tests, prompt measurement, and smoke runs first.

## Assumptions

- v1 should be a controlled context-cost iteration, not a broad teaching-strategy redesign.
- We should target the biggest prompt bucket first: `static_rules`. `course_definition` is a fallback only if the 30% target cannot be reached safely.
- A good v1 target is to reduce average LLM input by at least 30% on comparable smoke/fixture baselines. `avgInputPerRound < 1800` is a reference target, not a hard universal threshold, because tokenization and course/session shape can vary.
- If a prompt rule is already enforced by code guards, the prompt can reference the contract more tersely, but the guard/test remains the authority.

## Decisions

- Success target confirmed by user: v1 should use **at least 30% reduction on a comparable baseline** as the main target. `avgInputPerRound < 1800` remains a reference target where the course/session shape is comparable, not a rigid universal threshold.
- Scope confirmed by user: v1 should slim `static_rules` first. Only make a small, test-backed `course_definition` pass if `static_rules` alone cannot reach the 30% reduction target safely.
- Static-rule safety boundary confirmed by user:
  - Can compress: output JSON schema, `show_card` tool wording, long R-C progression explanation, and duplicate closing-prohibition language.
  - Must keep explicit: ASR tolerance, current-target/no-jump behavior, close/wrong slow-read scaffold, and the core rule that the teacher must not summarize unlearned words.
- PRD locked for implementation after user accepted the safety-boundary recommendation.

## Expected Impact

- Lower per-round input tokens, which should reduce cost and may reduce latency.
- Better room for future context such as richer course data, learner summaries, or Eval-derived feedback.
- Less instruction clutter, making current target, card progression, and output contract easier for the model to follow.
- Risk: over-compression can remove a rule that the LLM still needs to reason correctly, causing regressions like wrong `attempt_assessment`, missing `show_card`, premature closing, or speech/card mismatch.

## Token Budget Failure Modes

- Soft pressure: input still fits the model context, but important rules are buried in a long prompt. This can increase behavioral drift even without a hard error.
- Context crowding: static rules and full course data leave less practical room for live lesson state, history, future learner memory, and output budget.
- Hard failure: if the request exceeds provider/model context limits, the LLM call may fail or require truncation. The current safe direction is to reduce deterministic repeated prompt payload before adding more context.
- Product effect: if budget is not controlled, each new feature competes for the same prompt space, making the Agent slower, more expensive, and harder to evolve safely.

## Requirements

- Audit current `buildSystemPrompt` / `buildPromptInput` buckets and identify rules that are duplicated, stale, or already enforced in code.
- Slim `static_rules` without weakening these behavior contracts:
  - two raw-ASR target hits before word-card progression
  - `show_card` remains server-normalized and current-card authoritative
  - teacher speech must align with the emitted card
  - closing/summary must not enumerate unlearned words
  - `state_update` remains minimal and compatible with current tests
- Only slim `course_definition` if the `static_rules` pass does not reach the 30% target safely. If used, keep the pass narrow:
  - preserve current card, next target, aliases, `drillParts`, and sentence mapping needed for assessment
  - avoid sending irrelevant course detail every turn if it is not needed for current phase/target control
- Keep prompt input breakdown intact so before/after comparison is visible in reports.
- Add or update tests that lock the behavior-critical prompt contracts and expected bucket reduction.
- Run lesson smoke after implementation to check speech/card and phase-state regressions.

## Acceptance Criteria

- [ ] A before/after measurement shows at least 30% reduction on a representative smoke/fixture path, with `avgInputPerRound < 1800` treated as a reference success target where comparable.
- [ ] `static_rules` estimated token share is materially lower than the current ~46% baseline.
- [ ] `course_definition` is reduced or explicitly justified as unchanged for v1.
- [ ] Existing prompt contract tests remain green or are updated to assert the slimmer contract.
- [ ] Eval v1 on the post-change smoke session does not introduce `speech_card_alignment`, `premature_closing`, or `token_data_integrity` signals.
- [ ] `pnpm test src/lib/agent/prompt.test.ts src/lib/agent/prompt-phase.test.ts src/lib/agent/session-prompt-input.test.ts scripts/lesson-report-data.test.ts` passes.
- [ ] `pnpm test`, `pnpm exec tsc --noEmit`, `git diff --check`, and `pnpm smoke:lesson` pass.
- [ ] `docs/architecture.md` is updated if prompt architecture or Eval decision flow changes.

## Definition of Done

- Prompt slimming is implemented surgically in the prompt/reporting layer.
- Measurement evidence is recorded in the task or docs with before/after bucket data.
- No unrelated classroom behavior, UI, ASR/TTS provider, or course content changes are included.
- Trellis task is archived and journaled after a clean commit.

## Out of Scope

- New teaching-loop strategy.
- New Eval schema.
- New UI/dashboard.
- New ASR/TTS provider behavior.
- Long-term memory, cross-session summaries, or session resume.
- Real child/learner outcome evaluation.

## Technical Notes

- Primary files likely involved: `src/lib/agent/prompt.ts`, `src/lib/agent/prompt.test.ts`, `src/lib/agent/prompt-phase.test.ts`, `src/lib/agent/session-prompt-input.test.ts`, and `scripts/lesson-report-data.test.ts`.
- `src/lib/agent/session.ts` calls `buildPromptInput(session.course, session.memory, session.currentPhase, messages)` and persists `inputBreakdown`.
- `src/lib/agent/memory.ts` keeps `MAX_HISTORY = 12`, but history is not the first v1 target based on current bucket shares.
- Existing measurement baseline from `05-26-prompt-input-slimming`:
  - `static_rules`: about 2481 chars / 1240 estimated tokens per turn
  - `course_definition`: about 1252 chars / 626 estimated tokens per turn
  - `lesson_state`: about 887 chars / 443 estimated tokens per turn

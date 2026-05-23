# Journal - bigbobro (Part 1)

> AI development session journal
> Started: 2026-05-20

---



## Session 1: Bootstrap Trellis project guidelines

**Date**: 2026-05-20
**Task**: Bootstrap Trellis project guidelines
**Branch**: `main`

### Summary

Filled repo-backed backend and frontend Trellis specs, verified tests/type-check, and archived bootstrap guidelines task.

### Main Changes

- Filled backend Trellis specs with current API route, SQLite, voice proxy, logging, error handling, and verification conventions.
- Filled frontend Trellis specs with current App Router, component, hook, state, type-safety, accessibility, and testing conventions.
- Marked the bootstrap task checklist complete and archived the task after the work commit.

### Git Commits

| Hash | Message |
|------|---------|
| `a4ce3dc` | (see git log) |

### Testing

- [OK] `python3 ./.trellis/scripts/task.py validate 00-bootstrap-guidelines`
- [OK] `.trellis/spec` placeholder scan
- [OK] `pnpm test` (43 files / 191 tests)
- [OK] `pnpm exec tsc --noEmit`
- [WARN] `pnpm run lint` enters Next.js ESLint setup because this repo has no ESLint config yet

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: Complete CC lesson catalog and assets

**Date**: 2026-05-21
**Task**: Complete CC lesson catalog and assets
**Branch**: `feature/cc-ui-refresh`

### Summary

Completed the CC UI/course iteration with 10 visible courses, 120 project-local ImageGen word assets, sentence cards reusing word images, course-authoring specs, audits, tests, type-check, build, and smoke verification.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c2a2d62` | (see git log) |
| `84793d9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: Fix lesson interactive card flow

**Date**: 2026-05-21
**Task**: Fix lesson interactive card flow
**Branch**: `feature/cc-ui-refresh`

### Summary

Fixed intro-to-interactive handoff, teacher-repeat behavior, sentence-card display, and current-target guards so interactive lessons do not jump back to cleared cards.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `eafcbcd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: Address PR review findings

**Date**: 2026-05-22
**Task**: Address PR review findings
**Branch**: `feature/cc-ui-refresh`

### Summary

Fixed PR review issues: repeat-after-me ASR-only quiz flow, completion restart routing, done-page progress fetch, course image audit limits, optimized PNG assets, docs/spec updates, and verification.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `eeb098d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: Fix PR behavior blockers

**Date**: 2026-05-22
**Task**: Fix PR behavior blockers
**Branch**: `feature/cc-ui-refresh`

### Summary

Fixed the three PR behavior blockers: Journal now opens practiced courses and uses activity-based empty state; lesson done page now restarts locally and reports cleared progress. Verified test, type-check, build, smoke, and diff-check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c94c33d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 6: Docs consolidation after Trellis migration

**Date**: 2026-05-22
**Task**: Docs consolidation after Trellis migration
**Branch**: `main`

### Summary

把 docs/course-authoring-standard.md 收敛到 .trellis/spec/frontend/course-authoring.md(5 处 active 引用迁移),并删除已落地 epic 的 docs/handoff/。docs/superpowers/ 历史快照保持不动。pnpm test 181/181 + tsc 通过。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `58042a1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: Refresh docs/TODO.md after CC UI + 10-course rollout

**Date**: 2026-05-22
**Task**: Refresh docs/TODO.md after CC UI + 10-course rollout
**Branch**: `main`

### Summary

对齐 TODO.md 到 CC 重构 + 10 课现状:删 6 项已完成/退役条目,刷新 Hybrid 触发条件,顶部加'实测驱动'说明,行数 144→71。同时讨论了 docs/TODO.md(战略 backlog)与 .trellis/tasks/(战术执行单元)的边界:并存,角色不同;TODO 决定方向,task 承载具体改动 + commit + 归档。下一步等用户跑 1-2 节实测 + /lesson-report 决定老师 Agent 是 prompt 工程能解决还是要上 Hybrid 重构。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4d7d669` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: Teacher Agent UX fixes R1-R4 (05-22 real-test)

**Date**: 2026-05-22
**Task**: Teacher Agent UX fixes R1-R4 (05-22 real-test)
**Branch**: `main`

### Summary

Fixed 4 P0 UX bugs from 05-22 real lesson (35-round bd78d967 + 8-round 8bb58baa): R1 buffered show_card actions until TTS session-finished so card flips sync with teacher audio; R2 added ASR literal verify in applyAttemptAssessment to downgrade LLM 'correct' when raw ASR token absent; R3 relaxed canShowCard to accept any non-cleared word card enabling LLM non-sequential jumps; R4 closing guard always injects summary constraint in prompt + server-side speech scan replaces hallucinated unlearned words with safe template. 17 new vitest tests (198/198 pass), docs/architecture.md + docs/TODO.md synced, new .trellis/spec/backend/agent-layer.md.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `5a4d120` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 9: R5/R6/R7 Teacher state sync from 2026-05-22 real-test

**Date**: 2026-05-22
**Task**: R5/R6/R7 Teacher state sync from 2026-05-22 real-test
**Branch**: `main`

### Summary

Fixed three state-sync bugs surfaced by 2026-05-22 animals lesson real-test: R5 tightens canShowCard whitelist to {currentCard, nextCard} (was 'any non-cleared'); R6 makes closing guard exempt currentWord so teaching 'cat' doesn't trigger wrap-up; R7 adds server-side hard auto-advance via show_card to nextCard when current card is freshly cleared. Caught and fixed a hidden state-desync bug in R7 (must trigger on assessedMemory.cardProgress, not raw assessment.result, to respect R2 literal-verify downgrade). Inline-fixed #5 TTS reading card_id underscores aloud via sanitizeSpeech with streaming carry buffer. Spec (agent-layer.md) sediments R5/R6/R7 + the cross-cutting 'normalize must use assessedMemory' invariant. Out of scope and deferred: #3 ASR hot_words, #4 systemPrompt token compaction, #6 quiz-phase static TTS guidance.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `bbcd83d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 10: ASR hotwords and quiz TTS guidance

**Date**: 2026-05-23
**Task**: ASR hotwords and quiz TTS guidance
**Branch**: `main`

### Summary

Completed ASR current-card hotwords injection and static reinforcement quiz TTS guidance with tests, docs, and smoke verification.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `9b10d96` | (see git log) |
| `5f83892` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 11: R-A → R-B → R-C teaching state machine + lesson-smoke infra (2026-05-23 real-test)

**Date**: 2026-05-23
**Task**: R-A → R-B → R-C teaching state machine + lesson-smoke infra (2026-05-23 real-test)
**Branch**: `main`

### Summary

Diagnosed and fixed 'card flipped but teacher voice lagging' from 2026-05-23 animals real-test via three iteration cycles, plus built reusable lesson-smoke harness. (1) Added per-turn diagnostic logs to /api/chat + orchestrator (chat action, teacher speech, show_card events). (2) R-A celebration-turn stay: deferred force-advance one turn so kid hears 'good job cat!' on cat card before flip. (3) Dev panel: floating phase-jump buttons in PhasedLessonView (NODE_ENV=development), skip past 12-card requirement during testing. (4) scripts/lesson-smoke.ts: text-driven 10-step animals lesson driver, validates show_card sequence + writes docs/lesson-reports/smoke-*.md, manual trigger via 'pnpm smoke:lesson'. CLAUDE.md §C codifies 'big-change boundary': touching src/lib/agent/**, src/lib/voice/**, or /api/chat/route.ts requires smoke pass before delivery. (5) Smoke caught two real bugs on first run: R-B premature-closing (LLM emitting wrap-up summary + show_card→cat after 2 words) and R2 un-clear (R2 downgrade was wiping cleared state when current_word desynced from assessment.card_id). Fixed both. (6) R-C user-locked spec rewrite: card cleared trigger changed from 'LLM correct + R2 verify (1 hit)' to 'server-authoritative raw-ASR literal hit count >= 2'. LLM no longer decides advancement; server forces show_card → currentCard until count=2, then auto-pushes show_card → nextCard with prompt guiding 'OK 你说对了 → 看下一个动物' transition speech. Deleted R-A/R5/R7 dead helpers (canShowCard, getActiveWordCardId, didClearCurrentCard, getWordCardIdForCard). Tests: 231 → 233 vitest pass (added R-C 2-hit / lock / streak-reset coverage). Smoke: 11/11 pass on R-C final state (was 9/11 after R-B, 8/11 before).

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `598c35a` | (see git log) |
| `739490c` | (see git log) |
| `52e719a` | (see git log) |
| `8456270` | (see git log) |
| `4ad4708` | (see git log) |
| `9bbcc77` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 12: Fix lesson voice regressions

**Date**: 2026-05-23
**Task**: Fix lesson voice regressions
**Branch**: `main`

### Summary

Fixed push-to-talk ASR startup and pointer capture regressions, serialized forced phase transitions, aligned teacher speech with normalized show_card before TTS, and extended lesson smoke coverage for UI hold plus speech/card consistency.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `8869b0f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 13: Update lesson TODO after voice stabilization

**Date**: 2026-05-23
**Task**: Update lesson TODO after voice stabilization
**Branch**: `main`

### Summary

Updated docs/TODO.md to reflect 2026-05-23 voice stabilization work, marked lightweight logging diagnostics complete, refreshed next regression checks, and added token-budget slimming plus lint cleanup backlog notes.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `3f91d18` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

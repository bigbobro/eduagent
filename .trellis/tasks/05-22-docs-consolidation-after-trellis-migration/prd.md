# Docs Consolidation After Trellis Migration

## 背景

trellis 系统进入 .trellis/spec/ 后,与 docs/ 出现两个交集:

1. `docs/course-authoring-standard.md` (82 行) 与 `.trellis/spec/frontend/course-authoring.md` (139 行) 内容重复,新文件已是更详细的 superset。
2. `docs/handoff/2026-05-15-lesson-structure-refactor.md` 是已落地 epic 的 handoff,不再需要 active 引用。

`docs/architecture.md`、`docs/superpowers/{specs,plans}/`、`docs/DOUBAO Protocol/`、`docs/lesson-reports/`、`docs/TODO.md`、`docs/voice-benchmarks.md` 仍是事实源,不动。

## 目标

清掉重复入口,所有"如何写课程"的引用统一指向 `.trellis/spec/frontend/course-authoring.md`;已落地 epic 的 handoff doc 归档。

## 不做

- 不动 `docs/architecture.md`(living doc,仍是事实源,trellis spec 反过来引用它)
- 不动 `docs/superpowers/{specs,plans}/`(历史快照,文件名带日期,本来就是只读历史)
- 不动 `docs/DOUBAO Protocol/`、`docs/lesson-reports/`、`docs/TODO.md`、`docs/voice-benchmarks.md`
- 不动 `docs/superpowers/specs/2026-05-15-...` 和 `docs/superpowers/plans/2026-05-15-...` 内部对 `docs/course-authoring-standard.md` 的引用(它们是历史快照,描述当时的状态)

## 范围

### Step 1:废弃 `docs/course-authoring-standard.md`

**动作**:删除 `docs/course-authoring-standard.md`,把所有 active 引用改指 `.trellis/spec/frontend/course-authoring.md`。

需要改的引用(active,不含历史快照):
- `CLAUDE.md:137` — "添加新课程"操作指南
- `docs/TODO.md:26` — "下游 Codex 产新课"
- `docs/TODO.md:118` — "课程产出 SOP"小节
- `docs/architecture.json:60` — `course_authoring_standard` key
- `docs/architecture.json:485` — `course_authoring` value 内嵌路径
- `.trellis/spec/frontend/directory-structure.md:59` — 课程目录说明

**保持不动**(历史快照):
- `docs/superpowers/specs/2026-05-15-lesson-structure-refactor-design.md`
- `docs/superpowers/plans/2026-05-15-lesson-structure-refactor.md`
- `docs/handoff/2026-05-15-lesson-structure-refactor.md`(本 task 第 2 步会一并处理)
- `.trellis/tasks/archive/**`

### Step 2:归档 `docs/handoff/2026-05-15-lesson-structure-refactor.md`

epic 已落地(TODO 已记录 `2026-05-15` 完成)。该 doc 没有 active 引用(仅 TODO 提了 epic 名,未提路径)。

**动作**:直接删除 `docs/handoff/2026-05-15-lesson-structure-refactor.md`。
**理由**:历史信息已沉淀在 `docs/superpowers/plans/2026-05-15-...` 和 `docs/architecture.md`,handoff doc 本来就是临时交接产物,实施完成即可丢。如保留还会显得 `docs/handoff/` 是 active 目录,误导未来。

如 `docs/handoff/` 删空后空目录,一并删 `docs/handoff/`。

## 验收

- [ ] `docs/course-authoring-standard.md` 不存在
- [ ] `docs/handoff/` 不存在(或不含已落地 epic 的 doc)
- [ ] `grep -rn "docs/course-authoring-standard" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.json"` 仅在 `docs/superpowers/`、`.trellis/tasks/archive/` 里命中(历史快照)
- [ ] `CLAUDE.md`、`docs/TODO.md`、`docs/architecture.json`、`.trellis/spec/frontend/directory-structure.md` 中所有 active 引用指向 `.trellis/spec/frontend/course-authoring.md`
- [ ] `pnpm test` + `pnpm exec tsc --noEmit` 通过(此 task 不改代码,但跑一遍确认 docs/architecture.json 仍是合法 JSON)

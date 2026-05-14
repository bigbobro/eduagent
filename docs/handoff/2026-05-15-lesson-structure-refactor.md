# Handoff — EduAgent / 三阶段课程结构重构 epic

**会话日期**:2026-05-15
**当前状态更新**:本 epic 已实施到 runtime。food 是唯一可见课程;旧 `transportation` / `timeNumbers` course data、旧 public assets 与旧 `LessonView` fallback 已删除。

---

## 当前位置

implementation plan 已执行完。下一步不是重跑 Task 1-21,而是用 food 做真实 smoke / lesson-report 验收,再基于报告决定下一轮课程或工具层 epic。

## 已交付(全部已 commit 到 main)

| Commit | 内容 |
|---|---|
| `f40b605` | 三阶段重构 spec(15 节;§13 后续已修订为课程标准入口摘要) |
| `3e306ae` | 实施 plan(原 20 task,后续已修订为 21 task,末尾加入旧课 cleanup) |
| `d5510da` | `docs/TODO.md` 顶部加 epic 指针,取代旧 P1 §2 |
| `5f71357` | 项目 `CLAUDE.md` "添加新课程"速查路径修正(`src/data/courses/`) |

**关键文档(下个会话必读)**:
- Spec: `docs/superpowers/specs/2026-05-15-lesson-structure-refactor-design.md`
- Plan: `docs/superpowers/plans/2026-05-15-lesson-structure-refactor.md`
- 课程产出标准: `docs/course-authoring-standard.md`
- 项目规则: `CLAUDE.md`(项目根)+ `~/.claude/CLAUDE.md`(全局)

**2026-05-15 修订说明(执行前必看)**:
- food 不再按"单词课 + 字符占位"执行;已改成"6 个 word cards + 2 个核心短句 + ImageGen 单体 PNG + 结构化 scene.svg hotspot"。
- 长期 Codex 课程产出标准已独立到 `docs/course-authoring-standard.md`;spec §13 现在只做入口摘要。
- implementation plan Task 2 / 3 / 4 / 6 / 15 已按短句与 ImageGen 资产流更新。
- 用户已明确决定旧课不迁移、不保留 0 回归;当前 cleanup 已执行,`transportation` / `timeNumbers` 和旧 `LessonView` fallback 已退役。

**2026-05-15 实施完成说明**:
- 新增 `src/data/courses/food.ts` + `src/data/courses/index.ts`;`/api/courses` 当前只暴露 food。
- 新增 `public/images/food/{apple,banana,bread,milk,egg,rice}.png`(ImageGen 母图裁切)与结构化 `public/images/food/scene.svg`。
- 新增 `PhasedLessonController`、phase-aware prompt、`progress_snapshot` SSE、`phase-transition` / `quiz-answer` API。
- 新增 `PhasedLessonView`、`IntroPhase`、`InteractivePhase`、`ReinforcePhase`、`QuizPickWord`、`QuizRepeatAfterMe`。
- 删除旧 `src/data/courses/transportation.ts`、`src/data/courses/timeNumbers.ts`、`src/components/lesson/LessonView.tsx` 以及旧 public course asset directories。
- `Course.phases` 已从 optional 收紧为必填。

**新增项目 memory(用户私有,非 repo)**:
- `~/.claude/projects/-Users-hushaobo-ROOTCLOUD-new-solulu-eduagent/memory/project_three_phase_lesson_structure.md`(MEMORY.md 已加索引)

## 核心设计要点(下个 agent 必须理解)

1. 单节课显式三阶段:**introduction(看懂)→ interactive(开口)→ reinforcement(检查)**
2. **工具是 Agent 的能力,不是孩子的按钮** — 本次只搭舞台,工具层(放大/圈出/慢速/换问法)是后续独立 epic
3. **新标准唯一化**:不再保留旧课 0 回归 promise;food 跑通后清掉旧课和旧 UI fallback
4. phase 切换**规则驱动**,LLM 不输出 phase_transition action
5. food 课程 = 第 1 个三阶段示范课;transportation / timeNumbers **不迁移,最后退役**
6. quiz 类型本次只做 2 种:`pick-word`(听懂)+ `repeat-after-me`(说出来);food 的 repeat-after-me 必须练短句,不是只说单词

## 立即要做的事

### 1. food 真实验收

运行 dev server,打开 `/lesson/food`,用 `VOICE_MOCK=true` 或真实凭据做 smoke。重点看:
- intro 是否能展示 scene 并切到 interactive
- interactive 是否继续复用 ASR/TTS/SSE 管线
- reinforcement 两类 quiz 是否能完成并进入 done
- `/api/courses` 是否只返回 food
- `/lesson/transportation` / `/lesson/timeNumbers` 不再在课程列表出现

### 2. ⚠ 安全行动(用户唯一)

**MiMo API key 已在 MEMORY.md 暴露过 9 天**,本会话已替换为占位 `<your-mimo-api-key>`,但**真实 key 已加载过我以前若干次会话的 context,严格意义上视作 leak**。

用户必须:
1. 到 MiMo 控制台 rotate 旧 key(作废 + 重生成)
2. 新 key 填进 `.env.local`(已 gitignored)
3. **下个 agent 不要碰 rotate 这一步,只能用户自己做**

repo 内已 `grep -rl 'tp-coouo'` 0 命中;memory 目录也已清。

## 下个会话推荐用的 skill

| 场景 | Skill |
|---|---|
| food 真实 smoke / debug | `superpowers:systematic-debugging` |
| 后续写新课 | `docs/course-authoring-standard.md`(不是 skill,先按标准文档执行) |
| 后续做课程产出 skill | `skill-creator` |
| 中途遇 bug | `superpowers:systematic-debugging` |

## 风险 / 易踩坑

- **不要重建旧课 registry**:`src/data/courses/index.ts` 是唯一 registry;不要再从 `transportation.ts` 导出 `allCourses`。
- **不要恢复旧 LessonView fallback**:`LessonController` 仅作为底层音频管线,上层入口是 `PhasedLessonView`。
- **food 视觉资产**:ImageGen PNG 已落在 `public/images/food/`;`scene.svg` 通过 `<g id="card-X"><image .../></g>` 结构化组装。不要回退到字符占位或不可交互大图。

## 不重要但留个梗

会话中有一次 Write 笔误把路径写成 `/Users/hushaobo/the cookies/...`(把 "ROOTCLOUD" 误打成 "the cookies"),已清理。下个会话 Write 工具调用注意工作目录 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent`。

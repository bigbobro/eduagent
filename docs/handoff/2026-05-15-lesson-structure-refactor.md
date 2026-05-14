# Handoff — EduAgent / 三阶段课程结构重构 epic

**会话日期**:2026-05-15
**前置背景**:本会话完成 brainstorm → spec → plan 全套设计文档,**代码未动**。用户在 5% context 限额时主动暂停。

---

## 当前位置

刚走完 `superpowers:brainstorming` → `superpowers:writing-plans`。下一步应该开始执行 plan。

## 已交付(全部已 commit 到 main)

| Commit | 内容 |
|---|---|
| `f40b605` | 三阶段重构 spec(15 节,含 §13 Codex 课程产出 checklist) |
| `3e306ae` | 实施 plan(20 task,每 task 含 TDD 步骤 + 可 paste 代码 + commit 模板) |
| `d5510da` | `docs/TODO.md` 顶部加 epic 指针,取代旧 P1 §2 |
| `5f71357` | 项目 `CLAUDE.md` "添加新课程"速查路径修正(`src/data/courses/`) |

**关键文档(下个会话必读)**:
- Spec: `docs/superpowers/specs/2026-05-15-lesson-structure-refactor-design.md`
- Plan: `docs/superpowers/plans/2026-05-15-lesson-structure-refactor.md`
- 项目规则: `CLAUDE.md`(项目根)+ `~/.claude/CLAUDE.md`(全局)

**新增项目 memory(用户私有,非 repo)**:
- `~/.claude/projects/-Users-hushaobo-ROOTCLOUD-new-solulu-eduagent/memory/project_three_phase_lesson_structure.md`(MEMORY.md 已加索引)

## 核心设计要点(下个 agent 必须理解)

1. 单节课显式三阶段:**introduction(看懂)→ interactive(开口)→ reinforcement(检查)**
2. **工具是 Agent 的能力,不是孩子的按钮** — 本次只搭舞台,工具层(放大/圈出/慢速/换问法)是后续独立 epic
3. **0 回归 promise**:旧 `LessonController` / `LessonView` 一行不改(只 additive 加 `sendCustomAction` / `getSessionId` / `progress` 事件)。验收命令:`/lesson/transportation` 行为与今日完全一致
4. phase 切换**规则驱动**,LLM 不输出 phase_transition action
5. food 课程 = 第 1 个三阶段示范课;transportation / timeNumbers 保持 v2 路径,**不迁移**(下个 epic)
6. quiz 类型本次只做 2 种:`pick-word`(听懂)+ `repeat-after-me`(说出来)

## 立即要做的事

### 1. 选执行模式 + 跑 plan(主线)

向用户问一次,二选一:
- **Subagent-Driven(推荐)** — 每 task 派一个 fresh subagent,主会话 review 推进
- **Inline Execution** — 当前会话顺序跑 task,每 checkpoint 停给用户看

然后从 Plan **Task 1**(扩展 Course 类型加 Phases / Quiz)开始,严格按 TDD 步骤跑。

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
| 选 subagent-driven 模式开始跑 plan | `superpowers:subagent-driven-development`(plan header 已点名) |
| 选 inline 模式开始跑 plan | `superpowers:executing-plans` |
| 跑到任何 task 写测试 / 实现代码 | `superpowers:test-driven-development`(plan 步骤已内置 TDD) |
| 跑完所有 task 后准备 PR | `superpowers:finishing-a-development-branch` + `superpowers:requesting-code-review` |
| 中途遇 bug | `superpowers:systematic-debugging` |

## 风险 / 易踩坑

- **`@testing-library/react` 可能没装**:plan Final notes 已提到。若 component 测试报 not found,`pnpm add -D @testing-library/react jsdom` 然后 vitest 设 `environment: 'jsdom'`
- **`VOICE_MOCK=true` 测试 gating**:部分集成测只在 mock 下跑。若 mock 没接 streamUserInput,先 it.skip 留 followup
- **`allCourses` 注册位置奇特**:在 `src/data/courses/transportation.ts` 底部,不是独立 `index.ts`。plan Task 2 路径已写对
- **food.ts 视觉资产**:plan 用 emoji 占位走通(`<g id="card-X"><text>🍎</text></g>`),视觉精修是后续 epic,不阻塞本次结构验证

## 不重要但留个梗

会话中有一次 Write 笔误把路径写成 `/Users/hushaobo/the cookies/...`(把 "ROOTCLOUD" 误打成 "the cookies"),已清理。下个会话 Write 工具调用注意工作目录 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent`。

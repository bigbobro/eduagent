# codebase-cleanup-and-refactor

## Goal

经过多轮迭代后，EduAgent 代码库累积了一批死代码、过期 mock、被废弃的 LLM 字段、揉成一坨的守卫管线。本任务一次性清扫这 4 类问题（A+B+C+D），让 prompt token 成本下降、guard 演进进入可持续状态。

经过 grill-me 拷打后，原 review 提出的 6 类问题中 **E（PhasedController 边界收口）已砍、F（课程数据 factory）已 park**，理由见下文「砍/park 决策」。

## 范围（最终）

| 子任务 | 范围 | 风险 | ROI 依据 |
|---|---|---|---|
| **1. cleanup-quick-wins** | A 删死代码 + B 修 mock + C 删 prompt 废字段 | 低（机械活） | C 直接服务 TODO.md 第一条 backlog "Prompt / token budget slimming，avg input < 1500" |
| **2. guard-pipeline-refactor** | D session.ts 拆 GuardContext + GuardFn[] pipeline | 中（行为不变，但要 smoke 充分覆盖） | 过去 3 天 5 次 guard 迭代（R1-R7 + R-A/B/C），session.ts 已痛 |

## 砍 / park 决策（不要忘）

### E (PhasedController 边界收口) — 砍

- TODO.md 全文 + 远期 backlog 0 处提到"加新 phase"
- 4 个 child component 调 v2 全是合理的 sendCustomAction 业务消息 + speakStatic 静态语音，**0 处** child 调危险的 phase-transition
- 与 memory feedback `feedback_content_over_architecture_at_single_user.md` 直接冲突（单用户阶段优先内容驱动）
- **未来触发条件**：真要加新 phase（review / parent-mode / conversation）时启动；或真出现 child 绕过 phased 的 bug 时启动

### F (课程数据 factory) — park 到 TODO

- TODO.md 远期 backlog 第 2 条已经有这条："课程产出 Codex skill，等触发场景再启动（用户扩展课程节奏 / 引入第二位作课者）"
- 5-21 批量加 11 课之后 3 天 0 次新课
- **未来触发条件**：用户决定批量加 10+ 门新课 / 引入第二位作课者 / Course schema 要批量加字段（如 audioUrl / videoUrl）

## 执行顺序

1. 子任务 1 (cleanup-quick-wins) **先做**
   - A/B 跟 C/D 独立，但 C 删了 prompt 字段后，D 拆 pipeline 时不用再处理已废弃的字段，逻辑更干净
2. 子任务 2 (guard-pipeline-refactor) **后做**
   - 依赖 1 完成（C 部分必须先落地）
   - 行为不变 refactor，先确认 smoke 跟单测全绿再开始动 guard

## 验收（双子任务通用）

- `pnpm test` 全绿
- `pnpm exec tsc --noEmit` 0 error
- `pnpm smoke:lesson` 通过（动 src/lib/agent/** 必跑，CLAUDE.md 强制规则）
- `docs/architecture.md` 同步更新涉及模块章节（D 必须改 §[guard pipeline]）
- 子任务 1 额外验收：grep 确认 6 个死代码已全删 + mockStreamLLM 输出符合当前 ToolAction 类型
- 子任务 2 额外验收：streamUserInput 函数行数 < 80 行；guard 数组每个 guard 有最小单测（至少 1 case）

## Definition of Done

- 2 个子任务全部完成 + 父任务 task.json subtasks 字段链好
- 文档同步：architecture.md 更新；TODO.md 加"E 触发条件 / F park 触发条件"短句；CLAUDE.md 不变
- 父任务可 `task.py finish`

## Out of Scope（explicit）

- **E PhasedController 边界收口**（理由见上）
- **F 课程数据 factory**（park 到 TODO，理由见上）
- 不动豆包协议层（asr-proxy / tts-proxy / doubao-codec）
- 不动课程数据格式（types/course.ts）
- 不做性能优化、不引入新依赖
- 不扩测试覆盖率（除 D guard 单测）

## Subtasks

- [ ] `05-24-cleanup-quick-wins`（A 死代码删除 + B mockStreamLLM 修复 + C prompt 字段瘦身）
- [ ] `05-24-guard-pipeline-refactor`（D session.ts 拆 GuardContext + GuardFn[] pipeline）

## Technical Notes

- 关键文件清单（每个子任务 PRD 内细化）：
  - 子任务 1：src/lib/logger.ts, src/lib/mimo/llm.ts, src/lib/agent/{memory,prompt,session}.ts, src/types/tools.ts
  - 子任务 2：src/lib/agent/session.ts, src/lib/agent/memory.ts (normalize 部分可能改签名), 新增 src/lib/agent/guards/*.ts
- Smoke 触发：两个子任务都触发 `pnpm smoke:lesson` 强制规则
- Decision context：上一轮 review 输出（in conversation context）+ grill-me 数据挖掘结果（git log + TODO.md）

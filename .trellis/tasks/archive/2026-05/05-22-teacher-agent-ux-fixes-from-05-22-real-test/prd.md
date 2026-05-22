# Teacher Agent UX fixes from 05-22 real-test

## Goal

2026-05-22 上完两节真实 animals 课(`bd78d967` 35 轮未正常结束 + `8bb58baa` 8 轮),lesson-report 暴露老师 Agent 的几类 UX 杀手级 bug。本 task 围绕这两份报告的 ground truth,做有针对性的修复。**不重构架构,不上 Hybrid 预渲染**(Hybrid 仍 park,见 docs/TODO.md)。

## 报告引用

- `docs/lesson-reports/2026-05-22-bd78d967.md`(第一节,35 轮未结束)
- `docs/lesson-reports/2026-05-22-8bb58baa.md`(第二节,8 轮跳到 frog)

## What I already know

### 用户实测体验(ground truth)

1. 切下一卡时老师声音刚到 — actions 与 TTS 时序错位
2. `Where is the elephant?` 切到 monkey 仍在问,且学生不知道要复读还是要指
3. panda 切 duck 仍在让读 panda 句子
4. duck 单卡末轮提前切,且鸭子说对了仍反复让说
5. frog 突然断,刷新就重置,没法选卡 / 没法手动进 reinforcement

### 关键代码根因点(已 grep 确认)

- `src/lib/voice/lesson-controller.ts:413` — `case 'actions': this.emit('actions', ...)` 立刻 emit,不等 TTS 队列消费
- `src/lib/agent/memory.ts:230` — `assessment.result === 'correct'` 单次直接 cleared(诊断 §1 根因)
- `src/lib/agent/memory.ts:243` — 连续 3 次 wrong streak 才升 needs_review(close 不计数)
- `src/lib/agent/memory.ts:270-273` — activeWordCardId 优先 `currentCardId`(若未 cleared),否则按 `newCardIds` 顺序,**不接受 LLM 输出的非顺序跳卡**
- `src/lib/agent/session.ts:147` — `normalizeAssistantActions` 是 show_card 归一化入口
- `src/lib/agent/prompt.ts:201` — "总结约束"段只在 `phase === 'review' | 'closing'` 时注入

### 已稳定不动的

- ASR/TTS 协议层(豆包 V3 双向流式)— 不改
- PhasedLessonController phase 切换规则 — 不改
- 课程 registry / 10 门课数据 — 不改

## Assumptions (temporary)

- 修复都在 `src/lib/agent/*` + `src/lib/voice/lesson-controller.ts` + 少量 UI 文件,不动协议层
- 测试覆盖以 `memory.test.ts` / `food.test.ts` 这套现有 vitest 风格扩展,新增推进规则单测
- 不引入新依赖

## Decisions (ADR-lite)

| # | 决策 | 选项 |
|---|---|---|
| Q1 MVP 范围 | 本 task 只做 R1-R4(4 个 P0)。R5 / R6 单独后续 task | A |
| Q2 R2 推进规则 | ASR 字面 verify + 1 次 correct 即 cleared。LLM 判 correct + raw ASR 不含字面 → 降为 attempted | B |
| Q3 R1 时序 | lesson-controller 缓存 actions,等 TTS `session-finished` 触发 emit('actions') | A |
| Q4 R3 normalize 放宽 | canShowCard 接受任意 untouched / attempted word card,cleared 仍 reject | A |
| Q5 R4 closing guard | prompt 始终注入约束(去掉 phase 条件)+ 服务端检测违规时用模板覆盖整段 speech | A |

## Requirements (locked, 来自 brainstorm Q1)

本 task MVP 范围:**R1-R4 四个 P0**。

| # | 修复 | 根因点(文件:行) |
|---|---|---|
| R1 | actions(show_card)与 TTS 时序同步 | `src/lib/voice/lesson-controller.ts:413` 立即 emit('actions') |
| R2 | 推进决策从 LLM 移到服务端(LLM 只 assess,服务端决定 cleared / 换卡) | `src/lib/agent/memory.ts:230` 单次 correct 直接 cleared,`memory.ts:243` close 不计入卡死 streak |
| R3 | show_card normalize 允许 LLM 跳到任意 untouched | `src/lib/agent/memory.ts:270-273` activeWordCardId 锁 newCardIds 顺序;`normalizeAssistantActions` 强制回写 |
| R4 | closing 总结 guard:不能说出未在本节 wordsLearned 的目标词 | `src/lib/agent/prompt.ts:201` 总结约束只在 phase=closing 注入;LLM 仍会幻觉 |

## Technical Approach

### R1 actions/TTS 时序(`src/lib/voice/lesson-controller.ts`)
- 类内增 `private pendingActions: ToolAction[] | null = null`
- `handleSseEvent` 收到 `'actions'` 时:不再立刻 `emit('actions')`,而是写到 `pendingActions`
- `tts.on('session-finished')` handler 里:`if (pendingActions) { emit('actions', pendingActions); pendingActions = null; }`
- 边界:intro 开场白(没有用户输入)的 actions 也走这套,确保第一卡的 show_card 跟 TTS 同步出现
- `endLesson` 时清空 `pendingActions`

### R2 ASR 字面 verify(`src/lib/agent/memory.ts:applyAttemptAssessment`)
- `applyAttemptAssessment` 新增参数 `rawAsrText: string | undefined`(从 session.ts 一路传入)
- 当 `assessment.result === 'correct'` 时:
  - 取当前 card 的英文 token(`card.english`)
  - 规范化:全小写、去标点(`/[.,!?;]/g`)
  - 若 `rawAsrText.toLowerCase().replace(/[.,!?;]/g, '').includes(target.toLowerCase())` → cleared(保留现状)
  - 否则 → 降为 attempted + streak+1,log warning(LLM 主观判 correct 但 raw ASR 不含字面)
- 若 `rawAsrText` 为空 / undefined → fallback 到当前 LLM 主观判定(降级,不阻塞)
- `assessment.card_id != currentCardId` 仍然 ignore,但加 console.warn

### R3 normalize 放宽(`src/lib/agent/memory.ts:canShowCard`)
- 当前 `canShowCard` word card 分支:`card.id === activeWordCardId && cardProgress != 'cleared'`
- 改为:`card.kind === 'word' ? (cardProgress[card.id] === 'untouched' || cardProgress[card.id] === 'attempted') : <sentence 分支保留>`
- `getActiveWordCardId` 保留(没切到的卡仍按 newCardIds 顺序作为 fallback,只是 LLM 跳卡不被强制覆盖)
- 影响:LLM 输出 `show_card: frog`(在用户口头说"跳到 frog"后),不再被回写为 cat

### R4 closing guard
- `prompt.ts:201` 把 "总结约束" 段移到 `buildMemoryContext` 末尾**始终注入**,无 phase 条件
- `session.ts` SSE done 前(或 commit 前)加扫描:对 `result.speech` 做正则 `/\b<targetWord>\b/i`,如果命中任何 `course.targetWords.filter(w => !wordsLearned.includes(w))` → 用模板覆盖整段 speech:
  ```
  今天我们一起练了 ${wordsLearned.join('、') || '一些新词'},你说得很努力!下次再来玩吧。
  ```
- 模板覆盖时,流式 SSE 已发出去的 speech-delta 怎么办?**只在 commit 阶段覆盖 server-side state + 写库,客户端这次仍听到原 LLM 输出**。下次 LLM 看不到这条违规话术。**或** 关闭流式输出 closing 段,closing 由服务端模板直接生成 → 简化但改动较大,留 implement 阶段决定

## Acceptance Criteria

### 单测(vitest,必跑全绿)

- [ ] R1: lesson-controller actions 缓存 + session-finished 触发的单测,mock TTS event 验证 emit 时机
- [ ] R2: `applyAttemptAssessment` 在 `result=correct` + `rawAsrText` 含/不含目标 token 两种 case 下的 cardProgress 输出
- [ ] R2: `applyAttemptAssessment` 在 `rawAsrText` 为空时的 fallback 行为
- [ ] R3: `canShowCard` / `normalizeAssistantActions` 对 LLM 输出非 activeWordCardId 的 untouched / attempted / cleared 三种 case
- [ ] R4: closing 模板覆盖逻辑在 LLM speech 含/不含未学词时的行为
- [ ] 现有 27 个单测不回归

### 集成 / Typecheck

- [ ] `pnpm exec tsc --noEmit` 全绿
- [ ] `pnpm test` 全绿

### 真实测验证(implement 完成后)

- [ ] 跑 1 节真实 animals 课(或其他课),产出 lesson-report
- [ ] 报告对照 5 条 ground truth:
  - [ ] #1 #4 切卡时机:show_card 与 ai speech 描述卡片一致(不再跨卡说话)
  - [ ] #2 quiz 切错卡现象不再出现(R3 配合 R1 解决)
  - [ ] #3 同 #2 #4 共解
  - [ ] closing 总结不再列出未学词(R4)
  - [ ] (R5/R6 不在范围,断了仍要刷新,记 lesson-report 不阻塞本 task acceptance)

### 文档同步

- [ ] `docs/architecture.md` §3(数据流)/ §4(状态机)/ §6(关键设计决策表)按改动同步
- [ ] `docs/TODO.md` 反向同步:R1-R4 移到"已完成记录",actions/TTS 时序从 backlog 删除

## Risk / Edge cases (expansion sweep)

- **R1 边界**:`session-finished` 在某些异常路径(TTS error / abort)可能不触发,需要 `pendingActions` 在 abort/error 路径也释放或丢弃(根据是否要切卡决定)
- **R2 边界**:儿童发音偏离时 raw ASR 不含字面但实际接近(如 "f-r-o-g" → ASR "frog" 命中 OK;"frog" → ASR "fog" 不命中,但学生实际说对了)— 这种 case 在 ground truth 中较少出现(短词),fallback 是 attempted(下一轮再 verify),不会卡死
- **R2 边界**:课程目标词如果是多 token 短语(如 "One thousand"),`includes` 检测仍可工作,但 raw ASR "1000" 会失败 — 当前 10 门课都是单词,留给 numbers 课重启时处理(out of scope)
- **R3 边界**:LLM 一轮可能输出多个 show_card(罕见),全部按新规则过;最后一张 show_card 决定 nextCardId(`getLastShowCardId` 现状保留)
- **R4 边界**:closing 模板覆盖时,客户端已经流式听到原 LLM speech;只覆盖 server-side memory + 写库。**用户这一次仍听到错的总结,但 lesson-report 不会写违规词,且下次 LLM history 看不到违规话术** — 不解决"用户本次听到错总结"的体验,但解决数据闭环。是否要进一步处理由 implement 阶段权衡

## Related scenarios (检查无回归)

- **Intro phase** 的 LLM 输出也走同一 SSE 路径,R1 时序修复应自动覆盖
- **Reinforcement quiz** 走 `startListening({ routeToChat: false })`,**不经过 /api/chat**,R1-R4 不影响 reinforcement 流程
- 老课程 / 旧 LessonView fallback 已删除,无回归担忧

## Definition of Done

- 涉及代码加 vitest 单测(memory 推进规则、normalize 归一化)
- `pnpm test` + `pnpm exec tsc --noEmit` 全绿
- 改动后跑一节真实测,产出新 lesson-report,确认对应 UX 痛点消失
- `docs/architecture.md` 涉及节同步(模块清单 / 关键数据流 / 关键设计决策表)
- `docs/TODO.md` 反向同步:实现的项移到"已完成记录",剩余项调整优先级

## Out of Scope (explicit)

- **R5 session resume + endLesson 兜底** — 单独后续 task(改 SQLite schema + 客户端 resume,工作模式不同)
- **R6 跳卡 UI / 手动进 reinforcement** — 单独后续 task,等 R1-R4 完成后实测看是否仍是痛点
- **R7 sentence_* 卡 normalize** — 留到下次实测出现再单独决定
- **R8 lesson-report 字段补全 / token usage 字段对齐** — 单独小 task,可单独跑
- Hybrid 预渲染重构(park 中,本次不启动)
- ASR 协议层调优(已知 hot_words 不救命)
- 跨 session 进度记忆

## Technical Notes

- 框架:Next.js 14 自定义 server,vitest,better-sqlite3
- 改动核心区域:`src/lib/agent/{memory,session,prompt}.ts` + `src/lib/voice/lesson-controller.ts` + `src/components/lesson/*`
- 现有教学循环 v1.1 文档:`docs/superpowers/specs/2026-05-04-p0-observability-teaching-loop.md`
- 现有三阶段 spec:`docs/superpowers/specs/2026-05-15-lesson-structure-refactor-design.md`
- 课程作课规范:`.trellis/spec/frontend/course-authoring.md`

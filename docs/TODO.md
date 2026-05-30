# EduAgent TODO

> 2026-05-30 更新版。05-26 已补 Prompt input quantification 和 Eval v1;05-27/28 已完成 Prompt Slimming v1;05-28 已把 `pnpm lint` 配成非交互式质量门。下一步不再凭感觉排工程项,先跑真实课 + Eval,再决定继续压 prompt/延迟、上 Hybrid、还是补 session/autonomy。
> 历史完成项参考 `docs/architecture.md` §9「文件演进历史」,本文件不复述。

## 下一步:真实课 + Eval 决策

最新代码已通过自动 smoke / prompt slimming / Eval 数据门,但还需要再跑 1 节真实课确认人工路径:
- 课后跑 `pnpm tsx scripts/lesson-report-data.ts <session-id>`,先看 `eval.sessionHealth` 和 `eval.agentBehavior`,再看 `eval.teachingLoop` / `eval.costContext`
- 继续确认 Space / 按钮 push-to-talk、切卡 speech/show_card、reinforcement 点击解锁、TTS 有声这些 05-23 交互没有回归
- 重点观察真实体验:老师话术是否自然、首音频延迟是否仍明显、孩子静默时是否冷场、内容是否开始重复
- 记录 avg input / largest prompt bucket,验证 Prompt Slimming v1 在真实课里是否足够

结果决定:
- 如果 Eval 先报 session/agent 行为风险 → 先修行为正确性,不要先优化成本
- 如果只剩 token / 延迟偏高 → 启动 Prompt Slimming v2 或模型/首句延迟优化
- 如果老师话术质量仍是主要瓶颈 → 进入 Hybrid 预渲染重构
- 如果 session resume / 进度选择是主要痛点 → 启动 SQLite session persistence
- 如果孩子静默冷场是主要痛点 → 启动 idle / proactive policy

---

## 当前 backlog

### 1. Prompt / latency optimization v2 — 真实 Eval 继续指向成本/延迟时再启动

*2026-05-23/25 真实报告曾触发 highAvgInput:约 2300-2935 input tokens / round。05-26 已做 input breakdown,05-27/28 已完成 Prompt Slimming v1。现在不要再凭旧 TODO 直接继续压 prompt,先等下一节真实课 Eval 证明它仍是主瓶颈。*

**2026-05-24 已完成**:state_update 删除 4 个废字段（current_card_id / phase / words_learned / generated_content），仅保留 current_word + attempt_assessment。LLM output token 成本下降，input token 不变。

**2026-05-26 已完成**:Prompt input quantification 已持久化到 `interaction_logs.model_calls.llm.inputBreakdown`,报告可拆 static rules / phase rules / course definition / lesson state / summary constraints / history / separators。

**2026-05-27/28 已完成**:Prompt Slimming v1 把代表 fixture total chars 从 5065 降到 3527（-30.4%）,static_rules 从 2481 降到 1206（-51.4%）,course_definition 从 1260 降到 997（-20.9%）。后续 smoke 11/11 通过,Eval 未报 speech_card_alignment / premature_closing / token_data_integrity。

如果真实 Eval 仍指向成本/延迟,候选动作:
- 对真实课 largest bucket 做二次定位:static_rules、course_definition、lesson_state、history 哪个重新变大就压哪个
- 只在有数据证明必要时继续缩 course_definition / lesson_state;不能牺牲 `asrAliases`、`drillParts`、current/next card 控制和 closing 安全
- 如果首音频仍主要卡在 MiMo first-token 或 TTS 合成,优先评估更快模型 / prompt 首句策略 / TTS 占位或缓存,不要只盯 input token

### 2. Hybrid 预渲染话术架构 — LLM 退化为决策器 *(park,等实测决策)*

*2026-05-05 设计讨论产物。原触发条件是"用户基数 > 1 或 课程数 > 10"。2026-05-23 起,`show_card` / speech 错位已用出口一致性修复,Hybrid 不因这类同步 bug 启动;触发条件收窄为"真实回归仍证明老师话术质量、成本或延迟是主要瓶颈"。*

**核心思路**:
- 当前所有 teacher utterance 都是 LLM 实时生成 + 豆包 TTS 实时合成 → 教学一致性差、token 高、话术循环 / 提前结课等"过度灵活"副作用
- 改造方向:整段话术 build-time 预渲染为本地 .opus,LLM 退化成"决策器"输出纯结构化 JSON,从预制池里 pick `audio_id` 播放
- 关键架构变更:LLM 工作范围从"创作 teacher 话术"压缩到"分类 + 路由",TTS runtime 调用归零

**预制资源池估算**:
- per-card 5-7 段(初次介绍 / 复习 / 接近 hint / 完全错 hint / 收尾)
- 共享池 30 段(鼓励 / 过渡 / 失败 / 跳过 / out-of-scope)
- 量级:常规课 16 卡 ≈ 100 段 + 共享 30 段,体积 3-5MB/课

**LLM 决策器 schema(纯 JSON)**:
```json
{ "asr_assessment": "correct" | "close" | "wrong" | "off_topic",
  "next": { "audio_id": "...", "card_id"?: "..." } }
```

**启动时待决的边界**:
- LLM JSON-only,还是允许 `reasoning` 字段
- off_topic 走预制池,还是降级到 LLM + 实时 TTS
- 错音诊断分 3 档还是 5 档(决定 hint 池规模与作课成本)
- 课程作者写课成本:每卡 5-7 段台词,需要工具/模板支持

### ~~3. Actions / TTS 时序与 speech/show_card 出口一致性~~ — **已完成(2026-05-22/23)**

bd78d967 + 8bb58baa 实测报告确认 actions/TTS 时序是 UX 杀手,`pendingActions` 机制已落地。d26e730b 后续暴露服务端返回合同内部不一致;05-23 已补 `show_card` 与 teacher speech 出口一致性,并在 smoke 中覆盖 pointer hold、Space hold、speech/card consistency。

---

## 战略方向待决:Agentness vs Content 平衡 *(2026-05-25 讨论登记)*

> 触发:课程已扩到 ~30 门常规课,小朋友进入每日上课实测阶段。需要用真实使用反馈决定下一阶段重心是**继续加课**还是**补 agentness 缺口**。本节不直接转 task,作为后续 backlog 排序的判据。

### 项目在 agent 思想上的现状对照

**强对齐(已经在按 agent 范式做)**:
- 完整 perceive-think-act 闭环:ASR → MiMo LLM 决策 → TTS + `show_card` 改画面(action 影响 environment,而非只回字)
- 多模态 grounding:画面是推理的一部分而非渲染产物,老师话术与 `show_card` 出口一致性已是硬约束
- `src/lib/agent/` 分层(normalize / memory / session / prompt / orchestrator / assessment)是按 agent 拆的,不是套壳
- LessonController 三阶段状态机 = 显式 high-level plan skeleton + LLM 局部决策的 hybrid 范式

**弱项(挂着 agent 但实际偏 scripted multimodal app)**:
1. **Autonomy 弱** — 每轮都靠 push-to-talk 触发,孩子静默时 agent 不会主动推进;无 idle / proactive policy
2. **Planning 浅** — 课程内容是预制 `Course` 对象,不是 agent 根据学生水平动态生成的教学路径
3. **跨 session 长记忆未闭环** — memory 模块存在,但孩子的学习轨迹(反复错的词 / 已掌握的词)是否真影响下一节课的选课与重点,目前未证实
4. **Self-correction 局限于局部** — micro 级(ASR / LLM 输出格式)有降级,macro 级("整节课节奏不对要重设计")没有

### 实测决策路径(用每日真实上课信号反推方向)

接下来每日上课的观察重点(分别对应不同迭代方向):

- 如果**主要痛点是内容枯燥 / 词汇不足 / 重复感** → 继续加课、加多样性(content-driven)
- 如果**主要痛点是孩子静默后冷场、不会自己进下一步** → 补 autonomy(idle policy / proactive prompt),autonomy 项升 backlog
- 如果**主要痛点是同一难度反复教 / 不会自动跳过已掌握 / 不会重点回访薄弱点** → 补长期记忆 + 动态选课,把"兴趣 / 困惑记忆"和 session persistence 升 backlog
- 如果**主要痛点是 LLM 话术质量 / 成本 / 延迟** → 启动 Hybrid 预渲染(已 park 项),agentness 反而退一步换稳定性
- 如果**没有强痛点,只是内容深度不够** → 继续 content-driven,本节不动

### 自我提醒

- "单用户阶段优先内容驱动"的 feedback 仍生效(见 user memory `feedback_content_over_architecture_at_single_user.md`)。本节不是要立刻补 agentness,而是**让真实反馈来决定**,避免凭直觉重构。
- 任何"补 agentness"的迭代,启动前必须能指出"哪条实测信号触发了它",不接受纯架构动机。

---

## 远期 backlog

1. **Session persistence / resume** — `sessions` 是 in-memory Map,server 重启 / 刷新会让客户端 sessionId 失效。9 分钟一节课中断概率低,真被坑了再升回当前 backlog。
2. **课程产出 Codex skill** — SOP 已稳定在 `.trellis/spec/frontend/course-authoring.md`,10 门课沿用同一模板没出问题;Codex skill 化仍未做,等触发场景再启动(用户扩展课程节奏 / 引入第二位作课者)。
3. **兴趣 / 困惑记忆** — 在词汇表现之外识别 confusion / engagement,等真实报告证明有价值再做。
4. **长期语音 UX** — VAD 自动停止 / 连续对话 / WebSocket 退避重连 / 开场白 TTS 预加载。

---

## 已完成记录(粗粒度,详见 architecture.md §9)

- 2026-05-01 — 初版语音管线 + living doc 制度建立
- 2026-05-02 — 课后报告生成器
- 2026-05-05 — 画布 v2(WordCardCanvas + `show_card` 协议统一)
- 2026-05-05 — timeNumbers 实测报告 + ASR hot_words 真实回归基线(协议层 hot_words 不救命,字典 fallback 已撤)
- 2026-05-10 — 教学循环 v1.1(cardProgress / clearedCardIds / LLM attempt_assessment / history 12 条)
- 2026-05-14 — 前端重构 Bunny 小院子(后被 CC UI 取代)
- 2026-05-15 — lesson-structure-refactor:三阶段课程结构 + food 示范课 + PhasedLessonController;旧 LessonView fallback 删除
- 2026-05-20 — CC 手绘绘本风 UI 接入,前端切换到麻吉魔法学院,`theme` 改 `tone`
- 2026-05-21 — 课程 registry 扩到 10 门常规课程,合同收紧为 12 word + 4 sentence cards
- 2026-05-22 — **Teacher Agent UX P0 四项修复(R1-R4)**:actions/TTS 时序、ASR 字面 verify、normalize 放宽(允许跳卡)、closing guard 始终注入 + 服务端 speech 扫描替换
- 2026-05-23 — **Lesson voice regression stabilization + 轻量诊断闭环**:push-to-talk ASR 建连/关闭竞态、pointer/Space hold、speech/show_card 出口一致性、dev 强切 reinforcement 解锁、smoke UI 跟读与 speech/card 一致性断言;原"日志整理"长期项关闭
- 2026-05-24 — **代码库清扫 A+B+C**:删 6 项死代码(logger.ts / callLLM / incrementSilentTurns / silentTurns / GenerateState / addAssistantMessage / getNextWordCardId);mockStreamLLM 修正为合法 show_card shape;prompt state_update 删 4 废字段(current_card_id / phase / words_learned / generated_content)
- 2026-05-24 — **Guard pipeline 重构(D)**:`src/lib/agent/guards/` 拆出 closing / premature-closing / normalize / speech-card-align pipeline,`streamUserInput` 收窄,行为不变
- 2026-05-25 — **R-C canonical matching + explicit ASR aliases**:修复 `ice cream` / `icecream` 类 ASR 命中问题,课程可显式声明 `asrAliases`
- 2026-05-26 — **Prompt input quantification + Eval v1**:LLM prompt bucket 持久化,lesson-report 输出 session health / cost-context / teaching-loop / agent behavior / next-iteration signals
- 2026-05-27/28 — **Prompt Slimming v1**:代表 fixture input chars -30.4%,static_rules -51.4%,course_definition 小幅压缩并通过 smoke / Eval 风险门
- 2026-05-28 — **ESLint gate**:`pnpm lint` 改为非交互式可通过,lint 配置整理从远期 backlog 关闭

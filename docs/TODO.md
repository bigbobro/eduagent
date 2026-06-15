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

## 项目体检 backlog(2026-06-15 全量多 agent review)

> 一次 10 维度 + 对抗验证的全量 review,确认 50 条(12×P1 / 23×P2 / 15×P3),剔除 3 条误报。
> **§1 闭环可靠性簇已完成**(见下方「已完成记录」2026-06-15)。其余按性价比排序如下,
> 每项带 `file:line` + effort,下一次开任务可直接挑一条 brainstorm。基线当时:typecheck/lint
> clean,294 测试,40 门课。**单用户本地阶段**:多数 P2/P3 不需架构重构,按痛点挑。

### P1 候选(高性价比,建议优先)

1. **MiMo base-URL 配置陷阱 + DATABASE_PATH 双默认** — [config.ts:48](../src/lib/config.ts#L48) · low
   - `config.ts:48` 读 `MIMO_API_BASE`,但 `.env.example`/`.env.local`/`init.ts`/两个测试全用 `MIMO_BASE_URL` → **env override 被静默忽略**,永远走 config.ts:11 硬编码默认。
   - 两处域名拼写不一致:config 默认 `xiaomim**om**o.com` vs env `xiaomim**im**o.com`。运行时用的是 config 默认且能跑 → 那个才是对的。**陷阱:只改变量名让它读 `MIMO_BASE_URL` 会切到 `.env` 的另一个拼写,可能把好的跑挂——必须同时统一域名。**
   - 先确认哪个域名真能解析 → config 读 `MIMO_BASE_URL`(`MIMO_API_BASE` 留 alias)+ 三处域名统一 + 启动日志打 resolved URL。顺带修 `DATABASE_PATH` `./data` vs `./db` 双默认。

2. **WS upgrade 无 Origin 校验 + ws 补丁** — [server.ts:36](../server.ts#L36) · low
   - WebSocket 不受同源策略约束:dev server 跑着时任何打开的网页都能连 `ws://localhost:3000/api/voice/{asr,tts}` 用服务端豆包凭据烧额度。~5 行 Origin 白名单。
   - 顺带 `pnpm update ws`(8.20.0→8.20.1,内存泄露 CVE,在语音数据路径)。可选:ASR/TTS query 参数加长度上限。

3. **首音频延迟**(THE 核心指标) — [session.ts:113](../src/lib/agent/session.ts#L113) · high
   - 服务端把整段 LLM JSON 收完才吐第一个 speech-delta(~2.2s 尾延迟,见 voice-benchmarks.md)。
   - 低成本:`thinking` 态放预渲染 "嗯…" filler 掩盖延迟(voice-benchmarks option 3)。高成本:句子边界跑可在前缀判定的廉价 guard 后提前喂 TTS。顺带调 ASR `end_window_size`(asr-proxy.ts:90,每轮尾延迟旋钮)。

### P2(稳健性 / 数据正确性 / 工程化)

4. **关闭页面课堂不结算** — [session.ts:47](../src/lib/agent/session.ts#L47) · low — `finishLessonLog` 只在 `action:'end'`(普通 fetch)触发,关 tab/刷新/崩溃 → `end_time` 永远 NULL、时长统计为 0。改 `navigator.sendBeacon` + 每轮增量 UPDATE(顺带覆盖崩溃)。
5. **测试盲区补强** · medium — `asr-proxy.ts:177` 的 `bridge()` 握手/PCM 缓冲时序零单测(照 tts-proxy 的可注入 fake 模式);LLM 流错误/abort 路径;tts-client 重连退避。
6. **CI workflow** — 无 `.github/` · low — 加一个 `VOICE_MOCK=true` workflow 把 294 测试+typecheck+lint+build 变成真门禁;顺带 `server.ts` 被默认 typecheck 排除([tsconfig.json:25](../tsconfig.json#L25)),加跑两个 tsconfig 的 `typecheck` script。
7. **logger 迁移收尾 + 降噪** — [logger.ts](../src/lib/logger.ts) · medium — 结构化 logger 13 模块只 1 个用;[memory.ts:202](../src/lib/agent/memory.ts#L202) 每轮无条件 warn 级打诊断快照(违反"验收后删打点")。二选一并 gate 热路径日志。
8. **chat route 加固 + DB 生命周期** · low — [route.ts](../src/app/api/chat/route.ts) `req.json()` 无 zod 校验;无 graceful shutdown(WAL 不 checkpoint);in-memory session 无淘汰;DB word-performance 与内存 R2 真相分叉([session.ts:176](../src/lib/agent/session.ts#L176))。
9. **Next.js 15 升级** — [package.json:22](../package.json#L22) · medium — 14.2.35 是 14.x 冻结末端,5 个 high CVE(含 WS-upgrade SSRF,命中自定义 server)只在 15.x 修。当独立任务做(custom server + framer-motion transpile),非对外暴露前可缓。
10. **文档漂移** · low — 课程数 README 30 / architecture.md 10 / 实际 40;architecture.md 说 logger.ts 已删但它活着;MIMO 变量名(随 P1#1 一起修)。数字写成"见 index.ts"防再漂。
11. **前端交互打磨** · low — Quiz 双击双答([QuizPickWordFrame.tsx:43](../src/components/lesson/QuizPickWordFrame.tsx#L43));[ReinforceFrame.tsx:42](../src/components/lesson/ReinforceFrame.tsx#L42) 未 memo 的 onAnswer 每渲染重挂 listener;locked 按钮仍可聚焦 + push-to-talk 缺 aria-pressed。

### ⭐ 儿童产品专项(critic 补,10 维度系统性漏掉——因为"用户是孩子")

> 纯工程视角看不到。单用户本地阶段多为 P2,但作为**风险类别**价值最高。

- **LLM 输出无内容安全过滤** · P2 — [orchestrator.ts](../src/lib/agent/orchestrator.ts) 把 MiMo `speech` 逐字流给 TTS 直达孩子,零审核。加"只说目标词汇+鼓励语"约束检查或关键词 guard。
- **孩子语音转写永久明文留存** · P2 — [session.ts:189](../src/lib/agent/session.ts#L189) 每轮写 ASR 原文进 SQLite,全仓库无删除/TTL/清理。加保留策略 + "清除历史"入口。
- **家长门禁是纯客户端摆设** · P2 — `pin.ts` 硬编码 salt + localStorage;`/api/stats`、`/api/sessions` 服务端零鉴权,谁打都能拿孩子全部进度。
- **其它** · P3 — 无 CSP/Permissions-Policy;麦克风权限被拒无面向孩子 UI([recorder.ts:58](../src/lib/audio/recorder.ts#L58) 只 console.warn);SQLite 无备份/损坏恢复;错误只进 console 无遥测(=总得手动贴日志的根因);无 `.nvmrc`/engines(better-sqlite3 跨 Node 版本会崩);`/api/chat` 无 rate-limit。

### P3 / 维护性(顺手做,单用户阶段低优先)

手写 emitter ×4、`safeParse` ×2、`markWordCorrect/Incorrect` 重复、死 `resetConfig`、assistant-history-as-prose、`PcmPlayer.dispose` 不 await stop、死 `cancelSession`/无 barge-in、`buildPromptInput` 每轮算两次、未文档化的 `NEXT_PUBLIC_DOUBAO_TTS_DEFAULT_SPEAKER`。只在为高优项改到那个文件时顺手清。

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
2. **课程产出自动化** — 课程作者ing SOP 已在本地 agent 工作流中稳定,10 门课沿用同一模板没出问题;公开仓库先不提交 agent 过程文件,等用户扩展课程节奏 / 引入第二位作课者时再决定是否产品化。
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
- 2026-06-15 — **§1 闭环可靠性簇**(全量 review 第一项):修 6 bug + id-7 —— recorderLock 错误路径泄漏、speech-finish 兜底定时器丢 pendingActions、SpeechExtractor 跨 chunk 丢 speech、consumeSSE 无 try/finally、LLM 卡死双层超时(server 15s / client 20s watchdog)、controller error 首次有 UI 横幅、malformed 输出友好重试。+10 单测(294 过),smoke 13/13,architecture.md 同步。余下 review 项见上方「项目体检 backlog」

# EduAgent TODO

> 2026-05-05 清理版。这里是当前工作板,不是历史记录。

## 当前状态

- [x] 语音链路可用:流式 ASR / LLM / TTS 已接通。
- [x] 课堂交互可用:按住说话、Bunny 状态、字幕栏、开始/结束课堂已接通。
- [x] 教学循环 P0 已处理:ASR/TTS usage、词汇表现追踪、连续失败换策略、复习不幻觉。
- [x] 三阶段课程结构已落地:导入 → 互动 → 巩固,当前唯一可见课程是 `food`。
- [x] food 课程资产已落地:ImageGen 单体 PNG + 结构化 `scene.svg` hotspot。
- [x] 旧 v2 课程:`transportation`、`timeNumbers` 已退役;旧 `LessonView` fallback 已删除。
- [x] `/lesson-report` 已兼容当前 food / phased course registry。
- [x] timeNumbers 跑过一节实测 → 报告 `docs/lesson-reports/2026-05-05-eb25ad66.md`。

## 已完成(2026-05-15)

**lesson-structure-refactor epic — 三阶段课程结构 + food 示范课**

- Spec: `docs/superpowers/specs/2026-05-15-lesson-structure-refactor-design.md`
- Plan: `docs/superpowers/plans/2026-05-15-lesson-structure-refactor.md`(21 tasks,已实施)
- 已交付:food 三阶段课程、课程 registry、ImageGen PNG 资产、结构化 `scene.svg` hotspot、phase-aware prompt、progress snapshot SSE、`phase-transition` / `quiz-answer` API、`PhasedLessonController`、Intro / Interactive / Reinforce / Quiz UI。
- 新标准唯一化:当前只暴露 food;transportation / timeNumbers 与旧 `LessonView` fallback 已 cleanup。
- 工具层(放大 / 圈出 / 慢速 / 换问法)是后续独立 epic。
- 本 epic 已包含并取代下方 P1 §2 "写第 3 节课"(food = 第 3 课 + 示范课)。
- 下游 Codex 产新课:照 `docs/course-authoring-standard.md` 走;spec §13 只保留入口摘要

---

## 当前阶段次序(2026-05-10 v1.1 后)

按"内容驱动 + 最小止损 + LLM 容错替代规则纠正"思路。ASR 注入路径已打通,过拟合字典 fallback 已撤,教学循环 v1.1 已落地。下一步写第 3 节课并用真人实测 + lesson-report 验证 v1.1。

1. **(止损·完成)P1 §1 ASR hot_words 注入** — 已落地;真实回归证明协议层 hot_words 对短英文词与数字归一化无救命效果,字典纠正 fallback 已撤;ASR 容错路径转交 P1 §3 LLM 容错判定承担
2. **(工程·完成)P1 §3 教学循环 v1.1** — 已落地:drillParts、cardProgress、clearedCardIds、LLM attempt_assessment、history 6 轮窗口
3. **(内容·完成)P1 §2 写第 3 节课** — food 已作为新三阶段示范课落地
4. **(实测)用 food 跑实测 + lesson-report** — 验证 §3 LLM 容错与三阶段切换是否稳定
5. **(决策)** 看真人实测报告再决定:启动 P1 §4 Hybrid 重构?或继续内容?

## P1 队列

1. **ASR hot words / context** *(完成,但效果有限——见下方真实回归基线)*
   - transportation 实测里儿童英文误识明显:`Airplane` -> `Apple` / `AirPods` 等。
   - timeNumbers 实测同样严重:`hour` -> 「啊我」/「H R O」,`thousand` -> 「官方」/「弯的房子」/「1st」(报告 §1)。
   - [x] 在 `src/lib/voice/asr-proxy.ts` 建链时把 session `targetWords` + 当前 `card_id` 关键词作为 hot_words 注入豆包请求(协议实际入口是 `request.corpus.context` JSON string 的 `hotwords`)。
   - [x] 调研豆包 ASR 中英混合 language hint:本地协议未出现 `language_hint`;`audio.language` 不传时默认支持中英文,当前保持不传。
   - [x] 加自动化回归:hotwords 注入 JSON shape 单测 + fixture WAV 真实音频质量检查(`tests/asr-hot-words.test.ts`);`pnpm run voice:asr-hotwords` 跑 baseline + hotwords 真实 ASR 写报告到 `docs/lesson-reports/asr-hotwords-regression-*.json`。
   - **2026-05-06 真实回归基线结论**:协议层 hot_words 对 `hour -> Our.`、`One thousand is ten hundreds -> 1000 is 10.` 未生效——豆包 ASR 在英文短词与数字归一化上 weak,不是 hot_words 能调的。
   - **2026-05-06 撤销字典化 fallback**:此前 Codex 加的 `correctAsrTextWithSessionContext`(把 `Our.` 强改 `hour` / `1000 is 10.` 强改 `One thousand is ten hundreds`)已删除。原因:(1) 字典基于 timeNumbers 一节的具体误识结果枚举,过拟合,新课会重新写一遍;(2) 让 ASR 文本被覆写,下游 LLM 看不到学生实际说了什么,反而损害"基于 raw ASR 自行容错判定 mastery"的路径。容错改由 P1 §3 LLM 容错判定承担。

2. **写第 3 节课** *(完成:food 三阶段示范课)*
   - 当前主题:food。
   - 已按新标准完成:`cards[]` + `objectives.sentences` + quizzes + ImageGen PNG + `scene.svg` hotspot。
   - 下一步:用 food 跑 /lesson-report,看三阶段切换、LLM 容错、quiz 记录是否稳定。

3. **教学循环 v1.1 — 状态感知 + LLM 容错(进度 / 收敛 / 总结 / ASR 容错)** *(2026-05-06 ungate)*
   - timeNumbers 实测里 LLM 不基于"已掌握"信号收敛:学生轮 14 已说对 thousand,轮 15 仍要求复读;课末总结说"已掌握 thousand"但句子层完全失败(报告 §2)。
   - 课程进度也不基于"剩余目标":定义 7 词 + 4 句共 11 个 card,实测只覆盖 3/7 词 + 1/4 句,LLM 在轮 16 仍主动 wrap up,轮 17 学生说"现在学万"被拒。
   - **新增任务(承接撤销的 ASR fallback)**:豆包 ASR 在英文短词与数字归一化上 weak,字典纠正过拟合不可持续。让 LLM 直接拿 raw ASR + 当前 cardId 自行容错判定学生是否说对(LLM 容错能力 >> 规则字典)。
   - **ungate 理由**:hotwords 不救命的回归实测,加上 timeNumbers 的状态感知缺失,是两条独立证据。LLM 容错判定是必须的,不再等 2-3 节实测。
   - [x] 课程数据新增必填 `drillParts:string[]`,现有两课全补,作为 close/wrong 时慢读拆解脚手架。
   - [x] 服务端 memory 维护 `currentCardId` + `cardProgress: Record<card_id, 'untouched' | 'attempted' | 'cleared' | 'needs_review'>` + `clearedCardIds`,并把 `show_card` action 作为 currentCardId 真相来源。
   - [x] **LLM ASR 容错判定**:LLM 拿 raw ASR + 当前 card 英文目标 + `drillParts` + 课程目标词列表,在同次 JSON 里输出 `attempt_assessment`。单词同音/近音可 correct;句子语义接近但不完整先 close。
   - [x] close/wrong 教学策略:单次输出必须 3 步慢读脚手架(正确示范 → 按 drillParts 慢读 2-3 次 → 请按麦克风再读一次);同一卡第 3 次非 correct 进入 `needs_review`,必须换策略或暂时跳过。
   - [x] system prompt 加规则:`cleared` 只表示本节课可推进,不是长期掌握;untouched card 非空不得结课。服务端也拒绝 premature closing state_update。
   - [x] LLM context 裁剪:history 保留最近 12 条 message(约最近 6 轮),依赖 memory 状态注入课堂事实。

4. **(暂记,不实施)Hybrid 预渲染话术架构 — LLM 退化为决策器**

   *2026-05-05 设计讨论产物。当前阶段(用户基数 = 1、课程数 = 2)不启动:写更多课程的 ROI 比重构架构高,且 §1 + §3 解决后当前 80% 的体感问题就消失。**触发再评估的条件**:用户基数 > 1,或课程数 > 10。*

   **核心思路**:
   - 当前所有 teacher utterance 都是 LLM 实时生成 + 豆包 TTS 实时合成 → 教学一致性差、token 高、话术循环 / 提前结课等"过度灵活"副作用(报告 §2 §3)
   - 改造方向:整段话术 build-time 预渲染为本地 .opus,LLM 退化成"决策器"输出纯结构化 JSON(不再生成自然语言),从预制池里 pick audio_id 播放
   - 关键架构变更:LLM 工作范围从"创作 teacher 话术"压缩到"分类 + 路由"(基于 ASR 内容判定学生状态 → 选 audio_id),TTS runtime 调用归零

   **预制资源池结构**(参考):
   - per-card(每张卡 5-7 段):第一次 introduce / 复习再次出现 / 发音接近时 hint / 发音完全不对时 hint / 掌握收尾
   - 共享池(跨课复用):鼓励语 ~20 句 / 过渡 / 失败 / 跳过 / out-of-scope 引导 ~5-10 句
   - 量级估算:11 卡课 ≈ 70 段 + 共享 ~30 = 100 段 .opus,体积 3-5MB/课

   **LLM 决策器 schema(纯 JSON)**:
   ```json
   { "asr_assessment": "correct" | "close" | "wrong" | "off_topic",
     "next": { "audio_id": "...", "card_id"?: "..." } }
   ```

   **启动时待决的边界**:
   - LLM 是 JSON-only 还是允许 `reasoning` 字段(用于日志,不播放)
   - off_topic 走"out-of-scope 预制池"(完全无 LLM fallback)还是"降级到 LLM + 实时 TTS"?讨论时倾向前者
   - 错音诊断分几档:3 档(对/接近/全错)还是 5 档?— 决定 hint 池规模与课程作者负担
   - 课程作者写课成本:每卡 5-7 段台词,需要工具/模板支持

   **硬依赖**:P2 §3「音色定档」必须先完成,否则预渲染音频要重跑。

## P2 队列

1. **Session persistence / resume** *(从 P1 降级)*
   - 刷新、断网、dev server 重启会中断课程;9 分钟一节课中断概率低,实测尚未被坑。
   - 真被坑了再升回 P1。
   - 需要时:持久化 phase / state / 已学词汇 + usage 增量落盘。

2. **Actions 与 TTS 时序** *(从 P1 降级,需确认是否仍是问题)*
   - 早期 transportation 实测发现画布可能先于语音切卡。
   - timeNumbers 报告里未见此现象。新课实测复现再升回 P1。
   - 简单方案:等当前 TTS 片段结束后再触发 `show_card`;进阶:跟随 TTS sentence event 分句触发。

3. **音色定档** *(从 P1 降级)*
   - 当前 `zh_female_tianmei` 仍是占位。
   - 之前因 Hybrid 列硬依赖才在 P1;Hybrid park 后失去紧迫性。
   - 调优非止损,等内容铺开 / Hybrid 重启再做。

4. **画布细节优化** *(从 P1 降级)*
   - timeNumbers 实测后基本可用,字体没明显问题。
   - 图片 loading 态、卡片切换动画属于打磨。

5. **课程产出 SOP / Codex skill**
   - 标准文档已提前建立:`docs/course-authoring-standard.md`。
   - 课程产出 v1:课程设计 -> ImageGen 单体图 -> 结构化 `scene.svg` hotspot -> `cards[]` / `objectives.sentences` / quizzes -> 图片引用检查 -> 测试。
   - Codex skill 仍 gated:等课程数 ≥ 3,看标准是否稳定后再产品化。

6. **兴趣 / 困惑记忆**
   - 在词汇表现之外,再识别 confusion / engagement。
   - 等真实报告证明有价值后再做。

7. **日志整理**
   - 只有当日志排查开始痛苦时,再加轻量 logger。
   - 现在不提前堆基础设施。

8. **长期语音 UX**
   - VAD 自动停止。
   - 连续对话模式。
   - WebSocket 重连退避。
   - 开场白 TTS 预加载。

## 已完成记录

- 语音管线:`docs/voice-benchmarks.md`
- P0 教学循环:`docs/superpowers/specs/2026-05-04-p0-observability-teaching-loop.md`
- 画布 v2:`docs/superpowers/specs/2026-05-05-canvas-v2-wordcard-design.md`
- 课后报告:`docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`
- 2026-05-05 timeNumbers 实测 + 报告 → `docs/lesson-reports/2026-05-05-eb25ad66.md`
- 2026-05-15 lesson-structure-refactor 实施 → food 三阶段课程成为唯一可见课程;旧课与旧 `LessonView` fallback 退役

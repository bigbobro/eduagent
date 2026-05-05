# EduAgent TODO

> 2026-05-05 清理版。这里是当前工作板,不是历史记录。

## 当前状态

- [x] 语音链路可用:流式 ASR / LLM / TTS 已接通。
- [x] 课堂交互可用:按住说话、Bunny 状态、字幕栏、开始/结束课堂已接通。
- [x] 教学循环 P0 已处理:ASR/TTS usage、词汇表现追踪、连续失败换策略、复习不幻觉。
- [x] 画布 v2 已落地:`cards[]` + `show_card` + `WordCardCanvas` 图文分层。
- [x] 已有两节课:`transportation`、`timeNumbers`。
- [x] `/lesson-report` 已兼容 v2 课程结构。
- [x] timeNumbers 跑过一节实测 → 报告 `docs/lesson-reports/2026-05-05-eb25ad66.md`。

## 当前阶段次序(2026-05-05 review 后)

按"内容驱动 + 最小止损"思路。先解决直接卡学习的 ASR 硬伤,再写新课暴露真实痛点,实测累积到 2-3 个 session 后再决定是否启动状态感知重构。

1. **(止损)P1 §1 ASR hot_words 注入** — 1-2 小时投入,直接解决 timeNumbers 报告里 thousand → 「官方」/ hour → 「啊我」这类阻断学习的硬伤
2. **(内容)P1 §2 写第 3 节课** — 走通现有架构产出新内容,顺带暴露架构痛点是不是真普遍
3. **(实测)再跑一节实测 + lesson-report** — 对比 timeNumbers 报告:ASR 改后命中率有没有改善、状态感知问题(提前结课 / 总结口径)是不是每节都犯
4. **(决策)** 等 2-3 个 session 报告积累后再决定:启动 P1 §3 教学循环 v1.1?启动 P1 §4 Hybrid 重构?或继续内容?

## P1 队列

1. **ASR hot words / context**
   - transportation 实测里儿童英文误识明显:`Airplane` -> `Apple` / `AirPods` 等。
   - timeNumbers 实测同样严重:`hour` -> 「啊我」/「H R O」,`thousand` -> 「官方」/「弯的房子」/「1st」(报告 §1)。
   - [x] 在 `src/lib/voice/asr-proxy.ts` 建链时把 session `targetWords` + 当前 `card_id` 关键词作为 hot_words 注入豆包请求(协议实际入口是 `request.corpus.context` JSON string 的 `hotwords`)。
   - [x] 调研豆包 ASR 中英混合 language hint:本地协议未出现 `language_hint`;`audio.language` 不传时默认支持中英文,当前保持不传。
   - [x] 加自动化回归:hotwords 注入 JSON shape 单测 + 真实 fixture 质量检查(`tests/asr-hot-words.test.ts`)。
   - [x] fixture audio 端到端回归已补:`tests/fixtures/audio/{hour,minute,thousand,one_thousand_is_ten_hundreds}.wav` 已由豆包 TTS 真实合成;`pnpm run voice:asr-hotwords` 会跑 baseline + hotwords 两组真实 ASR 并写本地报告到 `docs/lesson-reports/asr-hotwords-regression-*.json`。
   - [x] 效果验证结论:豆包热词直传本身对 `hour -> Our.`、`One thousand is ten hundreds -> 1000 is 10.` 未改善,已在 ASR final 阶段加基于当前 `cardId` 的保守纠正 fallback。当前阶段仍需第 3 节课实测验证真人儿童语音体感。

2. **写第 3 节课**
   - 主题待定(候选:animals / colors / family / food / body parts)。
   - 目标:走通现有架构产出更多教学内容,暴露架构痛点是否普遍;不开发新功能,只用现有 `cards[]` + `show_card` 接口。
   - 完成后跑 /lesson-report,与 timeNumbers 报告对比。

3. **教学循环 v1.1 — 状态感知(进度 / 收敛 / 总结)** *(gated:等 2-3 节实测后再启动)*
   - timeNumbers 实测里 LLM 不基于"已掌握"信号收敛:学生轮 14 已说对 thousand,轮 15 仍要求复读;课末总结说"已掌握 thousand"但句子层完全失败(报告 §2)。
   - 课程进度也不基于"剩余目标":定义 7 词 + 4 句共 11 个 card,实测只覆盖 3/7 词 + 1/4 句,LLM 在轮 16 仍主动 wrap up,轮 17 学生说"现在学万"被拒。
   - **gating 理由**:单节样本说服力有限,要看新课实测是不是同样症状再启动,避免基于一节课就改架构。
   - [ ] LessonController 维护 `wordMastery: Record<word, { correctCount, lastCorrectRound }>` + `cardProgress: Record<card_id, 'untouched' | 'attempted' | 'mastered'>`,作为 LLM 上下文显式传入。
   - [ ] system prompt 加规则「同一目标词 mastered 后必须切换到下一个 untouched card」,加 fixture 单测:fake「连续 2 轮 user = thousand」→ 断言下一轮 LLM 不再要求复读。
   - [ ] system prompt 加规则「`cardProgress` 中存在 untouched card 时不得使用结课话术」(防止剩 8 个 card 没教就 wrap up),加 fixture 单测验证。
   - [ ] 课末总结改为基于 `wordMastery` + `cardProgress` 实际数据生成,不交给 LLM 自由发挥(避免"掌握"口径与实际不匹配)。
   - [ ] LLM context 裁剪:平均 input 1401 tokens/轮、峰值 1636,确认/实现历史滚动窗口(如最近 6 轮 + summary),加单测断言 fake 17 轮 session 第 17 轮 input < 阈值。

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

5. **课程产出 SOP / Codex skill** *(gated:等课程数 ≥ 3 再启动)*
   - 目标:把新课产出标准化,不做 app 内动态生图。
   - 流程:课程设计 -> ImageGen 物料 -> `cards[]` 数据 -> 图片引用检查 -> 测试。
   - 图片规范:4:3 横版、主体清晰居中、不把文字烧进图片。
   - **gating 理由**:先手写第 3 节看流程啥样,再决定要不要 SOP。SOP 是产品化思路,提前做容易固化错误。

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

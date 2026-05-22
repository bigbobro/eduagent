# EduAgent TODO

> 2026-05-22 清理版。CC 绘本风 UI + 10 门常规课程铺开后,大量旧条目作废,重新对齐到 master 现状。
> 历史完成项参考 `docs/architecture.md` §9「文件演进历史」,本文件不复述。

## 下一步:实测驱动

10 门课程已就位、CC UI 已替换、教学循环 v1.1 已生效;**老师 Agent 真实表现的数据缺口大**(最近一次 `lesson-report` 在 2026-05-05,对应课程已退役)。下一步是上 1-2 节真实测,根据报告决定:

- 失败模式属于 **prompt 工程**(话术循环、收敛差、风格机械) → 调 prompt + system message,轻量迭代
- 失败模式属于 **架构层瓶颈**(首音频延迟、话术随机、token 高) → 启动下方"Hybrid 预渲染重构"

在此之前**不要**急着扩内容或改架构。

---

## 当前 backlog

### 1. Hybrid 预渲染话术架构 — LLM 退化为决策器 *(park,等实测决策)*

*2026-05-05 设计讨论产物。原触发条件是"用户基数 > 1 或 课程数 > 10"。2026-05-22 起课程数已达 10,触发条件刷新为"用户基数 > 1 或 实测报告证明老师 Agent 是体验主要瓶颈"。*

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

### 2. Actions 与 TTS 时序 *(CC 重构后需重新验证)*

旧 transportation 实测里 `show_card` 跳得比讲解快 ~3s;CC 重构后整套 UI 换成 `PictureCard` + `LessonMandalaV2`,旧观察未必成立。等实测重新出现再升级。

---

## 远期 backlog

1. **Session persistence / resume** — `sessions` 是 in-memory Map,server 重启 / 刷新会让客户端 sessionId 失效。9 分钟一节课中断概率低,真被坑了再升回当前 backlog。
2. **课程产出 Codex skill** — SOP 已稳定在 `.trellis/spec/frontend/course-authoring.md`,10 门课沿用同一模板没出问题;Codex skill 化仍未做,等触发场景再启动(用户扩展课程节奏 / 引入第二位作课者)。
3. **兴趣 / 困惑记忆** — 在词汇表现之外识别 confusion / engagement,等真实报告证明有价值再做。
4. **日志整理** — 排查开始痛苦时再加轻量 logger,不提前堆基础设施。
5. **长期语音 UX** — VAD 自动停止 / 连续对话 / WebSocket 退避重连 / 开场白 TTS 预加载。

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

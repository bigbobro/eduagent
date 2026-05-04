# EduAgent TODO

> 2026-05-05 清理版。这里是当前工作板,不是历史记录。

## 当前状态

- [x] 语音链路可用:流式 ASR / LLM / TTS 已接通。
- [x] 课堂交互可用:按住说话、Bunny 状态、字幕栏、开始/结束课堂已接通。
- [x] 教学循环 P0 已处理:ASR/TTS usage、词汇表现追踪、连续失败换策略、复习不幻觉。
- [x] 画布 v2 已落地:`cards[]` + `show_card` + `WordCardCanvas` 图文分层。
- [x] 已有两节课:`transportation`、`timeNumbers`。
- [x] `/lesson-report` 已兼容 v2 课程结构,能读出 `timeNumbers` 目标词。

## 下一道门

在这道门之前,不急着开新功能。

- [ ] **让小朋友真实跑一轮 `timeNumbers`。**
  - 目标:跑完一节正常课,不是 1-2 轮 smoke。
  - 课后找到真实 session id。
- [ ] **对真实 session 跑 `/lesson-report`。**
  - 要看到:目标词、足够轮次、ASR/TTS/LLM usage 都有意义。
  - 报告写到 `docs/lesson-reports/*.md`,默认不进 Git。
- [ ] **根据报告决定下一次实现。**
  - 如果 ASR 卡住小朋友,先做 ASR hot words / context。
  - 如果画面和语音不同步,先做 actions/TTS 时序。
  - 如果中断导致数据脏,先做 session resume / usage flush。

## P1 队列

1. **Session persistence / resume**
   - 刷新、断网、dev server 重启会中断课程。
   - 需要持久化 phase / state / 已学词汇,并能恢复最近 session。
   - usage 也要增量落盘,避免中断后报告失真。

2. **ASR hot words / context**
   - transportation 实测里儿童英文误识明显:`Airplane` -> `Apple` / `AirPods` 等。
   - 需要给 ASR 注入课程目标词和中英上下文,或做 post-ASR correction。

3. **Actions 与 TTS 时序**
   - 当前画布可能先于语音切卡。
   - 简单方案:等当前 TTS 片段结束后再触发 `show_card`。
   - 进阶方案:跟随 TTS sentence event 分句触发。

4. **音色定档**
   - 当前 `zh_female_tianmei` 仍是占位。
   - 需要试听并确定默认儿童友好音色。

5. **画布细节优化**
   - 图片 loading 态。
   - 卡片切换动画。
   - 小朋友实测后再决定是否换中文字体。

## P2 队列

1. **课程产出 SOP / Codex skill**
   - 目标:把新课产出标准化,不做 app 内动态生图。
   - 流程:课程设计 -> ImageGen 物料 -> `cards[]` 数据 -> 图片引用检查 -> 测试。
   - 图片规范:4:3 横版、主体清晰居中、不把文字烧进图片。

2. **兴趣 / 困惑记忆**
   - 在词汇表现之外,再识别 confusion / engagement。
   - 等真实报告证明有价值后再做。

3. **日志整理**
   - 只有当日志排查开始痛苦时,再加轻量 logger。
   - 现在不提前堆基础设施。

4. **长期语音 UX**
   - VAD 自动停止。
   - 连续对话模式。
   - WebSocket 重连退避。
   - 开场白 TTS 预加载。

## 已完成记录

- 语音管线:`docs/voice-benchmarks.md`
- P0 教学循环:`docs/superpowers/specs/2026-05-04-p0-observability-teaching-loop.md`
- 画布 v2:`docs/superpowers/specs/2026-05-05-canvas-v2-wordcard-design.md`
- 课后报告:`docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`

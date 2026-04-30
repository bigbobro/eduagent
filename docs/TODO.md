# EduAgent TODO — 下次开发任务

## 1. 补全 Spec 遗留功能

- [ ] **词汇表现追踪** — 在 session.ts 中实现 markWordCorrect/Incorrect,每次学生说完后判断是否涉及目标词汇,写入 word_performance 表
- [ ] **完整兴趣信号检测** — 增强 memory.ts 的兴趣检测逻辑,识别更多信号类型(confusion、engagement),在 prompt 中注入更丰富的兴趣上下文
- [ ] **logger.ts** — 创建独立日志模块,统一日志格式,支持控制台 + SQLite 双输出
- [ ] **generate 的 state_update 记录** — LLM 生成新内容时,在结构化输出中记录 generated_content 字段

## 2. 画布交互优化

- [ ] **focus 动画时长** — 当前高亮/圆圈动画 2 秒自动消失太快,小朋友来不及看。改为:动画保持直到下一次 focus 或 show 切换
- [ ] **focus 视觉效果** — 线框一瞬间就过去,需要更明显的视觉反馈。改进:放大动画更平滑,发光效果更持久,加文字标签
- [ ] **annotate 持久性** — annotate 标记应该保持在画面上直到被清除,而不是随 focus 一起消失
- [ ] **图片切换动画** — show 切换时的过渡动画可以更生动(缩放+淡入,而不是简单淡入)

## 3. AI 图片生成(generate 工具)

- [ ] **接入图片生成 API** — 使用 ChatGPT 5.3 / Codex 模型生成教学图片(需要提供新的 Base URL 和 API Key)
- [ ] **实现 generate 工具** — LLM 在教学过程中可以请求生成新图片(如学生问"竹筏是不是船",AI 生成竹筏图片)
- [ ] **图片缓存策略** — 生成的图片需要缓存,避免重复生成
- [ ] **动态课程内容** — 根据学生兴趣动态扩展课程图片库

## 4. 语音延迟优化(已完成 — 2026-05-01)

- [x] **流式 TTS** — 接入豆包 `seed-tts-2.0` bidirection,边合成边播
- [x] **流式 LLM** — MiMo `chat/completions` stream:true,SpeechExtractor 状态机解析
- [x] **流式 ASR** — 接入豆包 `bigmodel_async` 双向流式
- [x] **并行处理** — speech-delta 实时推 TTS,actions 等 JSON 完整后才发出

实测延迟基线见 `docs/voice-benchmarks.md`。

后续可继续优化:
- [ ] **音色微调** — 在 seed-tts-2.0 列表里挑选 / 试音色,确定最佳儿童友好女声(当前占位 `zh_female_tianmei`)
- [ ] **WebSocket 重连退避** — 当前只重连一次,可加指数退避
- [ ] **服务端 VAD 兜底** — 万一回声消除不彻底,再加一道
- [ ] **预加载开场白 TTS** — 利用豆包 cache 让首句几乎零延迟

## 5. 录音交互优化(已完成 — 2026-05-01)

- [x] **按住说话** — 桌面空格键 + 平板触屏按钮,实现 push-to-talk
- [x] **视觉反馈** — Bunny SVG 角色,4 个状态对应 idle/listening/thinking/speaking,纯 CSS 动画

后续可继续优化:
- [ ] **VAD 自动停止** — 当前依赖用户主动松手,后续可加静音检测兜底(防止小朋友按住不放)
- [ ] **连续对话模式** — Awaiting 时自动开始监听,无需手动按住

## 优先级

| 优先级 | 任务 | 原因 |
|--------|------|------|
| P0 | 真实环境 E2E 验收(spec §11.3 12 项) | 还没人工跑过完整一轮课堂 |
| P1 | 音色微调 | `zh_female_tianmei` 是占位,需要试听后定档 |
| P1 | 画布交互优化 | 视觉反馈不足 |
| P1 | 补全遗留功能 | Spec 完整性 |
| P2 | AI 图片生成 | 需要额外 API,功能扩展 |

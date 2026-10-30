# EduAgent TODO

> 只记现行待办。2026-10-30 之前的历史快照、旧决策树、全量 review 原文和已完成记录原样存放在 [`docs/archive/TODO-history.md`](archive/TODO-history.md);完成的事项从本文件删除,细节以 `docs/architecture.md` 和 git log 为准。

## Realtime 自然对话课堂 · 真人验收(2026-10-29)

源码已实现并通过自动化与合成语音真实服务验证(见 architecture.md「Realtime 自然对话课堂」、voice-benchmarks.md)。仍需真人课确认:
- 孩子真实发音、停顿习惯下 `semantic_vad` eagerness `low` 是否抢话或等太久;不合适再按证据调。
- 实体扬声器外放时浏览器 AEC 是否会让老师自己的声音触发打断(自动化没有物理回声)。
- 观察服务端 `speech before tool` 日志,确认工具先行在真实课里仍成立。
- 成本(2026-10-30 已做缓存友好改动,未做付费对比):读该课 `lesson_logs.token_usage.realtime`,按输入文本/音频、缓存命中、输出文本/音频拆分费用,算每分钟成本与缓存命中率;同时确认状态改为 `[app] State` 消息后,模型仍按当前屏幕和剩余目标教学。若一节课接近上下文窗口,再按数据决定是否设 `token_limits.post_instructions`。
- 打包:2026-10-30 已从当前源码本地打包并安装到开发机(版本号仍为 0.1.0,未发布 Release)。对外发布前需升版本号、重新打包与验收。

## Mac 桌面版后续(2026-10-24)

- **Windows 版**：后续单独验证打包、权限、签名和安装流程，目前只交付 Mac arm64。
- **自动更新**：当前由家长手动下载覆盖安装，更新服务和校验机制未实现。
- **课程包独立下载**：当前课程和图片随 App 发布，后续再评估按需下载与版本管理。
- **设置页申请指引 URL 待核实**：核实火山引擎豆包语音、SiliconFlow 当前控制台入口和开通步骤，再补真实截图。
- **Intel 版：按需再做**。用户决定当前只提供 Apple 芯片 arm64；将来在 x64 环境重新 next build，验证 SWC/esbuild 依赖、打包 App 冒烟和 Intel Mac 安装流程。
- **真机安装与截图**：另一台 Mac 下载后验证 Gatekeeper 放行、首次麦克风授权、真实 Key 上课，以及覆盖安装后的数据和授权保留。README 已标注真实截图待补位置，自动化截图不替代系统弹窗证据。

## 仍开的工程项(摘自 2026-06-15 全量 review)

> 以下条目从归档原文搬来,只保留当时标为未完成或 park 的项;文中的行号和描述停留在 2026-06/07,动手前先按内容重新定位并核实是否仍成立。

- **logger 迁移收尾 + 降噪** · medium — 结构化 logger 调用方仍少;`memory.ts` 的 `normalizeAssistantActions` 每轮无条件 `console.log('[normalize] snapshot', ...)`,违反"验收后删打点"。二选一并 gate 热路径日志。
- **graceful shutdown / session 淘汰** · low — `server.ts` 没有 SIGTERM/SIGINT handler(WAL 不 checkpoint);in-memory session 无淘汰。
- **Next.js 15 升级** · 🅿️ park(2026-07-20) — 14.x 的 high CVE 只在 15.x 修;单用户纯本地无外部可达面,恢复条件 = 对外发布 / 多用户。届时当独立任务做(custom server + framer-motion transpile)。
- **孩子语音转写永久明文留存** · 🅿️ park(2026-07-20) — 每轮写 ASR 原文进 SQLite,无删除 / TTL / 清理。加保留策略 + "清除历史"入口。
- **Agent 护栏机制**(2026-06-25 用户定为重点,design-first) — 内容安全、孩子意图请求的准许策略、行为准则三层;先写 PRD + design 再动代码。原文针对旧模式(LLM 流式 speech 直达 TTS);Realtime 模式下由工具回执约束状态,但内容安全同样未审核,启动时两种模式一起设计。
- **其它** · P3 — 无 CSP / Permissions-Policy;SQLite 无备份 / 损坏恢复;错误只进本地日志无遥测;`/api/chat` 无 rate-limit。
- **P3 维护性**(改到对应文件时顺手清) — 手写 emitter ×4、`safeParse` ×2、`markWordCorrect/Incorrect` 重复、assistant-history-as-prose、`PcmPlayer.dispose` 不 await stop、`buildPromptInput` 每轮算两次、未文档化的 `NEXT_PUBLIC_DOUBAO_TTS_DEFAULT_SPEAKER`。

## 旧模式(豆包 + LLM 按住说话)待观察

- **"没听清重讲" 0.8s 内重复触发**(2026-07-03,未排期) — 真人课 session `1b096ae7` n=44/45 同一重介绍触发两次。危害小,下次真人课复现再升级;入口是 client 重讲触发链路。
- **句子热词注入实战验证**(2026-07-04) — 当天 quiz 只到 q3,repeat-after-me 句子跟读识别率仍待真人课确认。
- **park 方向**:Prompt / latency optimization v2、Hybrid 预渲染话术架构、Agentness vs Content 的实测决策路径,原文见归档。只有真实报告证明旧模式的话术质量、成本或延迟是主瓶颈时才启动。

## 远期 backlog

1. **课程产出自动化** — 造课 SOP 已在本地 agent 工作流中稳定;公开仓库先不提交 agent 过程文件,等扩展课程节奏或引入第二位作课者时再决定是否产品化。
2. **兴趣 / 困惑记忆** — 在词汇表现之外识别 confusion / engagement,等真实报告证明有价值再做。
3. **长期语音 UX** — VAD 自动停止 / 连续对话 / WebSocket 退避重连 / 开场白 TTS 预加载。Realtime 模式已实现常开麦连续对话(2026-10-29);此项剩余部分针对旧模式。

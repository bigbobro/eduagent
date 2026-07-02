# 语音管线性能基线

**测量时间:** 2026-05-01(实施验收 v1)
**环境:** 本地 macOS,Wi-Fi,Chrome 最新版,默认 Mac 麦克风。
**测量方法:** 跑了 18 轮真实 push-to-talk(用户人工按住空格说话),`LessonController` 内插 `[bench]` 打点输出到浏览器 Console。其中 4 轮(r7/r10/r11/r18)因按住时间过短(< 1.2 秒)豆包没识别出 utterance、final 帧没回来,被 9 秒 timeout 兜底救回 — 这 4 轮不计入延迟统计,实际有效轮 14 个。

## 实测(14 轮成功,本批数据采集时尚未开 mic 预热)

| 指标 | 目标 | 实测中位 | 实测 90 分位 | 备注 |
|------|------|---------|--------------|------|
| 用户松手 → ASR final | < 500ms | 594ms | 650ms | 接近目标,后续 mic 预热应进一步降 |
| ASR final → LLM 第一句 token | < 1s | 3976ms | 4520ms | **严重超目标**,MiMo 上游 first-token 慢 |
| LLM 第一句 token → TTS 首 PCM 包 | < 500ms | ~2200ms | ~2700ms | 流式 JSON 解析到 speech 字段后才能 push TTS |
| **首音频总延迟** | **< 2s** | **6212ms** | **7220ms** | **严重超目标**,LLM 是瓶颈 |
| 5 轮平均 round-trip | < 3s | 8860ms | 9742ms | round-trip 含 AI 说话整段时长,不是单纯首响指标 |

> **结论:** 用户提出的 P0 问题"按住空格说话头几个字录不上"已经定位为 mic 启动延迟(getUserMedia + worklet + WS 串行 ≈ 200-500ms),已加 prewarm 修复;录音过短(< 1s)被豆包丢弃的情况靠客户端 9 秒 timeout 兜底自动恢复。

> **下一步:** 首音频 6 秒主要被 MiMo first-token(4 秒)拖累,前端再优化也只能省几百 ms。要么:① 换更快的 LLM 模型;② prompt 改造让 LLM 强制最先吐 speech 字段(目前依赖状态机解析 — 如果 LLM 先吐 actions/state_update,SpeechExtractor 要等到 speech 字段才 emit,首字延迟更大);③ 客户端在 thinking 状态播一句"嗯..."占位音遮蔽延迟。
>
> **2026-06-21 更新:③ 占位音已停用。** 实测发现本地预渲染「嗯,让老师看看哦~」会在 ASR/LLM/TTS 正常运行时插入,听感像系统没检测到孩子发音,因此 `LessonController` 不再 fetch 或 enqueue `public/audio/thinking-filler.pcm`。真正减延迟仍需 ① 换更快模型或重构。
> **ASR `end_window_size`(800ms)未改:** 本项目 push-to-talk 在松手时发 `finish` 负序号控制帧强制终结,不依赖豆包静音窗口自动终结,故 `end_window_size` 不 gate 我们的延迟,降它是 no-op(还会影响潜在的自动终结路径),因此保持不动。

## 已观测到的固定延迟

(从代码内自然产生的、不需要测量的延迟,记录在此供 troubleshooting 用)

| 项 | 数值 | 来源 |
|----|------|------|
| 豆包 TTS WS 首次握手(ConnectionStarted) | ~3.7s | 代码 smoke test 实测,首课加载时承担一次,长连后续轮复用 |
| MiMo SSE 首字延迟 | ~4s | 14 轮人工实测中位,MiMo 模型负载相关,我们改不了 |
| AudioWorklet 200ms PCM 分包 | 200ms 上界 | 设计参数,豆包文档建议值 |
| PcmPlayer 启动缓冲 | 20ms | `Math.max(nextStartTime, currentTime + 0.02)` |
| 豆包 ASR final 帧返回 | 200-500ms | 收到 -seq 终止包后,豆包做完最后识别才推 final |

## 14 轮原始数据

(人工跑测,Console 打点,2026-05-01 20:39 - 20:46)

| 轮 | release(秒) | asr_final | llm_first_token | first_pcm | round_trip | 备注 |
|---|---|---|---|---|---|---|
| 1 | 32.6 | 594 | 4031 | 6365 | 9223 | "飞机、自行车,还有火车。" |
| 2 | 68.8 | 550 | 3921 | 5854 | 7982 | "小汽车。Car。Car." |
| 3 | 92.4 | 554 | 3919 | 6028 | 8747 | "车 bus。bus 公交车 bus。" |
| 4 | 116.7 | 594 | 4311 | 6615 | 9742 | "火车。The train." |
| 5 | 141.3 | 650 | 4100 | 6530 | 9682 | "火车好像没有声音吧?" |
| 6 | 166.7 | 609 | 4520 | 7220 | 10872 | "声音。我做过高铁。高铁没有声音。" |
| 7 | — | timeout | — | — | — | 录音过短,被 9s timeout 兜底 |
| 8 | 212.3 | 711 | 4556 | 6814 | 8972 | "Playing." |
| 9 | 240.7 | 552 | 3790 | 5823 | 8505 | "Airplane." |
| 10 | — | timeout | — | — | — | 同 r7 |
| 11 | — | timeout | — | — | — | 同 r7 |
| 12 | 281.1 | 533 | 3824 | 6199 | 9001 | "Bicycle." |
| 13 | 304.4 | 540 | 3912 | 6224 | 8064 | "Go! Go, go!" |
| 14 | 326.5 | 598 | 5266 | 7542 | 9378 | "船 boat。" |
| 15 | 355.9 | 534 | 3866 | 6005 | 6874 | "我没有看见。" |
| 16 | 374.1 | 503 | 3769 | 5814 | 7658 | "汽车。" |
| 17 | 402.3 | 638 | 4100 | 6113 | 6791 | "哪一个?我没看到。" |
| 18 | — | timeout | — | — | — | 同 r7 |

## 测量打点位置(已删除)

`src/lib/voice/lesson-controller.ts` 的 `[bench]` 打点代码(`benchTRelease/benchRound/benchFirstTokenLogged/benchFirstPcmLogged/benchRoundTripLogged` 5 个字段 + 4 处 console.log)在验收完成后已经删除。后续如要做"优化前/后"对比,可参考 git 历史中"删除 [bench] 打点"那个 commit 的父 commit 恢复 — 用 `git log --oneline --grep='bench'` 查。

## 备注

- 跑测时关闭其他大流量应用(避免网络抖动)。
- 第一次 round-trip 因为 TTS WS 还没有 cache,可能比第 2 轮起慢 ~200ms。本批 r1 已包含 TTS 长连握手(~3.7s 的 ConnectionStarted),开场白阶段已经握手完,r1 之后没再 ConnectionStarted。
- 失败原因(timeout 4 次)分析:豆包 ASR 在收到 PCM < ~10 个包(< 2 秒)时,识别置信度不够,utterance 全部 `definite=false`,即使我们发了负序号终止包,豆包仍不返回 isFinal=true 的帧 → 客户端 9 秒 timeout 兜底。**用户体感:这种情况下小朋友按下立即松开 / 按下还没说话就松开,系统会"卡 9 秒后让你再说一次"**。本身不是 bug,是产品体验,后续可考虑 stopListening 时检测录音时长 < 500ms 直接 fallback、不进 thinking。

---

# LLM 供应商切换后基线(SiliconFlow DeepSeek-V4-Pro,2026-07-02)

**背景:** LLM 从 MiMo(mimo-v2.5-pro)切换为 SiliconFlow `deepseek-ai/DeepSeek-V4-Pro`(OpenAI 兼容 chat/completions)。本批不是完整语音链路实测,是两组服务端测量,浏览器端 push-to-talk 全链路待下次真人课补测。

## 直连探针(scratchpad llm-probe,短 prompt,3 轮)

| 轮 | first token | 整轮 | JSON 解析 | usage |
|----|------------|------|-----------|-------|
| 1 | 4376ms | 5610ms | OK | 92/76 |
| 2 | 3489ms | 4710ms | OK | 92/107 |
| 3 | 2786ms | 4195ms | OK | 92/113 |

兼容性:SSE 流式(含 `[DONE]`)/ `response_format: json_object` / `stream_options: include_usage` 全部支持。

## 真实课堂 smoke(`SMOKE_BASE=:3001 pnpm smoke:lesson`,真实 system prompt,11 步)

- 每步总耗时(含路由 + guard + SSE 消费):4.5s ~ 14.2s,中位 ~7.3s
- 对比 MiMo 时代整轮 ~6s:**DeepSeek-V4-Pro 生成段更慢、输出更长,尾部(~1/10 轮)可超 15s**
- 因此 LLM 服务端总超时 15s → **20s**,client chatWatchdog 20s → **25s**(超时误杀正常轮变成 SSE error,孩子白等一轮)
- 三次 smoke:修复 sentence 卡劫持 bug 前 2/11;修复后 10/11(1 轮 15s 超时误杀);上调超时后 **11/11 + UI 2/2**

**体感注意:** 孩子等待老师响应的时间比 MiMo 时代更长(中位 ~7s vs ~6s,尾部可到 14s+)。如实际课堂体感不可接受,候选动作:换更快的模型(改 `.env.local` 的 `LLM_MODEL` 即可)/ prompt 约束 speech 更短 / 恢复 thinking 占位音。

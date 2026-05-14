# EduAgent — 儿童英语教学 Agent

AI 驱动的多模态教学系统:豆包流式 ASR / TTS + MiMo LLM 大脑 + 画布交互。

## 架构

```
浏览器                                  Next.js 自定义 server                     上游
┌─────────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│ AudioWorklet PCM    │── WS ──▶│ ASR proxy            │── WS ──▶│ 豆包流式 ASR     │
│ HoldToTalkButton    │         │ /api/voice/asr       │         └─────────────────┘
│ LessonController    │◀─ SSE ─│ /api/chat            │── HTTP ▶│ MiMo LLM        │
│ PCM Player          │── WS ──▶│ TTS proxy            │── WS ──▶│ 豆包流式 TTS     │
└─────────────────────┘         │ /api/voice/tts       │         └─────────────────┘
                                └──────────────────────┘
```

设计 spec(历史快照):`docs/superpowers/specs/2026-05-01-voice-pipeline-doubao-design.md`
实施计划(历史快照):`docs/superpowers/plans/2026-05-01-voice-pipeline-doubao.md`
**当前架构事实文档(living doc)**:`docs/architecture.md` ← 想了解 master 上系统现状看这个
**项目协作规则**:`/CLAUDE.md`

## 关键模块

| 文件 | 职责 |
|------|------|
| `server.ts` | 自定义 Next.js server,接管 WebSocket upgrade |
| `src/lib/voice/doubao-codec.ts` | 豆包二进制协议编解码(ASR + TTS 共用) |
| `src/lib/voice/asr-proxy.ts` | 服务端 ASR WebSocket 代理 |
| `src/lib/voice/tts-proxy.ts` | 服务端 TTS WebSocket 代理(长连复用) |
| `src/lib/voice/lesson-controller.ts` | 浏览器侧调度器,统一编排 ASR + SSE + TTS |
| `src/lib/voice/phased-lesson-controller.ts` | 三阶段外层状态机,复用 LessonController 音频管线 |
| `src/lib/agent/speech-extractor.ts` | 流式 JSON `speech` 字段提取器 |
| `src/lib/agent/orchestrator.ts` | 把 streamUserInput 包成 SSE ReadableStream |
| `src/data/courses/food.ts` | 当前唯一可见 food 三阶段课程 |
| `src/components/lesson/PhasedLessonView.tsx` | 导入 / 互动 / 巩固三阶段课堂入口 |
| `src/lib/audio/recorder.ts` | getUserMedia + AudioWorklet PCM 录音器 |
| `src/lib/audio/pcm-player.ts` | Web Audio 流式 PCM 播放队列 |
| `public/worklets/pcm-recorder.worklet.js` | AudioWorklet 处理脚本 |

## 依赖

- Next.js 14、TypeScript、Tailwind、Framer Motion
- `ws`(自定义 server WebSocket)
- `tsx`(dev/start runner — Next.js App Router 不支持 WS upgrade,所以走自定义 server)
- `dotenv`(预加载 .env.local)
- `better-sqlite3`(课程日志)
- `vitest`、`jsdom`、`@testing-library/react`(测试)

`fluent-ffmpeg` 不再使用(AudioWorklet 直接出 PCM,不需要 webm→wav 转换)。

## 环境变量

复制 `.env.example` 为 `.env.local`,填入真实凭据:

```bash
cp .env.example .env.local
```

需要的变量:
- `MIMO_BASE_URL`、`MIMO_API_KEY`(LLM)
- `DOUBAO_APP_ID`、`DOUBAO_ACCESS_KEY`、`DOUBAO_ASR_RESOURCE_ID`、`DOUBAO_TTS_RESOURCE_ID`、`DOUBAO_TTS_DEFAULT_SPEAKER`
- 可选:`VOICE_MOCK=true`(本地无网络也能跑全流程,LLM/ASR/TTS 全部用 Mock)

## 运行

```bash
pnpm install
pnpm run dev   # 自定义 server,WebSocket upgrade 可用
```

打开 http://localhost:3000

`pnpm run dev` 走 `tsx watch server.ts`,不走 `next dev`(后者不支持 WebSocket upgrade)。

## 测试

```bash
pnpm test       # vitest 单测
```

主要单测:
- `src/lib/voice/doubao-codec.test.ts` — 二进制协议(10 tests)
- `src/lib/agent/speech-extractor.test.ts` — 流式 JSON 提取(9 tests)
- `src/hooks/useSpacebar.test.ts` — 空格键(8 tests)

## 性能基线

见 `docs/voice-benchmarks.md`。

## 关键约束

- **密钥不出服务端。** 任何 `NEXT_PUBLIC_*` 前缀的豆包/MiMo 密钥都是 PR review 一票否决。
- **Push-to-talk 单一交互。** 不做撤回,不做长按短按区分,简化优先于边界 case。
- **TTS 长连复用 / ASR 按轮建连。** 详见 spec §3.6 / §4.2。

# EduAgent - 儿童英语教学 Agent / Children's English Teaching Agent

EduAgent 是一个本地浏览器里的多模态儿童英语教学原型。它把浏览器端
push-to-talk 交互、Next.js 自定义 server、豆包流式 ASR/TTS、MiMo LLM
和 SQLite 课堂日志串成一个可迭代的 teacher-agent 实验环境。

EduAgent is a local-browser prototype for a multimodal English teaching agent
for children. It combines browser push-to-talk interaction, a custom Next.js
server, Doubao streaming ASR/TTS, a MiMo LLM teacher loop, and SQLite lesson
logs into one iteration-friendly teaching-agent workspace.

> 当前项目定位 / Current scope:
> This is a local development prototype. It is not a hosted production service,
> mobile app, multi-user platform, or hardened auth product.

## 中文说明

### 架构概览

```text
浏览器                                  Next.js 自定义 server                     上游
AudioWorklet PCM ── WS ───────────────> ASR proxy /api/voice/asr ── WS ───────> 豆包流式 ASR
LessonController <── SSE ───────────── /api/chat ──────────────── HTTP ──────> MiMo LLM
PCM Player ─────── WS ────────────────> TTS proxy /api/voice/tts ── WS ───────> 豆包流式 TTS
                                           |
                                           v
                                      SQLite 课堂日志
```

为什么有自定义 server：Next.js App Router 本身不处理 WebSocket `upgrade`
事件，所以 `server.ts` 接管 HTTP server，并把 ASR/TTS WebSocket 请求转给
对应 proxy。

当前架构事实文档：[`docs/architecture.md`](docs/architecture.md)。

### 关键模块

| 文件 | 职责 |
|------|------|
| `server.ts` | 自定义 Next.js server，分发 WebSocket upgrade |
| `src/app/api/chat/route.ts` | 课堂 chat / phase-transition / quiz / end API |
| `src/lib/agent/session.ts` | 课堂 session、LLM 流、guard pipeline、课堂日志提交 |
| `src/lib/agent/session-store.ts` | 活动课堂 session 存储边界，默认进程内存储 |
| `src/lib/agent/guards/` | 服务端 show_card / speech 安全归一化 pipeline |
| `src/lib/voice/asr-proxy.ts` | 服务端 ASR WebSocket 代理 |
| `src/lib/voice/tts-proxy.ts` | 服务端 TTS WebSocket 代理，长连复用 |
| `src/lib/voice/lesson-controller.ts` | 浏览器侧 ASR + SSE + TTS 调度器 |
| `src/lib/voice/phased-lesson-controller.ts` | 三阶段课程状态机 |
| `src/lib/db/schema.ts` | SQLite migration runner |
| `src/lib/db/queries.ts` | SQLite 写入封装 |
| `src/data/courses/` | 课程定义，目前 registry 中有 30 门主题课 |
| `public/images/` | 课程图片素材 |

### 依赖

- Next.js 14、React 18、TypeScript、Tailwind CSS、Framer Motion
- `ws`：自定义 server 的 WebSocket 支持
- `tsx`：本地 dev/start runner
- `better-sqlite3`：本地课堂日志
- Vitest、jsdom、Testing Library：测试

### 环境变量

复制 `.env.example` 为 `.env.local`，再填入真实凭据：

```bash
cp .env.example .env.local
```

需要的变量：

- `MIMO_BASE_URL`
- `MIMO_API_KEY`
- `DOUBAO_APP_ID`
- `DOUBAO_ACCESS_KEY`
- `DOUBAO_ASR_RESOURCE_ID`
- `DOUBAO_TTS_RESOURCE_ID`
- `DOUBAO_TTS_DEFAULT_SPEAKER`

可选：

- `VOICE_MOCK=true`：本地无网络或无真实 provider 凭据时，用 mock 跑通主要流程。

密钥必须只保存在服务端环境变量中。不要把任何真实密钥写入源码、README、issue、
日志、commit message 或 PR 描述。

### 运行

```bash
pnpm install
pnpm run dev
```

打开 <http://localhost:3000>。

`pnpm run dev` 使用 `tsx watch server.ts`，不是 `next dev`，因为本项目需要自定义
WebSocket upgrade 处理。

### 测试

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm run smoke
```

如果修改了 `src/lib/agent/**`、`src/lib/voice/**` 或
`src/app/api/chat/route.ts`，还需要跑：

```bash
pnpm smoke:lesson
```

### 图片和素材来源

当前课程图片为本项目使用 ChatGPT image generation 生成的素材，不是从在线图库或
第三方网站复制的图片。公开仓库中保留这些图片用于演示和本地教学原型。

### 安全

安全策略见 [`SECURITY.md`](SECURITY.md)。核心原则：

- Provider 密钥只在服务端读取。
- 不使用 `NEXT_PUBLIC_*` 暴露 MiMo 或 Doubao 密钥。
- `.env.local`、本地 SQLite runtime DB 和私有 lesson reports 不应提交。
- 本项目当前不是生产级多用户托管服务。

### License

本项目使用 Apache License 2.0。详见 [`LICENSE`](LICENSE)。

## English

### Architecture

```text
Browser                                Custom Next.js server                    Providers
AudioWorklet PCM -- WS --------------> ASR proxy /api/voice/asr -- WS -------> Doubao streaming ASR
LessonController <-- SSE ------------- /api/chat ---------------- HTTP ------> MiMo LLM
PCM Player ------ WS ----------------> TTS proxy /api/voice/tts -- WS -------> Doubao streaming TTS
                                          |
                                          v
                                     SQLite lesson logs
```

The project uses a custom server because Next.js App Router does not own the
WebSocket `upgrade` flow needed by the ASR/TTS proxies.

The current architecture reference is [`docs/architecture.md`](docs/architecture.md).

### Key Modules

| Path | Responsibility |
|------|----------------|
| `server.ts` | Custom Next.js server and WebSocket upgrade routing |
| `src/app/api/chat/route.ts` | Lesson chat, phase transition, quiz, and end actions |
| `src/lib/agent/session.ts` | Session flow, LLM streaming, guard pipeline, and durable log commits |
| `src/lib/agent/session-store.ts` | Active session storage boundary, currently in memory |
| `src/lib/agent/guards/` | Server-side speech/action safety normalization |
| `src/lib/voice/asr-proxy.ts` | Server-side ASR WebSocket proxy |
| `src/lib/voice/tts-proxy.ts` | Server-side TTS WebSocket proxy with connection reuse |
| `src/lib/voice/lesson-controller.ts` | Browser-side ASR + SSE + TTS orchestration |
| `src/lib/voice/phased-lesson-controller.ts` | Three-phase lesson state machine |
| `src/lib/db/schema.ts` | SQLite migration runner |
| `src/lib/db/queries.ts` | SQLite write helpers |
| `src/data/courses/` | Course definitions, currently 30 themed courses |
| `public/images/` | Course visual assets |

### Environment

Copy `.env.example` to `.env.local` and fill in your own provider credentials:

```bash
cp .env.example .env.local
```

Required variables:

- `MIMO_BASE_URL`
- `MIMO_API_KEY`
- `DOUBAO_APP_ID`
- `DOUBAO_ACCESS_KEY`
- `DOUBAO_ASR_RESOURCE_ID`
- `DOUBAO_TTS_RESOURCE_ID`
- `DOUBAO_TTS_DEFAULT_SPEAKER`

Optional:

- `VOICE_MOCK=true`: run the main local flow with mock LLM/ASR/TTS behavior.

Keep all real credentials server-side. Do not paste real secrets into source
files, docs, issues, logs, commit messages, or pull request descriptions.

### Run Locally

```bash
pnpm install
pnpm run dev
```

Open <http://localhost:3000>.

### Test

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm run smoke
```

If you change `src/lib/agent/**`, `src/lib/voice/**`, or
`src/app/api/chat/route.ts`, also run:

```bash
pnpm smoke:lesson
```

### Assets

The current course images were generated for this project with ChatGPT image
generation. They were not copied from online image libraries or third-party
websites.

### Security

See [`SECURITY.md`](SECURITY.md). In short:

- Provider secrets are read only by server-side code.
- MiMo and Doubao secrets must not be exposed through `NEXT_PUBLIC_*`.
- `.env.local`, runtime SQLite databases, and private lesson reports should not
  be committed.
- This repository is a local prototype, not a hardened hosted multi-user service.

### License

Apache License 2.0. See [`LICENSE`](LICENSE).

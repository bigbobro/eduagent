# 语音管线迭代实施计划 — 接入豆包流式 ASR / TTS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用字节豆包流式 ASR + 流式 TTS 替换 MiMo 的非流式 ASR/TTS,把端到端首音频延迟从 ~12s 降到 ~2s,并把录音交互改造为"按住说话"。MiMo LLM 保留,改为 SSE 流式。

**Architecture:** 混合架构 —— 浏览器(AudioWorklet/Web Audio)↔ 服务端代理(自定义 Next.js server, WebSocket upgrade)↔ 豆包(ASR/TTS) + MiMo(LLM)。三条通路独立(ASR/LLM/TTS),浏览器不持有任何上游密钥;服务端用 `StreamingSpeechExtractor` 从 LLM JSON token 流中边解析边把 speech 字段推给前端,actions 数组等 JSON 完整后一次性发出。

**Tech Stack:** Next.js 14(App Router + 自定义 server)、TypeScript、`ws`(WebSocket)、`tsx`(dev/start runner)、Web Audio API + AudioWorklet(浏览器音频)、SSE(LLM 流式响应)、vitest(单测)。

**Spec source:** `docs/superpowers/specs/2026-05-01-voice-pipeline-doubao-design.md`(全部设计决策来自这份 spec,实施时不要二次发明)

---

## File Structure (本次新增 / 修改 / 删除汇总)

### 新增

```
server.ts                                         # 自定义 Next.js server
tsconfig.server.json                              # server.ts 编译配置
.env.example                                      # 环境变量模板
public/worklets/pcm-recorder.worklet.js           # AudioWorklet 处理脚本(纯 JS)
src/lib/voice/doubao-codec.ts                     # 二进制协议编解码
src/lib/voice/doubao-codec.test.ts                # 编解码单测
src/lib/voice/asr-proxy.ts                        # 服务端 ASR WS 代理
src/lib/voice/tts-proxy.ts                        # 服务端 TTS WS 代理
src/lib/voice/asr-client.ts                       # 前端 ASR 客户端
src/lib/voice/tts-client.ts                       # 前端 TTS 客户端
src/lib/voice/lesson-controller.ts                # 调度器(ASR + SSE + TTS)
src/lib/agent/speech-extractor.ts                 # 流式 JSON speech 字段提取器
src/lib/agent/speech-extractor.test.ts            # 提取器单测
src/lib/agent/orchestrator.ts                     # SSE 编排器
src/lib/audio/recorder.ts                         # getUserMedia → WS 录音器
src/lib/audio/pcm-player.ts                       # 流式 PCM 播放队列
src/components/lesson/HoldToTalkButton.tsx        # 按住说话按钮
src/components/lesson/Bunny.tsx                   # SVG 兔子动画
src/hooks/useSpacebar.ts                          # 空格键 hook
src/hooks/useSpacebar.test.ts                     # 空格键 hook 单测
docs/voice-benchmarks.md                          # 延迟基线记录
```

### 修改

```
package.json                       # 加 ws/tsx 依赖,改 dev/start 脚本
tsconfig.json                      # 把 server.ts 排除出 next 编译
src/lib/init.ts                    # 加豆包 env 校验
src/lib/mimo/llm.ts                # 加流式接口 streamLLM(systemPrompt, messages)
src/lib/agent/session.ts           # processUserInput → streamUserInput(async generator)
src/lib/agent/memory.ts            # state_update commit 时机调到 actions 之后
src/app/api/chat/route.ts          # 改为 SSE
src/components/lesson/LessonView.tsx           # 全面重写,接 LessonController
src/components/lesson/SubtitleBar.tsx          # 加 source: 'user'|'ai',支持 partial
.gitignore                         # 加 .env.local 入忽略(若已存在则确认)
README.md                          # 更新依赖、env、运行方式
docs/TODO.md                       # 勾掉 P0
```

### 删除

```
src/lib/mimo/asr.ts                # 由豆包 ASR 替代
src/lib/mimo/tts.ts                # 由豆包 TTS 替代
src/lib/audio/convert.ts           # AudioWorklet 直接出 PCM,不再 webm→wav
src/app/api/audio/route.ts         # ASR/TTS 都走 WS
src/components/lesson/RecordButton.tsx         # 由 HoldToTalkButton 替代
```

---

## 项目根目录约定

工作目录绝对路径(含空格):

```
/Users/hushaobo/ROOTCLOUD/new solulu/eduagent
```

执行任何 shell 命令前,先 cd 到这里:

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
```

包管理器使用 `pnpm`(项目已有 `pnpm-lock.yaml`)。

---

# Phase 1: 基础设施

## Task 1: 添加依赖、环境变量模板、env 校验

**Files:**
- Modify: `package.json`(加依赖)
- Create: `.env.example`
- Modify: `.env.local`(本地真实凭据,不入库)
- Modify: `src/lib/init.ts`(加豆包变量校验)
- Modify: `.gitignore`(确认 `.env.local` 在内)

**目标:** 所有后续任务依赖 `ws` 和 `tsx`;在启动时尽早 fail-fast 缺失的密钥。

- [ ] **Step 1: 安装新依赖**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm add ws
pnpm add -D tsx @types/ws
```

- [ ] **Step 2: 创建 `.env.example`**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/.env.example`:

```bash
# MiMo LLM
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_API_KEY=your-mimo-api-key

# 豆包语音(ASR + TTS)
DOUBAO_APP_ID=your-app-id
DOUBAO_ACCESS_KEY=your-access-key
DOUBAO_ASR_RESOURCE_ID=volc.seedasr.sauc.duration
DOUBAO_TTS_RESOURCE_ID=seed-tts-2.0
DOUBAO_TTS_DEFAULT_SPEAKER=your-speaker-id

# Mock 模式(本地无网络调试)
# VOICE_MOCK=true

# SQLite 路径
DATABASE_PATH=./db/eduagent.db
```

- [ ] **Step 3: 更新 `.env.local` 真实值**

把第 9 段 spec 里的真实凭据写入 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/.env.local`(这个文件不入库):

```bash
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_API_KEY=<MIMO_KEY_REDACTED>
DOUBAO_APP_ID=<DOUBAO_APP_ID_REDACTED>
DOUBAO_ACCESS_KEY=<DOUBAO_ACCESS_KEY_REDACTED>
DOUBAO_ASR_RESOURCE_ID=volc.seedasr.sauc.duration
DOUBAO_TTS_RESOURCE_ID=seed-tts-2.0
DOUBAO_TTS_DEFAULT_SPEAKER=zh_female_tianmei
DATABASE_PATH=./db/eduagent.db
```

> 注:`DOUBAO_TTS_DEFAULT_SPEAKER` 实施阶段从 seed-tts-2.0 列表里挑一个儿童友好女声后再改这个值。`zh_female_tianmei` 是占位,首次跑通后微调。

- [ ] **Step 4: 确认 `.gitignore` 包含 `.env.local`**

读 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/.gitignore`,确认有 `.env.local` 一行。如果没有,追加:

```
.env*.local
```

- [ ] **Step 5: 修改 `src/lib/init.ts` 加 env 校验**

替换 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/init.ts` 全文为:

```typescript
import { initDatabase } from './db/schema';

const REQUIRED_ENV = [
  'MIMO_BASE_URL',
  'MIMO_API_KEY',
  'DOUBAO_APP_ID',
  'DOUBAO_ACCESS_KEY',
  'DOUBAO_ASR_RESOURCE_ID',
  'DOUBAO_TTS_RESOURCE_ID',
  'DOUBAO_TTS_DEFAULT_SPEAKER',
] as const;

function validateEnv(): void {
  if (process.env.VOICE_MOCK === 'true') {
    // Mock 模式只需要 MIMO_*,豆包变量可以缺失
    const mockRequired = ['MIMO_BASE_URL', 'MIMO_API_KEY'];
    for (const key of mockRequired) {
      if (!process.env[key]) {
        throw new Error(`Missing env var (mock mode): ${key}. See .env.example`);
      }
    }
    return;
  }
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Missing env var: ${key}. See .env.example`);
    }
  }
}

let initialized = false;

export function ensureInitialized(): void {
  if (initialized) return;
  validateEnv();
  initDatabase();
  initialized = true;
}
```

- [ ] **Step 6: 提交**

```bash
git add .env.example .gitignore package.json pnpm-lock.yaml src/lib/init.ts
git commit -m "feat(voice): add doubao env vars and runtime validation"
```

---

## Task 2: 自定义 Next.js server(WebSocket upgrade 入口)

**Files:**
- Create: `server.ts`
- Create: `tsconfig.server.json`
- Modify: `tsconfig.json`(把 server.ts 排除出 next 类型检查)
- Modify: `package.json`(scripts)

**目标:** Next.js App Router 不支持 WS upgrade 事件,自己包一个 HTTP server 拿 `upgrade` 事件,把 `/api/voice/asr` 和 `/api/voice/tts` 路径分发到代理(代理在后续任务实现,本任务只放占位 stub)。

- [ ] **Step 1: 创建 `tsconfig.server.json`**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/tsconfig.server.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "outDir": "./.next/server-build",
    "noEmit": false,
    "jsx": "preserve",
    "isolatedModules": false
  },
  "include": ["server.ts", "src/lib/voice/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: 修改 `tsconfig.json` 排除 server.ts**

打开 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/tsconfig.json`,在 `exclude` 数组追加 `server.ts`:

```json
"exclude": ["node_modules", "server.ts"]
```

- [ ] **Step 3: 创建 `server.ts`(stub,代理函数后面任务实现)**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/server.ts`:

```typescript
import { createServer, IncomingMessage } from 'http';
import { Socket } from 'net';
import next from 'next';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// 在加载任何依赖 process.env 的模块之前加载 .env.local
loadEnv({ path: resolve(process.cwd(), '.env.local') });

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  // 这两个函数在 Task 8/9 实现
  const { handleASRUpgrade } = await import('./src/lib/voice/asr-proxy');
  const { handleTTSUpgrade } = await import('./src/lib/voice/tts-proxy');

  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url || '';
    if (url.startsWith('/api/voice/asr')) {
      handleASRUpgrade(req, socket, head);
    } else if (url.startsWith('/api/voice/tts')) {
      handleTTSUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (dev=${dev})`);
  });
}

main().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
```

- [ ] **Step 4: 加 `dotenv` 依赖**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm add dotenv
```

- [ ] **Step 5: 占位代理文件(临时 stub,后续覆盖)**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/voice/asr-proxy.ts`:

```typescript
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

export function handleASRUpgrade(_req: IncomingMessage, socket: Socket, _head: Buffer): void {
  // Stub - implemented in Task 8
  socket.destroy();
}
```

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/voice/tts-proxy.ts`:

```typescript
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

export function handleTTSUpgrade(_req: IncomingMessage, socket: Socket, _head: Buffer): void {
  // Stub - implemented in Task 9
  socket.destroy();
}
```

- [ ] **Step 6: 修改 `package.json` scripts**

把 `package.json` 的 scripts 改为:

```json
{
  "scripts": {
    "dev": "tsx watch server.ts",
    "build": "next build",
    "start": "NODE_ENV=production tsx server.ts",
    "lint": "next lint",
    "test": "vitest run"
  }
}
```

- [ ] **Step 7: 验证启动**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm run dev
```

预期:看到 `> Ready on http://localhost:3000 (dev=true)`,浏览器打开 `http://localhost:3000` 能看到首页(虽然 LessonView 还没改造)。

按 Ctrl+C 停止。

- [ ] **Step 8: 提交**

```bash
git add server.ts tsconfig.json tsconfig.server.json package.json pnpm-lock.yaml src/lib/voice/asr-proxy.ts src/lib/voice/tts-proxy.ts
git commit -m "feat(voice): custom Next.js server with WebSocket upgrade hook"
```

---

# Phase 2: 服务端核心逻辑

## Task 3: 豆包二进制协议编解码器(TDD)

**Files:**
- Create: `src/lib/voice/doubao-codec.ts`
- Create: `src/lib/voice/doubao-codec.test.ts`

**目标:** 实现 spec 第 3 段的二进制协议:4-byte header + 可选 sequence/event/sessionId + 4-byte payload size(大端) + payload。供 ASR 和 TTS 代理共用。

豆包协议复杂、关键、容易出错,**严格 TDD**。

- [ ] **Step 1: 写测试 — header 编码 / 解码**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/voice/doubao-codec.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  encodeFullClientRequest,
  encodeAudioOnlyRequest,
  encodeAudioOnlyLast,
  decodeServerFrame,
  encodeTtsEvent,
  decodeTtsFrame,
  MessageType,
  Flags,
  Serialization,
  Compression,
} from './doubao-codec';

describe('doubao-codec — ASR direction', () => {
  it('encodes full-client request as JSON with positive sequence 1', () => {
    const payload = { user: { uid: 'u1' } };
    const buf = encodeFullClientRequest(payload, 1);

    // header: version=1, header_size=1, type=Full, flags=PositiveSeq, ser=JSON, compress=None
    expect(buf[0]).toBe(0x11);
    expect(buf[1]).toBe(0x11); // 0001 0001
    expect(buf[2]).toBe(0x10); // 0001 0000
    expect(buf[3]).toBe(0x00);

    // sequence (4 bytes, big-endian)
    const seq = buf.readInt32BE(4);
    expect(seq).toBe(1);

    // payload size (4 bytes, big-endian)
    const size = buf.readUInt32BE(8);
    const json = JSON.parse(buf.subarray(12, 12 + size).toString('utf8'));
    expect(json).toEqual(payload);
  });

  it('encodes audio-only request with positive sequence', () => {
    const audio = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const buf = encodeAudioOnlyRequest(audio, 7);

    expect(buf[1] & 0xf0).toBe(0x20); // type = AudioOnly
    expect(buf[1] & 0x0f).toBe(0x01); // flags = PositiveSeq
    expect(buf[2] & 0xf0).toBe(0x00); // ser = Raw
    expect(buf.readInt32BE(4)).toBe(7);
    expect(buf.readUInt32BE(8)).toBe(4);
    expect(buf.subarray(12)).toEqual(audio);
  });

  it('encodes negative-sequence last audio packet', () => {
    const buf = encodeAudioOnlyLast(Buffer.alloc(0), -10);
    expect(buf[1] & 0x0f).toBe(0x03); // flags = NegativeSeqLast
    expect(buf.readInt32BE(4)).toBe(-10);
    expect(buf.readUInt32BE(8)).toBe(0);
  });

  it('decodes a server JSON response frame', () => {
    const payload = JSON.stringify({ result: { text: 'hello' } });
    const payloadBuf = Buffer.from(payload, 'utf8');
    const frame = Buffer.alloc(4 + 4 + 4 + payloadBuf.length);
    frame[0] = 0x11;
    frame[1] = 0x91; // type=FullServerResponse(1001), flags=PositiveSeq(0001)
    frame[2] = 0x10; // ser=JSON
    frame[3] = 0x00;
    frame.writeInt32BE(5, 4); // seq
    frame.writeUInt32BE(payloadBuf.length, 8);
    payloadBuf.copy(frame, 12);

    const decoded = decodeServerFrame(frame);
    expect(decoded.messageType).toBe(MessageType.FullServerResponse);
    expect(decoded.sequence).toBe(5);
    expect(decoded.serialization).toBe(Serialization.JSON);
    expect(decoded.payload.toString('utf8')).toBe(payload);
  });

  it('decodes an error frame', () => {
    const errPayload = Buffer.from('{"error":"x"}', 'utf8');
    const frame = Buffer.alloc(4 + 4 + errPayload.length);
    frame[0] = 0x11;
    frame[1] = 0xf0; // type=Error(1111), no flags
    frame[2] = 0x10;
    frame[3] = 0x00;
    frame.writeUInt32BE(errPayload.length, 4);
    errPayload.copy(frame, 8);

    const decoded = decodeServerFrame(frame);
    expect(decoded.messageType).toBe(MessageType.Error);
    expect(decoded.payload.toString('utf8')).toBe('{"error":"x"}');
  });
});

describe('doubao-codec — TTS direction', () => {
  it('encodes StartConnection event (event=1, no session)', () => {
    const buf = encodeTtsEvent({ event: 1, payload: Buffer.from('{}', 'utf8') });
    // header: type=Full(0001), flags=Event(0100)
    expect(buf[1] & 0xf0).toBe(0x10);
    expect(buf[1] & 0x0f).toBe(0x04); // flags = Event
    expect(buf.readInt32BE(4)).toBe(1); // event
    expect(buf.readUInt32BE(8)).toBe(2); // payload size
    expect(buf.subarray(12).toString('utf8')).toBe('{}');
  });

  it('encodes StartSession event (event=100, with sessionId)', () => {
    const sid = 'abc-123';
    const payload = Buffer.from('{"k":"v"}', 'utf8');
    const buf = encodeTtsEvent({ event: 100, sessionId: sid, payload });

    // flags = EventWithSession (0101)
    expect(buf[1] & 0x0f).toBe(0x05);
    let off = 4;
    expect(buf.readInt32BE(off)).toBe(100); // event
    off += 4;
    const sidLen = buf.readUInt32BE(off);
    off += 4;
    expect(sidLen).toBe(Buffer.byteLength(sid, 'utf8'));
    expect(buf.subarray(off, off + sidLen).toString('utf8')).toBe(sid);
    off += sidLen;
    expect(buf.readUInt32BE(off)).toBe(payload.length);
    off += 4;
    expect(buf.subarray(off).toString('utf8')).toBe('{"k":"v"}');
  });

  it('decodes server TTSResponse frame (event=352, binary PCM)', () => {
    const sid = 's-1';
    const sidBuf = Buffer.from(sid, 'utf8');
    const pcm = Buffer.from([0x10, 0x20, 0x30, 0x40]);
    // header(4) + event(4) + sidLen(4) + sid + payloadSize(4) + pcm
    const frame = Buffer.alloc(4 + 4 + 4 + sidBuf.length + 4 + pcm.length);
    frame[0] = 0x11;
    frame[1] = 0x95; // type=FullServerResponse(1001), flags=EventWithSession(0101)
    frame[2] = 0x00; // ser=Raw, comp=None
    frame[3] = 0x00;
    let off = 4;
    frame.writeInt32BE(352, off); off += 4;
    frame.writeUInt32BE(sidBuf.length, off); off += 4;
    sidBuf.copy(frame, off); off += sidBuf.length;
    frame.writeUInt32BE(pcm.length, off); off += 4;
    pcm.copy(frame, off);

    const decoded = decodeTtsFrame(frame);
    expect(decoded.event).toBe(352);
    expect(decoded.sessionId).toBe(sid);
    expect(decoded.payload).toEqual(pcm);
  });

  it('decodes a TTS server JSON event (e.g. SessionStarted=150)', () => {
    const sid = 's-2';
    const sidBuf = Buffer.from(sid, 'utf8');
    const json = Buffer.from('{"ok":true}', 'utf8');
    const frame = Buffer.alloc(4 + 4 + 4 + sidBuf.length + 4 + json.length);
    frame[0] = 0x11;
    frame[1] = 0x95;
    frame[2] = 0x10; // ser=JSON
    frame[3] = 0x00;
    let off = 4;
    frame.writeInt32BE(150, off); off += 4;
    frame.writeUInt32BE(sidBuf.length, off); off += 4;
    sidBuf.copy(frame, off); off += sidBuf.length;
    frame.writeUInt32BE(json.length, off); off += 4;
    json.copy(frame, off);

    const decoded = decodeTtsFrame(frame);
    expect(decoded.event).toBe(150);
    expect(decoded.sessionId).toBe(sid);
    expect(decoded.serialization).toBe(Serialization.JSON);
    expect(JSON.parse(decoded.payload.toString('utf8'))).toEqual({ ok: true });
  });
});

describe('doubao-codec — constants', () => {
  it('exports protocol constants', () => {
    expect(MessageType.FullClientRequest).toBe(0x01);
    expect(MessageType.AudioOnlyRequest).toBe(0x02);
    expect(MessageType.FullServerResponse).toBe(0x09);
    expect(MessageType.Error).toBe(0x0f);
    expect(Flags.NoSequence).toBe(0x00);
    expect(Flags.PositiveSequence).toBe(0x01);
    expect(Flags.NegativeSequenceLast).toBe(0x03);
    expect(Flags.Event).toBe(0x04);
    expect(Flags.EventWithSession).toBe(0x05);
    expect(Serialization.Raw).toBe(0x00);
    expect(Serialization.JSON).toBe(0x01);
    expect(Compression.None).toBe(0x00);
    expect(Compression.Gzip).toBe(0x01);
  });
});
```

- [ ] **Step 2: 跑测试确认全部失败**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm test src/lib/voice/doubao-codec.test.ts
```

预期:全部 fail("Cannot find module './doubao-codec'")。

- [ ] **Step 3: 实现 codec**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/voice/doubao-codec.ts`:

```typescript
// 豆包二进制协议编解码,大端序整数。
// spec: docs/superpowers/specs/2026-05-01-voice-pipeline-doubao-design.md §3 / §4

export const MessageType = {
  FullClientRequest: 0x01,
  AudioOnlyRequest: 0x02,
  FullServerResponse: 0x09,
  Error: 0x0f,
} as const;

export const Flags = {
  NoSequence: 0x00,
  PositiveSequence: 0x01,
  NegativeSequenceLast: 0x03,
  Event: 0x04,
  EventWithSession: 0x05,
} as const;

export const Serialization = {
  Raw: 0x00,
  JSON: 0x01,
} as const;

export const Compression = {
  None: 0x00,
  Gzip: 0x01,
} as const;

const PROTOCOL_VERSION = 0x01;
const HEADER_SIZE = 0x01; // 1 * 4 = 4 bytes

function buildHeader(messageType: number, flags: number, serialization: number, compression: number): Buffer {
  const h = Buffer.alloc(4);
  h[0] = (PROTOCOL_VERSION << 4) | HEADER_SIZE;
  h[1] = ((messageType & 0x0f) << 4) | (flags & 0x0f);
  h[2] = ((serialization & 0x0f) << 4) | (compression & 0x0f);
  h[3] = 0x00;
  return h;
}

// ─── ASR direction ─────────────────────────────────────────────────────

export function encodeFullClientRequest(payload: object, sequence: number = 1): Buffer {
  const header = buildHeader(
    MessageType.FullClientRequest,
    Flags.PositiveSequence,
    Serialization.JSON,
    Compression.None
  );
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(sequence, 0);
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, seq, size, body]);
}

export function encodeAudioOnlyRequest(pcm: Buffer, sequence: number): Buffer {
  const header = buildHeader(
    MessageType.AudioOnlyRequest,
    Flags.PositiveSequence,
    Serialization.Raw,
    Compression.None
  );
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(sequence, 0);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(pcm.length, 0);
  return Buffer.concat([header, seq, size, pcm]);
}

export function encodeAudioOnlyLast(pcm: Buffer, sequence: number): Buffer {
  // sequence 应为负数,标记最后一包
  const header = buildHeader(
    MessageType.AudioOnlyRequest,
    Flags.NegativeSequenceLast,
    Serialization.Raw,
    Compression.None
  );
  const seq = Buffer.alloc(4);
  seq.writeInt32BE(sequence, 0);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(pcm.length, 0);
  return Buffer.concat([header, seq, size, pcm]);
}

export interface ServerFrame {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  sequence?: number;
  payload: Buffer;
}

export function decodeServerFrame(buf: Buffer): ServerFrame {
  if (buf.length < 8) {
    throw new Error(`Frame too short: ${buf.length}`);
  }
  const messageType = (buf[1] >> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  const serialization = (buf[2] >> 4) & 0x0f;
  const compression = buf[2] & 0x0f;

  let off = 4;
  let sequence: number | undefined;
  if (flags === Flags.PositiveSequence || flags === Flags.NegativeSequenceLast) {
    sequence = buf.readInt32BE(off);
    off += 4;
  }
  const payloadSize = buf.readUInt32BE(off);
  off += 4;
  const payload = buf.subarray(off, off + payloadSize);
  return { messageType, flags, serialization, compression, sequence, payload };
}

// ─── TTS direction ─────────────────────────────────────────────────────

export interface TtsEventInput {
  event: number;
  sessionId?: string;
  payload?: Buffer;
  serialization?: number; // default JSON
}

export function encodeTtsEvent(input: TtsEventInput): Buffer {
  const ser = input.serialization ?? Serialization.JSON;
  const flags = input.sessionId ? Flags.EventWithSession : Flags.Event;
  const header = buildHeader(MessageType.FullClientRequest, flags, ser, Compression.None);

  const eventBuf = Buffer.alloc(4);
  eventBuf.writeInt32BE(input.event, 0);

  const parts: Buffer[] = [header, eventBuf];

  if (input.sessionId) {
    const sid = Buffer.from(input.sessionId, 'utf8');
    const sidLen = Buffer.alloc(4);
    sidLen.writeUInt32BE(sid.length, 0);
    parts.push(sidLen, sid);
  }

  const payload = input.payload ?? Buffer.alloc(0);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length, 0);
  parts.push(size, payload);

  return Buffer.concat(parts);
}

export interface TtsServerFrame {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  event: number;
  sessionId?: string;
  payload: Buffer;
}

export function decodeTtsFrame(buf: Buffer): TtsServerFrame {
  if (buf.length < 8) {
    throw new Error(`TTS frame too short: ${buf.length}`);
  }
  const messageType = (buf[1] >> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  const serialization = (buf[2] >> 4) & 0x0f;
  const compression = buf[2] & 0x0f;

  let off = 4;
  const event = buf.readInt32BE(off);
  off += 4;

  let sessionId: string | undefined;
  if (flags === Flags.EventWithSession) {
    const sidLen = buf.readUInt32BE(off);
    off += 4;
    sessionId = buf.subarray(off, off + sidLen).toString('utf8');
    off += sidLen;
  }

  const payloadSize = buf.readUInt32BE(off);
  off += 4;
  const payload = buf.subarray(off, off + payloadSize);
  return { messageType, flags, serialization, compression, event, sessionId, payload };
}
```

- [ ] **Step 4: 跑测试确认全部通过**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm test src/lib/voice/doubao-codec.test.ts
```

预期:`Test Files 1 passed`,所有 it 通过。

- [ ] **Step 5: 提交**

```bash
git add src/lib/voice/doubao-codec.ts src/lib/voice/doubao-codec.test.ts
git commit -m "feat(voice): doubao binary protocol codec with tests"
```

---

## Task 4: StreamingSpeechExtractor(TDD)

**Files:**
- Create: `src/lib/agent/speech-extractor.ts`
- Create: `src/lib/agent/speech-extractor.test.ts`

**目标:** 实现 spec 第 5 段的状态机:从 LLM 流式 JSON token 中边读边吐出 `speech` 字段的字符增量,处理转义,不等 JSON 收尾。

- [ ] **Step 1: 写测试**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/agent/speech-extractor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { StreamingSpeechExtractor } from './speech-extractor';

function feedAll(extractor: StreamingSpeechExtractor, chunks: string[]): string {
  let speech = '';
  for (const c of chunks) {
    const r = extractor.feed(c);
    if (r.speechDelta) speech += r.speechDelta;
  }
  return speech;
}

describe('StreamingSpeechExtractor', () => {
  it('extracts a simple speech field across chunks', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, [
      '{"speech": "Hel',
      'lo! Look at',
      ' this. It\'s a boat!"',
      ', "actions": []}',
    ]);
    expect(out).toBe("Hello! Look at this. It's a boat!");
  });

  it('handles escape sequences \\" \\\\ \\n', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, ['{"speech":"a\\"b\\\\c\\nd"}']);
    expect(out).toBe('a"b\\c\nd');
  });

  it('handles \\uXXXX escapes', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, ['{"speech":"hi \\u4f60\\u597d"}']);
    expect(out).toBe('hi 你好');
  });

  it('extracts speech even when actions appears first in JSON', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, [
      '{"actions": [{"tool":"show","params":{"image_id":"car"}}], ',
      '"speech": "看小汽车!"}',
    ]);
    expect(out).toBe('看小汽车!');
  });

  it('handles the speech key being split across chunks', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, ['{"sp', 'eec', 'h"', ': ', '"hi"}']);
    expect(out).toBe('hi');
  });

  it('finalize parses the full JSON for actions/state_update', () => {
    const ex = new StreamingSpeechExtractor();
    const full = '{"speech":"hi","actions":[{"tool":"show","params":{"image_id":"car"}}],"state_update":{"current_word":"car"}}';
    feedAll(ex, [full]);
    const result = ex.finalize();
    expect(result.actions).toEqual([{ tool: 'show', params: { image_id: 'car' } }]);
    expect(result.state_update).toEqual({ current_word: 'car' });
  });

  it('finalize on malformed JSON returns whatever speech was extracted with empty actions', () => {
    const ex = new StreamingSpeechExtractor();
    feedAll(ex, ['{"speech":"hi","actions":[bad']);
    const result = ex.finalize();
    expect(result.speech).toBe('hi');
    expect(result.actions).toEqual([]);
    expect(result.malformed).toBe(true);
  });

  it('does not yield from a non-speech string field that looks similar', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, ['{"speechx":"NO","speech":"YES"}']);
    expect(out).toBe('YES');
  });

  it('marks complete: true when speech field is fully closed', () => {
    const ex = new StreamingSpeechExtractor();
    let complete = false;
    for (const c of ['{"speech":"hi"', ',"actions":[]}']) {
      const r = ex.feed(c);
      if (r.complete) complete = true;
    }
    expect(complete).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm test src/lib/agent/speech-extractor.test.ts
```

预期:全部 fail。

- [ ] **Step 3: 实现 SpeechExtractor**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/agent/speech-extractor.ts`:

```typescript
import { AgentResponse } from '@/types/tools';

type State =
  | 'LOOKING_FOR_KEY'    // 寻找下一个键
  | 'IN_KEY'             // 读键名
  | 'AFTER_KEY'          // 读完键,等冒号
  | 'AFTER_COLON'        // 读冒号后,等值开始
  | 'IN_STRING'          // 在 speech 字符串里
  | 'IN_STRING_ESCAPE'   // 字符串里收到反斜杠
  | 'IN_UNICODE_ESCAPE'  // 字符串里收到 \u,收 4 个 hex
  | 'DONE';              // speech 字段已完整读完

const SPEECH_KEY = 'speech';

export interface FeedResult {
  speechDelta?: string;
  complete?: boolean;
}

export interface ExtractedResult {
  speech: string;
  actions: AgentResponse['actions'];
  state_update: AgentResponse['state_update'];
  malformed?: boolean;
}

export class StreamingSpeechExtractor {
  private state: State = 'LOOKING_FOR_KEY';
  private buffer = ''; // 累积全文用于 finalize
  private keyBuf = '';
  private currentKey = '';
  private speech = '';
  private unicodeBuf = '';

  feed(chunk: string): FeedResult {
    this.buffer += chunk;
    let speechDelta = '';
    let complete = false;

    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];

      switch (this.state) {
        case 'LOOKING_FOR_KEY':
          if (c === '"') {
            this.state = 'IN_KEY';
            this.keyBuf = '';
          }
          // 其他字符(空格、{,[、:、,)忽略
          break;

        case 'IN_KEY':
          if (c === '"') {
            this.currentKey = this.keyBuf;
            this.state = 'AFTER_KEY';
          } else if (c === '\\') {
            // 键里出现转义,简单跳过下一个字符(JSON 键里几乎没有转义)
            i++;
          } else {
            this.keyBuf += c;
          }
          break;

        case 'AFTER_KEY':
          if (c === ':') {
            this.state = 'AFTER_COLON';
          }
          break;

        case 'AFTER_COLON':
          if (c === '"') {
            // 仅当当前键是 speech 时进入字符串读取模式
            if (this.currentKey === SPEECH_KEY) {
              this.state = 'IN_STRING';
            } else {
              // 跳过非 speech 字符串值
              this.skipNonSpeechString(chunk, i + 1);
              i = this.skipUntilStringEnd(chunk, i + 1);
              this.state = 'LOOKING_FOR_KEY';
            }
          } else if (c === '{' || c === '[') {
            // 非 speech 的对象/数组值:跳到匹配括号
            i = this.skipNested(chunk, i);
            this.state = 'LOOKING_FOR_KEY';
          } else if (c === ',' || c === '}') {
            this.state = 'LOOKING_FOR_KEY';
          }
          // 数字/true/false/null 等基本类型:扫到下一个 , 或 }
          else if (/[a-zA-Z0-9\-]/.test(c)) {
            while (i < chunk.length && chunk[i] !== ',' && chunk[i] !== '}' && chunk[i] !== ']') {
              i++;
            }
            i--;
            this.state = 'LOOKING_FOR_KEY';
          }
          break;

        case 'IN_STRING':
          if (c === '"') {
            this.state = 'DONE';
            complete = true;
          } else if (c === '\\') {
            this.state = 'IN_STRING_ESCAPE';
          } else {
            speechDelta += c;
            this.speech += c;
          }
          break;

        case 'IN_STRING_ESCAPE':
          if (c === 'u') {
            this.state = 'IN_UNICODE_ESCAPE';
            this.unicodeBuf = '';
          } else {
            const ch = decodeSimpleEscape(c);
            speechDelta += ch;
            this.speech += ch;
            this.state = 'IN_STRING';
          }
          break;

        case 'IN_UNICODE_ESCAPE':
          this.unicodeBuf += c;
          if (this.unicodeBuf.length === 4) {
            const ch = String.fromCharCode(parseInt(this.unicodeBuf, 16));
            speechDelta += ch;
            this.speech += ch;
            this.state = 'IN_STRING';
          }
          break;

        case 'DONE':
          // 已读完 speech,后续字符全部忽略(等 finalize 拿 actions)
          break;
      }
    }

    const result: FeedResult = {};
    if (speechDelta) result.speechDelta = speechDelta;
    if (complete) result.complete = true;
    return result;
  }

  private skipUntilStringEnd(chunk: string, start: number): number {
    let i = start;
    while (i < chunk.length) {
      if (chunk[i] === '\\') {
        i += 2;
      } else if (chunk[i] === '"') {
        return i;
      } else {
        i++;
      }
    }
    return chunk.length - 1;
  }

  private skipNonSpeechString(_chunk: string, _start: number): void {
    // placeholder, real work happens in skipUntilStringEnd via 调用方
  }

  private skipNested(chunk: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < chunk.length; i++) {
      const c = chunk[i];
      if (escaped) { escaped = false; continue; }
      if (inString) {
        if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return chunk.length - 1;
  }

  finalize(): ExtractedResult {
    let parsed: any = null;
    let malformed = false;
    try {
      parsed = JSON.parse(this.buffer);
    } catch {
      malformed = true;
    }
    return {
      speech: this.speech,
      actions: parsed?.actions ?? [],
      state_update: parsed?.state_update ?? {},
      malformed: malformed || undefined,
    };
  }
}

function decodeSimpleEscape(c: string): string {
  switch (c) {
    case '"': return '"';
    case '\\': return '\\';
    case '/': return '/';
    case 'b': return '\b';
    case 'f': return '\f';
    case 'n': return '\n';
    case 'r': return '\r';
    case 't': return '\t';
    default: return c;
  }
}
```

- [ ] **Step 4: 跑测试**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm test src/lib/agent/speech-extractor.test.ts
```

预期:全部通过。如果某个 case fail,根据失败信息修 extractor。

- [ ] **Step 5: 提交**

```bash
git add src/lib/agent/speech-extractor.ts src/lib/agent/speech-extractor.test.ts
git commit -m "feat(voice): streaming JSON speech extractor with state machine"
```

---

## Task 5: MiMo LLM 流式接口

**Files:**
- Modify: `src/lib/mimo/llm.ts`(加 streamLLM,保留旧 callLLM 暂时不删,后面任务清理)

**目标:** 给 LLM 模块加一个 `streamLLM` async generator,逐 chunk 吐 token delta(SSE 解析)。MiMo `/chat/completions` 用 `stream: true` 走 SSE。

- [ ] **Step 1: 改写 `src/lib/mimo/llm.ts`**

替换 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/mimo/llm.ts` 全文为:

```typescript
import { AgentResponse } from '@/types/tools';

const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResult {
  response: AgentResponse;
  usage: LLMUsage;
  latency: number;
}

// 旧的非流式接口 — 保留给 start 场景兜底,后续如果不需要可删
export async function callLLM(
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<LLMResult> {
  const start = Date.now();
  const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mimo-v2.5-pro',
      messages: apiMessages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`MiMo LLM error: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const data = await res.json();
  const latency = Date.now() - start;
  const content = data.choices[0].message.content;
  const parsed: AgentResponse = JSON.parse(content);

  return {
    response: parsed,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
    latency,
  };
}

// 新的流式接口:逐 chunk 吐 token delta
export interface StreamChunk {
  delta: string;
  done: false;
}
export interface StreamFinal {
  done: true;
  fullText: string;
  usage: LLMUsage;
  latency: number;
}
export type StreamEvent = StreamChunk | StreamFinal;

export async function* streamLLM(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const start = Date.now();
  const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mimo-v2.5-pro',
      messages: apiMessages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`MiMo LLM stream error: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let fullText = '';
  let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE: 双换行分帧;每帧一行 "data: ..."
      let nl: number;
      while ((nl = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const line = frame.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;

        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            yield { delta, done: false };
          }
          if (json.usage) {
            usage = {
              inputTokens: json.usage.prompt_tokens || 0,
              outputTokens: json.usage.completion_tokens || 0,
            };
          }
        } catch {
          // 跳过无法解析的 chunk
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    done: true,
    fullText,
    usage,
    latency: Date.now() - start,
  };
}
```

- [ ] **Step 2: 检查类型**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错误(老的引用 `callLLM` 的 session.ts 还能编译,因为 callLLM 保留)。

- [ ] **Step 3: 提交**

```bash
git add src/lib/mimo/llm.ts
git commit -m "feat(voice): add streaming LLM client with SSE parsing"
```

---

## Task 6: 重写 session.ts 为流式编排器(orchestrator)

**Files:**
- Modify: `src/lib/agent/session.ts`(重写 processUserInput 为 streamUserInput)
- Modify: `src/lib/agent/memory.ts`(state_update commit 时机调整)
- Create: `src/lib/agent/orchestrator.ts`(SSE 编排器,被 chat route 用)

**目标:** 用 streamLLM + StreamingSpeechExtractor 串起一个 async generator,产出三种事件:`speech-delta` / `speech-end` / `actions` / `done` / `error`。memory 在 `actions` 阶段(完整 JSON 出来后)统一 commit。

- [ ] **Step 1: 改 `memory.ts` 让 commit 时机可控**

打开 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/agent/memory.ts`,在文件末尾追加:

```typescript
// 流式版本:speech 完整(从 SpeechExtractor 拿到的纯字符串)、actions、state_update 一并 commit
export function commitAssistantStreamResult(
  memory: LessonMemory,
  speech: string,
  actions: AgentResponse['actions'],
  stateUpdate: AgentResponse['state_update']
): LessonMemory {
  return addAssistantMessage(memory, { speech, actions, state_update: stateUpdate });
}
```

无需改既有函数。这个新函数复用 addAssistantMessage,只是给一个语义更明确的入口。

- [ ] **Step 2: 重写 `session.ts`**

替换 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/agent/session.ts` 全文为:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Course } from '@/types/course';
import { LessonMemory, TokenUsage, InteractionLog } from '@/types/session';
import { AgentResponse, ToolAction } from '@/types/tools';
import { createMemory, addUserMessage, getMessagesForLLM, commitAssistantStreamResult } from './memory';
import { buildSystemPrompt } from './prompt';
import { streamLLM } from '@/lib/mimo/llm';
import { StreamingSpeechExtractor } from './speech-extractor';
import { createLessonLog, finishLessonLog, insertInteraction } from '@/lib/db/queries';

export interface Session {
  id: string;
  courseId: string;
  course: Course;
  memory: LessonMemory;
  tokenUsage: TokenUsage;
  startTime: Date;
}

const sessions = new Map<string, Session>();

export function createSession(course: Course): Session {
  const id = uuidv4();
  const session: Session = {
    id,
    courseId: course.id,
    course,
    memory: createMemory(),
    tokenUsage: {
      asr: { requests: 0, tokens: 0 },
      llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
      tts: { requests: 0, characters: 0 },
    },
    startTime: new Date(),
  };
  sessions.set(id, session);
  createLessonLog(id, course.id);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function endSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  finishLessonLog(session.id, session.memory.totalInteractions, session.tokenUsage);
  sessions.delete(sessionId);
}

export type StreamUserEvent =
  | { type: 'speech-delta'; text: string }
  | { type: 'speech-end' }
  | { type: 'actions'; actions: ToolAction[]; state_update: AgentResponse['state_update'] }
  | { type: 'done' }
  | { type: 'error'; message: string };

export async function* streamUserInput(
  sessionId: string,
  userText: string,
  asrResult?: { latency: number; tokens: number },
  signal?: AbortSignal
): AsyncGenerator<StreamUserEvent> {
  const session = sessions.get(sessionId);
  if (!session) {
    yield { type: 'error', message: `Session ${sessionId} not found` };
    return;
  }

  session.memory = addUserMessage(session.memory, userText);

  const systemPrompt = buildSystemPrompt(session.course, session.memory);
  const messages = getMessagesForLLM(session.memory);

  const extractor = new StreamingSpeechExtractor();
  let speechClosed = false;
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let llmLatency = 0;

  try {
    for await (const ev of streamLLM(systemPrompt, messages, signal)) {
      if (ev.done) {
        fullText = ev.fullText;
        inputTokens = ev.usage.inputTokens;
        outputTokens = ev.usage.outputTokens;
        llmLatency = ev.latency;
        break;
      }
      const out = extractor.feed(ev.delta);
      if (out.speechDelta) {
        yield { type: 'speech-delta', text: out.speechDelta };
      }
      if (out.complete && !speechClosed) {
        speechClosed = true;
        yield { type: 'speech-end' };
      }
    }
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    return;
  }

  if (!speechClosed) {
    // 兜底:LLM 没正常关闭 speech 字段(畸形)
    yield { type: 'speech-end' };
  }

  const result = extractor.finalize();
  yield {
    type: 'actions',
    actions: result.actions,
    state_update: result.state_update,
  };

  // commit memory + token + interaction log
  session.memory = commitAssistantStreamResult(
    session.memory,
    result.speech,
    result.actions,
    result.state_update
  );
  session.tokenUsage.llm.requests += 1;
  session.tokenUsage.llm.inputTokens += inputTokens;
  session.tokenUsage.llm.outputTokens += outputTokens;
  if (asrResult) {
    session.tokenUsage.asr.requests += 1;
    session.tokenUsage.asr.tokens += asrResult.tokens;
  }

  const interactionLog: InteractionLog = {
    timestamp: new Date(),
    userInput: userText,
    aiResponse: result.speech,
    actions: result.actions,
    modelCalls: {
      asr: asrResult,
      llm: { latency: llmLatency, inputTokens, outputTokens },
    },
  };
  insertInteraction(session.id, interactionLog);

  yield { type: 'done' };
}
```

- [ ] **Step 3: 创建 `orchestrator.ts`(把 streamUserInput 转成 SSE 字节流)**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/agent/orchestrator.ts`:

```typescript
import { streamUserInput, StreamUserEvent } from './session';

function sseFrame(event: string, data: object): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function streamUserInputToSSE(
  sessionId: string,
  userText: string,
  asrResult?: { latency: number; tokens: number }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ac = new AbortController();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of streamUserInput(sessionId, userText, asrResult, ac.signal)) {
          const frame = mapEventToSSE(ev);
          controller.enqueue(encoder.encode(frame));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(sseFrame('error', { message: (err as Error).message }))
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });
}

function mapEventToSSE(ev: StreamUserEvent): string {
  switch (ev.type) {
    case 'speech-delta': return sseFrame('speech-delta', { text: ev.text });
    case 'speech-end':   return sseFrame('speech-end', {});
    case 'actions':      return sseFrame('actions', { actions: ev.actions, state_update: ev.state_update });
    case 'done':         return sseFrame('done', {});
    case 'error':        return sseFrame('error', { message: ev.message });
  }
}
```

- [ ] **Step 4: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错。如果 chat/route.ts 还引用旧的 `processUserInput`,这个错暂时存在,会在 Task 7 修复 — 此时如果阻塞类型检查,可以临时把旧 API 重新加回 session.ts(`export async function processUserInput`),Task 7 替换路由后再删。简单做法:把如下兜底加到 session.ts 末尾:

```typescript
// 保留旧 API 兼容 — Task 7 会把 chat route 切到 streamUserInput,然后删除这个
export async function processUserInput(
  sessionId: string,
  userText: string,
  asrResult?: { latency: number; tokens: number }
): Promise<{ response: import('@/types/tools').AgentResponse; session: Session }> {
  let speech = '';
  let actions: import('@/types/tools').ToolAction[] = [];
  let stateUpdate: import('@/types/tools').AgentResponse['state_update'] = {};
  for await (const ev of streamUserInput(sessionId, userText, asrResult)) {
    if (ev.type === 'speech-delta') speech += ev.text;
    if (ev.type === 'actions') { actions = ev.actions; stateUpdate = ev.state_update; }
    if (ev.type === 'error') throw new Error(ev.message);
  }
  const session = sessions.get(sessionId)!;
  return { response: { speech, actions, state_update: stateUpdate }, session };
}
```

(Task 7 替换 chat route 后,这个兜底可以删除。)

- [ ] **Step 5: 提交**

```bash
git add src/lib/agent/session.ts src/lib/agent/memory.ts src/lib/agent/orchestrator.ts
git commit -m "feat(voice): streaming session orchestrator with SSE adapter"
```

---

## Task 7: `/api/chat` 改为 SSE

**Files:**
- Modify: `src/app/api/chat/route.ts`

**目标:** `action=message` 返回 SSE 流;`action=start` 也返回 SSE(开场白同样流式);`action=end` 保持 JSON 响应。

- [ ] **Step 1: 重写 chat route**

替换 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/app/api/chat/route.ts` 全文为:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession, endSession } from '@/lib/agent/session';
import { streamUserInputToSSE } from '@/lib/agent/orchestrator';
import { getCourseById } from '@/data/courses/transportation';
import { ensureInitialized } from '@/lib/init';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  ensureInitialized();
  const body = await req.json();

  if (body.action === 'start') {
    const course = getCourseById(body.courseId);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const session = createSession(course);
    const stream = streamUserInputToSSE(session.id, '(课堂开始)');
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Session-Id': session.id,
      },
    });
  }

  if (body.action === 'message') {
    const session = getSession(body.sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const stream = streamUserInputToSSE(body.sessionId, body.text, body.asrResult);
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  }

  if (body.action === 'end') {
    endSession(body.sessionId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
```

> 注:`X-Session-Id` 头让 `start` 响应里前端能拿到 sessionId(SSE 流里没有显式 sessionId 事件)。前端读 `response.headers.get('X-Session-Id')` 即可。

- [ ] **Step 2: 删除 session.ts 末尾的 processUserInput 兼容层**

打开 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/agent/session.ts`,删除 Task 6 Step 4 加的 processUserInput 兜底块(从 `// 保留旧 API` 注释起到函数结束)。

- [ ] **Step 3: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错。LessonView 还在用旧 fetch JSON 格式,但它不阻塞类型检查(因为它只 `await res.json()` 不依赖具体类型)。LessonView 的真正改造在 Task 17。

- [ ] **Step 4: 提交**

```bash
git add src/app/api/chat/route.ts src/lib/agent/session.ts
git commit -m "feat(voice): chat route returns SSE stream"
```

---

## Task 8: ASR 服务端代理

**Files:**
- Modify: `src/lib/voice/asr-proxy.ts`(从 stub 改为完整实现)

**目标:** 前端 WS 连到 `/api/voice/asr` → 服务端立刻向豆包 ASR 发起一条 WS,把鉴权 header 注入。前端推 PCM 二进制 → 包成 audio_only_request 转给豆包;豆包返 JSON 识别结果 → 提取 text 转 JSON 给前端。

- [ ] **Step 1: 改写 `asr-proxy.ts`**

替换 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/voice/asr-proxy.ts` 全文为:

```typescript
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { WebSocket as WsClient, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import {
  encodeFullClientRequest,
  encodeAudioOnlyRequest,
  encodeAudioOnlyLast,
  decodeServerFrame,
  MessageType,
  Serialization,
} from './doubao-codec';

const DOUBAO_ASR_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';

const wss = new WebSocketServer({ noServer: true });

export function handleASRUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
  if (process.env.VOICE_MOCK === 'true') {
    return handleMockASR(req, socket, head);
  }
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    bridge(clientWs);
  });
}

function bridge(clientWs: WsClient): void {
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    'X-Api-App-Key': process.env.DOUBAO_APP_ID || '',
    'X-Api-Access-Key': process.env.DOUBAO_ACCESS_KEY || '',
    'X-Api-Resource-Id': process.env.DOUBAO_ASR_RESOURCE_ID || 'volc.seedasr.sauc.duration',
    'X-Api-Request-Id': requestId,
    'X-Api-Sequence': '-1',
  };

  const upstream = new WsClient(DOUBAO_ASR_URL, { headers });
  let sequence = 1;
  let upstreamReady = false;
  let closed = false;

  const closeAll = (code: number = 1000, reason: string = '') => {
    if (closed) return;
    closed = true;
    try { clientWs.close(code, reason); } catch {}
    try { upstream.close(); } catch {}
  };

  upstream.on('open', () => {
    upstreamReady = true;
    const payload = {
      user: { uid: `eduagent-${requestId}`, platform: 'web' },
      audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
      request: {
        model_name: 'bigmodel',
        enable_punc: true,
        enable_ddc: true,
        result_type: 'single',
      },
    };
    upstream.send(encodeFullClientRequest(payload, sequence++));
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState !== clientWs.OPEN) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    let frame;
    try {
      frame = decodeServerFrame(buf);
    } catch (e) {
      clientWs.send(JSON.stringify({ type: 'error', code: 'decode', message: (e as Error).message }));
      return;
    }
    if (frame.messageType === MessageType.Error) {
      const text = frame.payload.toString('utf8');
      clientWs.send(JSON.stringify({ type: 'error', code: 'upstream', message: text }));
      closeAll();
      return;
    }
    if (frame.serialization !== Serialization.JSON) return;
    const json = safeParse(frame.payload.toString('utf8'));
    if (!json) return;
    // 豆包 SAUC 返回结构:{ result: { text: "...", utterances: [{ definite: true|false, text }] } }
    const text = json?.result?.text ?? '';
    const utterances = json?.result?.utterances ?? [];
    const isFinal =
      utterances.length > 0 &&
      utterances.every((u: any) => u.definite === true);
    clientWs.send(JSON.stringify({ type: isFinal ? 'final' : 'partial', text }));
  });

  upstream.on('error', (err) => {
    clientWs.send(JSON.stringify({ type: 'error', code: 'upstream', message: err.message }));
    closeAll();
  });

  upstream.on('close', () => {
    closeAll();
  });

  // 前端推 PCM
  clientWs.on('message', (data, isBinary) => {
    if (!upstreamReady) return; // 在 ConnectionStarted 之前丢弃,简化处理
    if (!isBinary) return; // ASR 通道只接受二进制 PCM
    const pcm = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    upstream.send(encodeAudioOnlyRequest(pcm, sequence++));
  });

  clientWs.on('close', () => {
    if (upstreamReady && upstream.readyState === upstream.OPEN) {
      // 发负包标记结束
      try {
        upstream.send(encodeAudioOnlyLast(Buffer.alloc(0), -sequence));
      } catch {}
    }
    closeAll();
  });

  clientWs.on('error', () => closeAll());
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

// ─── Mock(VOICE_MOCK=true)─────────────────────────────────────────────

function handleMockASR(req: IncomingMessage, socket: Socket, head: Buffer): void {
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    let timer: NodeJS.Timeout | null = null;
    let final = false;
    clientWs.on('message', (_data, isBinary) => {
      if (!isBinary || final) return;
      // 模拟 partial 滚动
      if (!timer) {
        const phrases = ['Hello', 'Hello, what', 'Hello, what is this?'];
        let i = 0;
        timer = setInterval(() => {
          if (i < phrases.length) {
            clientWs.send(JSON.stringify({ type: 'partial', text: phrases[i++] }));
          }
        }, 300);
      }
    });
    clientWs.on('close', () => {
      if (timer) clearInterval(timer);
      if (!final) {
        final = true;
        clientWs.send(JSON.stringify({ type: 'final', text: 'Hello, what is this?' }));
      }
    });
  });
}
```

- [ ] **Step 2: 验证编译**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit -p tsconfig.server.json
```

预期:无错(server.ts 引用 asr-proxy 现在能解析到完整实现)。

- [ ] **Step 3: 启动 dev server,确认 server.ts 加载 asr-proxy 不报错**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm run dev
```

预期:`> Ready on http://localhost:3000`。Ctrl+C 停止。

- [ ] **Step 4: 提交**

```bash
git add src/lib/voice/asr-proxy.ts
git commit -m "feat(voice): doubao ASR WebSocket proxy with mock mode"
```

---

## Task 9: TTS 服务端代理

**Files:**
- Modify: `src/lib/voice/tts-proxy.ts`(从 stub 改为完整实现)

**目标:** 前端 WS 连到 `/api/voice/tts` → 服务端建立到豆包 TTS 的长连(WS),发 StartConnection;前端发 JSON 控制帧(`session-start` / `text-chunk` / `session-finish` / `session-cancel`),代理翻译为豆包 event;豆包返二进制 PCM / JSON 事件 → 翻译为前端的简化协议。

- [ ] **Step 1: 改写 `tts-proxy.ts`**

替换 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/voice/tts-proxy.ts` 全文为:

```typescript
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { WebSocket as WsClient, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import {
  encodeTtsEvent,
  decodeTtsFrame,
  Serialization,
} from './doubao-codec';

const DOUBAO_TTS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';

const wss = new WebSocketServer({ noServer: true });

export function handleTTSUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
  if (process.env.VOICE_MOCK === 'true') {
    return handleMockTTS(req, socket, head);
  }
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    bridge(clientWs);
  });
}

interface PendingSession {
  sessionId: string;
}

function bridge(clientWs: WsClient): void {
  const connectId = randomUUID();
  const headers: Record<string, string> = {
    'X-Api-App-Id': process.env.DOUBAO_APP_ID || '',
    'X-Api-Access-Key': process.env.DOUBAO_ACCESS_KEY || '',
    'X-Api-Resource-Id': process.env.DOUBAO_TTS_RESOURCE_ID || 'seed-tts-2.0',
    'X-Api-Connect-Id': connectId,
  };

  const upstream = new WsClient(DOUBAO_TTS_URL, { headers });
  let connectionReady = false;
  let currentSession: PendingSession | null = null;
  let closed = false;

  const closeAll = (code: number = 1000) => {
    if (closed) return;
    closed = true;
    try { clientWs.close(code); } catch {}
    try { upstream.close(); } catch {}
  };

  upstream.on('open', () => {
    upstream.send(encodeTtsEvent({ event: 1, payload: Buffer.from('{}', 'utf8') }));
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState !== clientWs.OPEN) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    let frame;
    try { frame = decodeTtsFrame(buf); } catch (e) {
      clientWs.send(JSON.stringify({ type: 'error', code: 'decode', message: (e as Error).message }));
      return;
    }

    switch (frame.event) {
      case 50: // ConnectionStarted
        connectionReady = true;
        clientWs.send(JSON.stringify({ type: 'connection-started' }));
        break;
      case 150: // SessionStarted
        clientWs.send(JSON.stringify({ type: 'session-started', sessionId: frame.sessionId }));
        break;
      case 152: // SessionFinished
        clientWs.send(JSON.stringify({ type: 'session-finished', sessionId: frame.sessionId }));
        currentSession = null;
        break;
      case 350: { // TTSSentenceStart
        const json = safeParse(frame.payload.toString('utf8'));
        clientWs.send(JSON.stringify({ type: 'subtitle', text: json?.text ?? '' }));
        break;
      }
      case 351: // TTSSentenceEnd
        clientWs.send(JSON.stringify({ type: 'sentence-end' }));
        break;
      case 352: // TTSResponse - binary PCM
        clientWs.send(frame.payload, { binary: true });
        break;
      default: {
        // 错误事件或未知事件
        const json = frame.serialization === Serialization.JSON
          ? safeParse(frame.payload.toString('utf8'))
          : null;
        if (json?.error) {
          clientWs.send(JSON.stringify({ type: 'error', code: 'upstream', message: JSON.stringify(json) }));
        }
      }
    }
  });

  upstream.on('error', (err) => {
    clientWs.send(JSON.stringify({ type: 'error', code: 'upstream', message: err.message }));
    closeAll();
  });

  upstream.on('close', () => {
    closeAll();
  });

  clientWs.on('message', (data, isBinary) => {
    if (isBinary) return; // 前端到代理只接受 JSON 控制帧
    if (!connectionReady) {
      // 等连接 ready 再处理 — 实际发出会失败,记录但不致命
    }
    const text = data.toString();
    const msg = safeParse(text);
    if (!msg) return;

    switch (msg.type) {
      case 'session-start': {
        const sessionId = msg.sessionId || randomUUID();
        currentSession = { sessionId };
        const reqParams = {
          speaker: process.env.DOUBAO_TTS_DEFAULT_SPEAKER,
          model: 'seed-tts-2.0-standard',
          audio_params: {
            format: 'pcm',
            sample_rate: 24000,
            speech_rate: -10,
            loudness_rate: 0,
          },
          additions: {
            disable_markdown_filter: false,
            cache_config: { text_type: 1, use_cache: true, use_segment_cache: true },
          },
        };
        const payload = JSON.stringify({
          event: 100,
          namespace: 'BidirectionalTTS',
          req_params: reqParams,
        });
        upstream.send(encodeTtsEvent({ event: 100, sessionId, payload: Buffer.from(payload, 'utf8') }));
        break;
      }
      case 'text-chunk': {
        if (!currentSession) return;
        const payload = JSON.stringify({ event: 200, namespace: 'BidirectionalTTS', text: msg.text });
        upstream.send(encodeTtsEvent({ event: 200, sessionId: currentSession.sessionId, payload: Buffer.from(payload, 'utf8') }));
        break;
      }
      case 'session-finish': {
        if (!currentSession) return;
        upstream.send(encodeTtsEvent({ event: 102, sessionId: currentSession.sessionId, payload: Buffer.from('{}', 'utf8') }));
        break;
      }
      case 'session-cancel': {
        if (!currentSession) return;
        upstream.send(encodeTtsEvent({ event: 101, sessionId: currentSession.sessionId, payload: Buffer.from('{}', 'utf8') }));
        currentSession = null;
        break;
      }
    }
  });

  clientWs.on('close', () => {
    if (upstream.readyState === upstream.OPEN) {
      try {
        upstream.send(encodeTtsEvent({ event: 2, payload: Buffer.from('{}', 'utf8') }));
      } catch {}
    }
    closeAll();
  });

  clientWs.on('error', () => closeAll());
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

// ─── Mock(VOICE_MOCK=true)─────────────────────────────────────────────

function handleMockTTS(req: IncomingMessage, socket: Socket, head: Buffer): void {
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    clientWs.send(JSON.stringify({ type: 'connection-started' }));
    clientWs.on('message', (data, isBinary) => {
      if (isBinary) return;
      const msg = safeParse(data.toString());
      if (!msg) return;
      if (msg.type === 'session-start') {
        clientWs.send(JSON.stringify({ type: 'session-started', sessionId: msg.sessionId }));
      } else if (msg.type === 'text-chunk') {
        clientWs.send(JSON.stringify({ type: 'subtitle', text: msg.text }));
        // 推 200ms 模拟 PCM 静音(24000Hz * 0.2s * 2byte = 9600 字节)
        clientWs.send(Buffer.alloc(9600), { binary: true });
        clientWs.send(JSON.stringify({ type: 'sentence-end' }));
      } else if (msg.type === 'session-finish') {
        clientWs.send(JSON.stringify({ type: 'session-finished' }));
      }
    });
  });
}
```

- [ ] **Step 2: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit -p tsconfig.server.json
```

预期:无错。

- [ ] **Step 3: 启动验证**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm run dev
```

打开浏览器开发者工具,在 Console 跑:

```javascript
const ws = new WebSocket('ws://localhost:3000/api/voice/tts');
ws.onopen = () => console.log('open');
ws.onmessage = (e) => console.log('msg:', e.data);
ws.onerror = (e) => console.error('err', e);
```

预期:看到 `open` + `msg: {"type":"connection-started"}`(若 .env.local 凭据没问题)。Mock 模式同样会成功。Ctrl+C 停止。

- [ ] **Step 4: 提交**

```bash
git add src/lib/voice/tts-proxy.ts
git commit -m "feat(voice): doubao TTS WebSocket proxy with mock mode"
```

---

# Phase 3: 浏览器端音频管线

## Task 10: PCM 录音器(AudioWorklet + recorder.ts)

**Files:**
- Create: `public/worklets/pcm-recorder.worklet.js`(纯 JS,Worker 线程)
- Create: `src/lib/audio/recorder.ts`

**目标:** AudioWorklet 把麦克风的 Float32 PCM 量化为 Int16,200ms 一包通过 postMessage 给主线程;recorder.ts 把这些包送到 WebSocket。

- [ ] **Step 1: 创建 AudioWorklet 处理脚本**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/public/worklets/pcm-recorder.worklet.js`(纯 JS,放 public 因为浏览器要直接 fetch):

```javascript
// PCM 录音 worklet。AudioContext 已是 16kHz,所以直接量化即可。
// 200ms × 16000Hz = 3200 samples 一包(每 sample 2 字节,共 6400 字节)
const SAMPLES_PER_CHUNK = 3200;

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Int16Array(SAMPLES_PER_CHUNK);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      // Float32 [-1, 1] → Int16 [-32768, 32767]
      let s = Math.max(-1, Math.min(1, channel[i]));
      this._buf[this._offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;

      if (this._offset >= SAMPLES_PER_CHUNK) {
        // postMessage 转移所有权
        const out = this._buf.buffer;
        this.port.postMessage(out, [out]);
        this._buf = new Int16Array(SAMPLES_PER_CHUNK);
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-recorder', PcmRecorder);
```

- [ ] **Step 2: 创建 recorder.ts**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/audio/recorder.ts`:

```typescript
export interface RecorderHandle {
  stop: () => Promise<void>;
}

/**
 * 启动一次录音会话。每 200ms 把 Int16 PCM (mono, 16kHz) 通过 onChunk 回调送出。
 * 调用方负责拿到 chunk 后转给 WebSocket / 其它消费者。
 * stop() 关闭流并等 worklet 完全断开。
 */
export async function startRecorder(opts: {
  onChunk: (pcm: ArrayBuffer) => void;
  workletUrl?: string;
}): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 16000,
    },
  });

  const ctx = new AudioContext({ sampleRate: 16000 });
  const url = opts.workletUrl ?? '/worklets/pcm-recorder.worklet.js';
  await ctx.audioWorklet.addModule(url);

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-recorder');
  source.connect(node);
  // 不连 destination — 否则会引起反馈
  node.port.onmessage = (e) => {
    opts.onChunk(e.data as ArrayBuffer);
  };

  return {
    stop: async () => {
      try {
        node.port.onmessage = null;
        node.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        await ctx.close();
      } catch (e) {
        console.warn('Recorder stop error:', e);
      }
    },
  };
}
```

- [ ] **Step 3: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错。

- [ ] **Step 4: 提交**

```bash
git add public/worklets/pcm-recorder.worklet.js src/lib/audio/recorder.ts
git commit -m "feat(voice): AudioWorklet PCM recorder (16kHz Int16)"
```

---

## Task 11: 流式 PCM 播放器

**Files:**
- Create: `src/lib/audio/pcm-player.ts`

**目标:** 用 Web Audio API 维护一个累积的 `nextStartTime`,把每个 PCM 块按精确时间戳排队播放,无 underrun;支持 stop()(立即清空队列,用于打断)。

- [ ] **Step 1: 创建 pcm-player.ts**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/audio/pcm-player.ts`:

```typescript
/**
 * 流式 PCM 播放器(Int16, mono, 24kHz)。
 * - enqueue 把一个 chunk 立刻排入,自动按累积 nextStartTime 衔接。
 * - stop 清空队列、停止所有正在响的源。
 */
export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private active = new Set<AudioBufferSourceNode>();
  private readonly sampleRate: number;

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: this.sampleRate });
      this.nextStartTime = this.ctx.currentTime;
    }
    return this.ctx;
  }

  /** 立刻把 PCM (Int16, little-endian) chunk 排入播放队列。 */
  enqueue(pcm: ArrayBuffer): void {
    const ctx = this.ensureContext();
    const i16 = new Int16Array(pcm);
    if (i16.length === 0) return;
    const buf = ctx.createBuffer(1, i16.length, this.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < i16.length; i++) {
      ch[i] = i16[i] / 0x8000;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const startAt = Math.max(this.nextStartTime, ctx.currentTime + 0.02);
    src.start(startAt);
    this.nextStartTime = startAt + buf.duration;
    this.active.add(src);
    src.onended = () => this.active.delete(src);
  }

  /** 立即停止所有正在响的 source,清空队列。 */
  stop(): void {
    for (const src of this.active) {
      try { src.stop(); } catch {}
    }
    this.active.clear();
    if (this.ctx) {
      this.nextStartTime = this.ctx.currentTime;
    }
  }

  async dispose(): Promise<void> {
    this.stop();
    if (this.ctx) {
      try { await this.ctx.close(); } catch {}
      this.ctx = null;
    }
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错。

- [ ] **Step 3: 提交**

```bash
git add src/lib/audio/pcm-player.ts
git commit -m "feat(voice): streaming PCM player with precise scheduling"
```

---

## Task 12: ASR 浏览器客户端

**Files:**
- Create: `src/lib/voice/asr-client.ts`

**目标:** 封装到 `/api/voice/asr` 的 WebSocket;提供 sendPcm / close / on('partial'|'final'|'error')。

- [ ] **Step 1: 创建 asr-client.ts**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/voice/asr-client.ts`:

```typescript
type AsrEventName = 'partial' | 'final' | 'error' | 'open' | 'close';
type Listener<T = any> = (data: T) => void;

interface AsrPartial { type: 'partial'; text: string }
interface AsrFinal { type: 'final'; text: string }
interface AsrError { type: 'error'; code: string; message: string }

type AsrServerMsg = AsrPartial | AsrFinal | AsrError;

export class AsrClient {
  private ws: WebSocket | null = null;
  private listeners: Map<AsrEventName, Set<Listener>> = new Map();

  on(event: AsrEventName, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: AsrEventName, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: AsrEventName, data?: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  async open(): Promise<void> {
    const url = (typeof window !== 'undefined' ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}` : '') + '/api/voice/asr';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => { this.emit('open'); resolve(); };
      ws.onmessage = (e) => this.handleMessage(e);
      ws.onclose = () => { this.emit('close'); };
      ws.onerror = (e) => {
        this.emit('error', { code: 'ws', message: 'WebSocket error' });
        reject(e);
      };
    });
  }

  sendPcm(pcm: ArrayBuffer): void {
    if (this.ws?.readyState === this.ws?.OPEN) {
      this.ws!.send(pcm);
    }
  }

  close(): void {
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }

  private handleMessage(e: MessageEvent): void {
    if (typeof e.data !== 'string') return;
    let msg: AsrServerMsg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'partial') this.emit('partial', msg.text);
    else if (msg.type === 'final') this.emit('final', msg.text);
    else if (msg.type === 'error') this.emit('error', { code: msg.code, message: msg.message });
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错。

- [ ] **Step 3: 提交**

```bash
git add src/lib/voice/asr-client.ts
git commit -m "feat(voice): browser ASR WebSocket client"
```

---

## Task 13: TTS 浏览器客户端

**Files:**
- Create: `src/lib/voice/tts-client.ts`

**目标:** 封装到 `/api/voice/tts` 的 WebSocket(长连);提供 startSession / sendText / finishSession / cancelSession;事件:`subtitle`, `pcm`, `session-started`, `session-finished`, `error`。

- [ ] **Step 1: 创建 tts-client.ts**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/voice/tts-client.ts`:

```typescript
type TtsEventName = 'open' | 'close' | 'error' | 'connection-started' | 'session-started' | 'session-finished' | 'subtitle' | 'sentence-end' | 'pcm';
type Listener<T = any> = (data: T) => void;

export class TtsClient {
  private ws: WebSocket | null = null;
  private listeners: Map<TtsEventName, Set<Listener>> = new Map();
  private currentSessionId: string | null = null;

  on(event: TtsEventName, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: TtsEventName, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: TtsEventName, data?: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  async open(): Promise<void> {
    const url = (typeof window !== 'undefined' ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}` : '') + '/api/voice/tts';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let opened = false;
      ws.onopen = () => { this.emit('open'); opened = true; resolve(); };
      ws.onmessage = (e) => this.handleMessage(e);
      ws.onclose = () => { this.emit('close'); };
      ws.onerror = (e) => {
        this.emit('error', { code: 'ws', message: 'WebSocket error' });
        if (!opened) reject(e);
      };
    });
  }

  startSession(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.send({ type: 'session-start', sessionId });
  }

  sendText(text: string): void {
    if (!this.currentSessionId) return;
    this.send({ type: 'text-chunk', text });
  }

  finishSession(): void {
    if (!this.currentSessionId) return;
    this.send({ type: 'session-finish' });
    this.currentSessionId = null;
  }

  cancelSession(): void {
    if (!this.currentSessionId) return;
    this.send({ type: 'session-cancel' });
    this.currentSessionId = null;
  }

  close(): void {
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }

  private send(obj: object): void {
    if (this.ws?.readyState === this.ws?.OPEN) {
      this.ws!.send(JSON.stringify(obj));
    }
  }

  private handleMessage(e: MessageEvent): void {
    if (e.data instanceof ArrayBuffer) {
      this.emit('pcm', e.data);
      return;
    }
    if (typeof e.data !== 'string') return;
    let msg: any;
    try { msg = JSON.parse(e.data); } catch { return; }
    switch (msg.type) {
      case 'connection-started': this.emit('connection-started'); break;
      case 'session-started':    this.emit('session-started', msg.sessionId); break;
      case 'session-finished':   this.emit('session-finished'); break;
      case 'subtitle':           this.emit('subtitle', msg.text); break;
      case 'sentence-end':       this.emit('sentence-end'); break;
      case 'error':              this.emit('error', { code: msg.code, message: msg.message }); break;
    }
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错。

- [ ] **Step 3: 提交**

```bash
git add src/lib/voice/tts-client.ts
git commit -m "feat(voice): browser TTS WebSocket client"
```

---

# Phase 4: 前端 UX

## Task 14: useSpacebar hook(TDD)

**Files:**
- Create: `src/hooks/useSpacebar.ts`
- Create: `src/hooks/useSpacebar.test.ts`

**目标:** 全局 keydown/keyup 监听 SPACE,屏蔽 input/textarea 聚焦时的事件,屏蔽 keydown repeat。

- [ ] **Step 1: 写测试**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/hooks/useSpacebar.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSpacebar } from './useSpacebar';

function fireKey(type: 'keydown' | 'keyup', code: string, opts: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent(type, { code, ...opts }));
}

describe('useSpacebar', () => {
  let onDown: ReturnType<typeof vi.fn>;
  let onUp: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onDown = vi.fn();
    onUp = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('calls onDown on keydown Space and onUp on keyup', () => {
    renderHook(() => useSpacebar({ onDown, onUp }));
    fireKey('keydown', 'Space');
    fireKey('keyup', 'Space');
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it('ignores repeat keydowns', () => {
    renderHook(() => useSpacebar({ onDown, onUp }));
    fireKey('keydown', 'Space');
    fireKey('keydown', 'Space', { repeat: true });
    fireKey('keydown', 'Space', { repeat: true });
    expect(onDown).toHaveBeenCalledTimes(1);
  });

  it('ignores Space when input is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useSpacebar({ onDown, onUp }));
    fireKey('keydown', 'Space');
    expect(onDown).not.toHaveBeenCalled();
  });

  it('ignores Space when textarea is focused', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    renderHook(() => useSpacebar({ onDown, onUp }));
    fireKey('keydown', 'Space');
    expect(onDown).not.toHaveBeenCalled();
  });

  it('does not fire when disabled', () => {
    renderHook(() => useSpacebar({ onDown, onUp, enabled: false }));
    fireKey('keydown', 'Space');
    fireKey('keyup', 'Space');
    expect(onDown).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
  });

  it('only one onDown after multiple keyups (no leftover state)', () => {
    renderHook(() => useSpacebar({ onDown, onUp }));
    fireKey('keydown', 'Space');
    fireKey('keyup', 'Space');
    fireKey('keydown', 'Space');
    fireKey('keyup', 'Space');
    expect(onDown).toHaveBeenCalledTimes(2);
    expect(onUp).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm test src/hooks/useSpacebar.test.ts
```

预期:全部 fail。

- [ ] **Step 3: 实现 hook**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/hooks/useSpacebar.ts`:

```typescript
import { useEffect, useRef } from 'react';

export interface SpacebarOpts {
  onDown: () => void;
  onUp: () => void;
  enabled?: boolean;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

export function useSpacebar({ onDown, onUp, enabled = true }: SpacebarOpts): void {
  const downRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (isInputFocused()) return;
      if (e.repeat) return;
      if (downRef.current) return;
      downRef.current = true;
      e.preventDefault();
      onDown();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (!downRef.current) return;
      downRef.current = false;
      e.preventDefault();
      onUp();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled, onDown, onUp]);
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm test src/hooks/useSpacebar.test.ts
```

预期:全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/hooks/useSpacebar.ts src/hooks/useSpacebar.test.ts
git commit -m "feat(voice): useSpacebar hook with input-focus and repeat guards"
```

---

## Task 15: HoldToTalkButton + Bunny 组件

**Files:**
- Create: `src/components/lesson/HoldToTalkButton.tsx`
- Create: `src/components/lesson/Bunny.tsx`

**目标:** 触屏的按住说话按钮(pointerdown/pointerup);Bunny SVG + 4 个状态对应的 CSS 动画(idle/listening/thinking/speaking)。

- [ ] **Step 1: 创建 HoldToTalkButton**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/components/lesson/HoldToTalkButton.tsx`:

```typescript
'use client';

import { useCallback, useRef } from 'react';

export interface HoldToTalkButtonProps {
  onPressStart: () => void;
  onPressEnd: () => void;
  disabled?: boolean;
  active?: boolean; // listening 中
  label?: string;
}

export function HoldToTalkButton({
  onPressStart,
  onPressEnd,
  disabled = false,
  active = false,
  label = '按住说话',
}: HoldToTalkButtonProps) {
  const pressedRef = useRef(false);

  const handleDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    if (pressedRef.current) return;
    pressedRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onPressStart();
  }, [disabled, onPressStart]);

  const handleUp = useCallback((e: React.PointerEvent) => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    onPressEnd();
  }, [onPressEnd]);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      className={[
        'select-none touch-none w-20 h-20 rounded-full flex items-center justify-center',
        'text-white text-xs font-bold shadow-lg transition-all',
        active
          ? 'bg-red-500 ring-4 ring-red-300 ring-opacity-70 animate-pulse'
          : disabled
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-blue-500 hover:bg-blue-600 active:scale-95',
      ].join(' ')}
      aria-label={label}
    >
      {active ? '说吧~' : label}
    </button>
  );
}
```

- [ ] **Step 2: 创建 Bunny 组件**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/components/lesson/Bunny.tsx`:

```typescript
'use client';

export type BunnyMood = 'idle' | 'listening' | 'thinking' | 'speaking';

interface BunnyProps {
  mood: BunnyMood;
  size?: number;
}

export function Bunny({ mood, size = 96 }: BunnyProps) {
  return (
    <div style={{ width: size, height: size, position: 'relative' }} className={`bunny bunny--${mood}`}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        {/* 耳朵 */}
        <ellipse className="bunny__ear bunny__ear--left" cx="35" cy="22" rx="6" ry="20" fill="#fbcfe8" stroke="#f9a8d4" strokeWidth="1.5" />
        <ellipse className="bunny__ear bunny__ear--right" cx="65" cy="22" rx="6" ry="20" fill="#fbcfe8" stroke="#f9a8d4" strokeWidth="1.5" />
        {/* 头 */}
        <circle className="bunny__head" cx="50" cy="55" r="28" fill="#fff" stroke="#f9a8d4" strokeWidth="2" />
        {/* 眼睛 */}
        <circle cx="40" cy="52" r="3" fill="#1f2937" />
        <circle cx="60" cy="52" r="3" fill="#1f2937" />
        {/* 鼻子 */}
        <ellipse cx="50" cy="62" rx="3" ry="2" fill="#fb7185" />
        {/* 嘴 */}
        <path className="bunny__mouth" d="M 45 67 Q 50 72 55 67" stroke="#1f2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
      <style jsx>{`
        .bunny__ear {
          transform-origin: center bottom;
        }
        .bunny--listening .bunny__ear--left {
          animation: ear-twitch-left 0.5s ease-in-out infinite;
        }
        .bunny--listening .bunny__ear--right {
          animation: ear-twitch-right 0.5s ease-in-out infinite;
        }
        .bunny--thinking .bunny__head {
          transform-origin: center;
          animation: head-tilt 1.6s ease-in-out infinite;
        }
        .bunny--speaking .bunny__mouth {
          animation: mouth-open 0.4s ease-in-out infinite;
        }
        @keyframes ear-twitch-left {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(-12deg); }
        }
        @keyframes ear-twitch-right {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(12deg); }
        }
        @keyframes head-tilt {
          0%, 100% { transform: rotate(-6deg); }
          50%      { transform: rotate(6deg); }
        }
        @keyframes mouth-open {
          0%, 100% { d: path('M 45 67 Q 50 72 55 67'); }
          50%      { d: path('M 45 65 Q 50 75 55 65'); }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 3: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错。

- [ ] **Step 4: 提交**

```bash
git add src/components/lesson/HoldToTalkButton.tsx src/components/lesson/Bunny.tsx
git commit -m "feat(voice): hold-to-talk button + bunny SVG mascot"
```

---

## Task 16: LessonController(浏览器侧调度器)

**Files:**
- Create: `src/lib/voice/lesson-controller.ts`

**目标:** 把 ASR 客户端、TTS 客户端、PCM 录音器、PCM 播放器、SSE chat 调用全部封装到一个 controller。LessonView 只订阅事件 + 渲染。

- [ ] **Step 1: 创建 LessonController**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/voice/lesson-controller.ts`:

```typescript
'use client';

import { v4 as uuidv4 } from 'uuid';
import { ToolAction } from '@/types/tools';
import { AsrClient } from './asr-client';
import { TtsClient } from './tts-client';
import { PcmPlayer } from '@/lib/audio/pcm-player';
import { startRecorder, RecorderHandle } from '@/lib/audio/recorder';

export type LessonStateName =
  | 'idle' | 'greeting' | 'awaiting' | 'listening' | 'thinking' | 'speaking' | 'ending';

type EventName =
  | 'state'
  | 'subtitle'           // { text: string, source: 'user' | 'ai' }
  | 'subtitle-clear'
  | 'actions'            // ToolAction[]
  | 'error';             // { message: string }

type Listener<T = any> = (data: T) => void;

export class LessonController {
  private state: LessonStateName = 'idle';
  private listeners = new Map<EventName, Set<Listener>>();
  private sessionId: string | null = null;

  private tts = new TtsClient();
  private asr: AsrClient | null = null;
  private player = new PcmPlayer(24000);
  private recorder: RecorderHandle | null = null;
  private chatAbort: AbortController | null = null;

  on(event: EventName, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: EventName, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: EventName, data?: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  private setState(s: LessonStateName): void {
    this.state = s;
    this.emit('state', s);
  }

  getState(): LessonStateName { return this.state; }

  // ─── 课堂生命周期 ─────────────────────────────────────────────────

  async startLesson(courseId: string): Promise<void> {
    this.setState('greeting');
    // 1) 建 TTS 长连
    await this.tts.open();
    this.bindTtsHandlers();

    // 2) 调 /api/chat?action=start,跑开场白
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', courseId }),
    });
    if (!res.ok || !res.body) {
      this.emit('error', { message: 'Failed to start lesson' });
      this.setState('idle');
      return;
    }
    this.sessionId = res.headers.get('X-Session-Id');

    await this.consumeSSE(res.body, /* afterDone= */ () => {
      this.setState('awaiting');
    });
  }

  async endLesson(): Promise<void> {
    this.setState('ending');
    this.chatAbort?.abort();
    await this.stopRecording();
    this.player.stop();
    this.tts.close();
    if (this.sessionId) {
      try {
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end', sessionId: this.sessionId }),
        });
      } catch {}
    }
    this.sessionId = null;
    await this.player.dispose();
    this.setState('idle');
  }

  // ─── 录音流程(空格键 / 长按按钮 调用)────────────────────────────

  async startListening(): Promise<void> {
    if (this.state === 'listening') return;
    // 在 speaking 状态触发 → 打断
    if (this.state === 'speaking') {
      this.player.stop();
      this.tts.cancelSession();
      this.emit('subtitle-clear');
    }
    if (this.state !== 'awaiting' && this.state !== 'speaking') return;

    this.setState('listening');
    this.emit('subtitle-clear');

    this.asr = new AsrClient();
    this.asr.on('partial', (text: string) => {
      this.emit('subtitle', { text, source: 'user' });
    });
    this.asr.on('final', (text: string) => {
      this.handleAsrFinal(text);
    });
    this.asr.on('error', (err: { message: string }) => {
      this.emit('error', err);
      this.setState('awaiting');
    });

    try {
      await this.asr.open();
    } catch {
      this.emit('error', { message: 'ASR 连接失败,请重试' });
      this.setState('awaiting');
      return;
    }

    try {
      this.recorder = await startRecorder({
        onChunk: (pcm) => this.asr?.sendPcm(pcm),
      });
    } catch (e) {
      this.emit('error', { message: '麦克风开不了哦,请允许权限' });
      this.asr?.close();
      this.setState('awaiting');
    }
  }

  async stopListening(): Promise<void> {
    if (this.state !== 'listening') return;
    await this.stopRecording();
    this.asr?.close();
    this.setState('thinking');
    // ASR final 事件会触发 handleAsrFinal → /api/chat
  }

  private async stopRecording(): Promise<void> {
    if (this.recorder) {
      await this.recorder.stop();
      this.recorder = null;
    }
  }

  // ─── ASR final → SSE chat → TTS ──────────────────────────────────

  private async handleAsrFinal(text: string): Promise<void> {
    if (!this.sessionId) return;
    if (!text || !text.trim()) {
      this.emit('subtitle', { text: '没听清呢~再说一次', source: 'ai' });
      this.setState('awaiting');
      return;
    }
    this.emit('subtitle', { text, source: 'user' });
    this.chatAbort = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', sessionId: this.sessionId, text }),
        signal: this.chatAbort.signal,
      });
      if (!res.ok || !res.body) {
        this.emit('error', { message: 'AI 没反应过来,再试一次' });
        this.setState('awaiting');
        return;
      }
      await this.consumeSSE(res.body, () => {
        // afterDone 不强制切状态;TTS session-finished 才回 awaiting
      });
    } catch (e) {
      if ((e as any).name !== 'AbortError') {
        this.emit('error', { message: '我有点没反应过来…我们再聊一句?' });
        this.setState('awaiting');
      }
    }
  }

  private bindTtsHandlers(): void {
    this.tts.on('subtitle', (text: string) => {
      this.emit('subtitle', { text, source: 'ai' });
    });
    this.tts.on('pcm', (pcm: ArrayBuffer) => {
      this.player.enqueue(pcm);
    });
    this.tts.on('session-finished', () => {
      if (this.state === 'speaking' || this.state === 'greeting') {
        this.setState('awaiting');
      }
    });
    this.tts.on('error', (err: { message: string }) => {
      this.emit('error', err);
    });
  }

  // ─── SSE 消费(speech-delta → TTS, actions → emit)────────────────

  private async consumeSSE(body: ReadableStream<Uint8Array>, afterDone: () => void): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let ttsStarted = false;
    let firstSpeech = true;

    const ensureTtsSession = () => {
      if (!ttsStarted) {
        const sid = uuidv4();
        this.tts.startSession(sid);
        ttsStarted = true;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const lines = frame.split('\n');
        let event = '';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.slice(7).trim();
          else if (line.startsWith('data: ')) data += line.slice(6);
        }
        if (!event) continue;
        let payload: any = {};
        try { payload = JSON.parse(data); } catch {}
        this.handleSseEvent(event, payload, ensureTtsSession, () => {
          if (firstSpeech) {
            firstSpeech = false;
            this.setState('speaking');
          }
        });
      }
    }
    afterDone();
  }

  private handleSseEvent(
    event: string,
    payload: any,
    ensureTtsSession: () => void,
    onFirstSpeech: () => void
  ): void {
    switch (event) {
      case 'speech-delta':
        ensureTtsSession();
        onFirstSpeech();
        this.tts.sendText(payload.text);
        break;
      case 'speech-end':
        // 不在这里 finishSession,等 actions 也来,然后 done 再 finish
        break;
      case 'actions':
        this.emit('actions', payload.actions || []);
        break;
      case 'done':
        this.tts.finishSession();
        break;
      case 'error':
        this.emit('error', { message: payload.message || 'unknown' });
        break;
    }
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错。

- [ ] **Step 3: 提交**

```bash
git add src/lib/voice/lesson-controller.ts
git commit -m "feat(voice): browser LessonController orchestrating ASR + SSE + TTS"
```

---

## Task 17: 重写 LessonView + 更新 SubtitleBar

**Files:**
- Modify: `src/components/lesson/LessonView.tsx`
- Modify: `src/components/lesson/SubtitleBar.tsx`

**目标:** 用 LessonController 替换原来的同步逻辑;接 useSpacebar、HoldToTalkButton、Bunny。SubtitleBar 支持 `source: 'user' | 'ai'`。

- [ ] **Step 1: 重写 SubtitleBar**

替换 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/components/lesson/SubtitleBar.tsx` 全文为:

```typescript
'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface SubtitleBarProps {
  text: string;
  source: 'user' | 'ai' | 'idle';
  isPlaying: boolean;
}

export function SubtitleBar({ text, source, isPlaying }: SubtitleBarProps) {
  const placeholder = source === 'idle' ? '等待开始...' : '';
  const display = text || placeholder;
  const tone =
    source === 'user' ? 'text-blue-700' :
    source === 'ai'   ? 'text-gray-800' :
                        'text-gray-400';
  return (
    <div className="w-full bg-white/90 backdrop-blur-sm rounded-lg px-6 py-4 shadow-md min-h-[60px] flex items-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={`${source}-${display}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={`text-lg leading-relaxed ${tone}`}
        >
          {source === 'user' && <span className="mr-2 text-sm text-blue-400">你:</span>}
          {display}
          {isPlaying && source === 'ai' && (
            <span className="inline-block ml-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: 重写 LessonView**

替换 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/components/lesson/LessonView.tsx` 全文为:

```typescript
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageCanvas } from './ImageCanvas';
import { SubtitleBar } from './SubtitleBar';
import { HoldToTalkButton } from './HoldToTalkButton';
import { Bunny, BunnyMood } from './Bunny';
import { Button } from '@/components/ui/Button';
import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController, LessonStateName } from '@/lib/voice/lesson-controller';
import { useSpacebar } from '@/hooks/useSpacebar';

interface LessonViewProps {
  course: Course;
}

const STATE_TO_MOOD: Record<LessonStateName, BunnyMood> = {
  idle: 'idle',
  greeting: 'speaking',
  awaiting: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  ending: 'idle',
};

export function LessonView({ course }: LessonViewProps) {
  const controllerRef = useRef<LessonController | null>(null);
  const [state, setState] = useState<LessonStateName>('idle');
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({ text: '', source: 'idle' });
  const [actions, setActions] = useState<ToolAction[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 单例 controller(挂载时建,卸载时清理)
  useEffect(() => {
    const c = new LessonController();
    controllerRef.current = c;
    c.on('state', setState);
    c.on('subtitle', (s: { text: string; source: 'user' | 'ai' }) => setSubtitle(s));
    c.on('subtitle-clear', () => setSubtitle({ text: '', source: 'idle' }));
    c.on('actions', (a: ToolAction[]) => setActions(a));
    c.on('error', (err: { message: string }) => {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    });
    return () => {
      c.endLesson().catch(() => {});
    };
  }, []);

  const canHold = state === 'awaiting' || state === 'speaking';

  useSpacebar({
    enabled: canHold,
    onDown: () => controllerRef.current?.startListening(),
    onUp: () => controllerRef.current?.stopListening(),
  });

  const handleStart = () => controllerRef.current?.startLesson(course.id);
  const handleEnd = () => controllerRef.current?.endLesson();
  const onPressStart = () => controllerRef.current?.startListening();
  const onPressEnd = () => controllerRef.current?.stopListening();

  const isPlaying = state === 'speaking' || state === 'greeting';
  const mood: BunnyMood = STATE_TO_MOOD[state];

  const helpText = useMemo(() => {
    switch (state) {
      case 'greeting': return '等老师讲完哦~';
      case 'awaiting': return '按住空格 / 按住按钮说话';
      case 'listening': return '我在听...';
      case 'thinking': return '让我想想...';
      case 'speaking': return '按住空格可以打断哦';
      default: return '';
    }
  }, [state]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }} className="bg-gray-50">
      <div className="flex items-center justify-between px-6 py-3 bg-white shadow-sm">
        <h1 className="text-xl font-bold text-gray-800">{course.title}</h1>
        {state !== 'idle' && (
          <Button variant="danger" size="sm" onClick={handleEnd}>结束课堂</Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <ImageCanvas
            images={course.images}
            currentImageId={course.images[0]?.id || ''}
            actions={actions}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <SubtitleBar
              text={subtitle.text}
              source={subtitle.source}
              isPlaying={isPlaying}
            />
            <div className="mt-1 text-xs text-gray-500 text-center">{helpText}</div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Bunny mood={mood} size={80} />
            {state === 'idle' ? (
              <Button size="lg" onClick={handleStart}>开始上课</Button>
            ) : (
              <HoldToTalkButton
                disabled={!canHold}
                active={state === 'listening'}
                onPressStart={onPressStart}
                onPressEnd={onPressEnd}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 类型检查**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
```

预期:无错。

- [ ] **Step 4: 提交**

```bash
git add src/components/lesson/LessonView.tsx src/components/lesson/SubtitleBar.tsx
git commit -m "feat(voice): rewrite LessonView with LessonController + bunny + hold-to-talk"
```

---

# Phase 5: 收尾

## Task 18: Mock 模式联调

**Files:**
- 无新文件(Mock 实现已经在 asr-proxy.ts 和 tts-proxy.ts 里)
- 但需要 MiMo LLM 的 Mock(避免本地无网络时也能跑通)

**目标:** 在 `VOICE_MOCK=true` 时:
- ASR proxy 返回固定 partial → final(已实现)
- TTS proxy 返回 200ms PCM 静音(已实现)
- LLM 也用 Mock,返回固定 JSON(避免不连 MiMo 时崩)

- [ ] **Step 1: 给 LLM 加 Mock 兜底**

打开 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/src/lib/mimo/llm.ts`,在 `streamLLM` 函数开头加 Mock 分支:

```typescript
export async function* streamLLM(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  if (process.env.VOICE_MOCK === 'true') {
    yield* mockStreamLLM();
    return;
  }
  // ... 原始实现保持不变
```

在文件末尾追加:

```typescript
async function* mockStreamLLM(): AsyncGenerator<StreamEvent> {
  const fixed = JSON.stringify({
    speech: 'Hello! 我是兔老师。Look at this. 这是 a boat,小船!你跟我说一遍,boat。',
    actions: [{ tool: 'show', params: { image_id: 'boat' } }],
    state_update: { current_word: 'boat', phase: 'learning' },
  });
  // 模拟 token 流
  const chunkSize = 8;
  for (let i = 0; i < fixed.length; i += chunkSize) {
    await sleep(50);
    yield { delta: fixed.slice(i, i + chunkSize), done: false };
  }
  yield {
    done: true,
    fullText: fixed,
    usage: { inputTokens: 100, outputTokens: 50 },
    latency: 500,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 2: 启动 Mock 模式**

在 `.env.local` 末尾追加(临时,验证完恢复):

```bash
VOICE_MOCK=true
```

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm run dev
```

打开 `http://localhost:3000`,点入一个课程,点"开始上课"。

预期:
- 看到课程封面 + 兔子(speaking 状态嘴巴动)
- 字幕逐渐打出 "Hello! 我是兔老师..."
- 状态切到 awaiting,提示 "按住空格说话"
- 按住空格 → 兔子耳朵抖动,过 1 秒看到字幕 "Hello, what is this?"
- 松开空格 → thinking → speaking,流式打字幕

- [ ] **Step 3: 验证打断**

仍在 Mock 模式:
- 点"开始上课",AI 开始说话
- 这时按空格(speaking 状态打断)
- 预期:字幕清空,进入 listening,兔子耳朵抖动

- [ ] **Step 4: 关 Mock,提交**

把 `.env.local` 里的 `VOICE_MOCK=true` 改回注释或删除。

```bash
git add src/lib/mimo/llm.ts
git commit -m "feat(voice): mock LLM for local debug without network"
```

---

## Task 19: 删除旧文件 + 真实环境联调

**Files:**
- Delete: `src/lib/mimo/asr.ts`
- Delete: `src/lib/mimo/tts.ts`
- Delete: `src/lib/audio/convert.ts`
- Delete: `src/app/api/audio/route.ts`
- Delete: `src/components/lesson/RecordButton.tsx`
- Modify: `package.json`(可选:移除 `fluent-ffmpeg` 依赖)

**目标:** 删掉被替代的 MiMo ASR / TTS 路径,跑真实豆包链路 + 完成 spec 第 11 段 E2E 验收清单。

- [ ] **Step 1: 删除文件**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
rm src/lib/mimo/asr.ts
rm src/lib/mimo/tts.ts
rm src/lib/audio/convert.ts
rm src/app/api/audio/route.ts
rm src/components/lesson/RecordButton.tsx
```

- [ ] **Step 2: 移除不再用的依赖**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm remove fluent-ffmpeg @types/fluent-ffmpeg
```

- [ ] **Step 3: 类型检查 + 单测**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm exec tsc --noEmit
pnpm test
```

预期:全部通过。如果有别处还引用被删文件,补上修复(`grep -r 'mimo/asr\|mimo/tts\|audio/convert\|RecordButton'` 检查)。

- [ ] **Step 4: 真实联调**

确认 `.env.local` 没有 `VOICE_MOCK=true`,豆包凭据正确。

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm run dev
```

打开浏览器,允许麦克风权限,跑 spec 第 11.3 段 E2E 验收清单 — 12 项全过:

| 项 | 检查 |
|----|------|
| 1 | 进入课程 → 开场白播放,无爆音 |
| 2 | 按住空格 → 兔子耳朵动 + ASR partial 实时上字幕 |
| 3 | 松开空格 → ASR final → thinking → AI 开口 |
| 4 | AI 说话时按空格 → 立刻打断 → listening |
| 5 | actions(focus/show)正确渲染到画布 |
| 6 | 5+ 轮对话不崩 |
| 7 | 用户松手 → AI 第一个字 ≤ 2s |
| 8 | ASR partial 滚动延迟 ≤ 500ms |
| 9 | 拒绝麦克风权限 → 友好提示 |
| 10 | 网络断 → 降级或友好错误 |
| 11 | 长时间不说话 → 不报错 |
| 12 | 课程切换、刷新 → 资源清理干净 |

逐项打勾。任何不过的项,记下来,后面修。

- [ ] **Step 5: 提交清理**

```bash
git add -u
git commit -m "chore(voice): remove obsolete MiMo ASR/TTS and audio convert paths"
```

---

## Task 20: 文档同步收尾(强制)

**Files:**
- Modify: `README.md`
- Modify: `docs/TODO.md`
- Create: `docs/voice-benchmarks.md`
- Modify(若需):`.env.example`

**目标:** spec 第 14 段约定 — 迭代收尾必须更新这些文档,不允许只改代码。这是用户反复强调的硬规则(memory 中的"Keep docs in sync after each iteration")。

- [ ] **Step 1: 重写 README.md**

替换 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/README.md` 全文为:

```markdown
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

详见 `docs/superpowers/specs/2026-05-01-voice-pipeline-doubao-design.md`。

## 依赖

- Next.js 14、TypeScript、Tailwind、Framer Motion
- `ws`(自定义 server WebSocket)
- `tsx`(dev/start runner — Next.js App Router 不支持 WS upgrade,所以走自定义 server)
- `dotenv`(预加载 .env.local)
- `better-sqlite3`(课程日志)
- `vitest`、`jsdom`、`@testing-library/react`(测试)

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

## 测试

```bash
pnpm test       # vitest 单测
```

主要单测:
- `src/lib/voice/doubao-codec.test.ts` — 二进制协议
- `src/lib/agent/speech-extractor.test.ts` — 流式 JSON 提取
- `src/hooks/useSpacebar.test.ts` — 空格键 hook

## 性能基线

见 `docs/voice-benchmarks.md`。

## 关键约束

- **密钥不出服务端。** 任何 `NEXT_PUBLIC_*` 前缀的豆包/MiMo 密钥都是 PR review 一票否决。
- **Push-to-talk 单一交互。** 不做撤回,不做长按短按区分,简化优先于边界 case。
- **TTS 长连复用 / ASR 按轮建连。** 详见 spec §3.6 / §4.2。
```

- [ ] **Step 2: 更新 TODO.md**

打开 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/docs/TODO.md`。

把"4. 语音延迟优化"整段改为(已完成):

```markdown
## 4. 语音延迟优化(已完成 — 2026-05-01)

- [x] 流式 TTS — 接入豆包 `seed-tts-2.0` bidirection,边合成边播
- [x] 流式 LLM — MiMo `chat/completions` stream:true,SpeechExtractor 状态机解析
- [x] 流式 ASR — 接入豆包 `bigmodel_async` 双向流式
- [x] 录音改造 — push-to-talk(空格键 / 长按按钮)

实测延迟基线见 `docs/voice-benchmarks.md`。

后续可继续优化:
- [ ] 音色微调 — 在 seed-tts-2.0 列表里挑选 / 试音色,确定最佳儿童友好音色
- [ ] WebSocket 重连退避 — 当前只重连一次,可加指数退避
- [ ] 服务端 VAD 兜底 — 万一回声消除不彻底,再加一道
```

如果"1./2./3."部分还有 P0 的录音相关任务也勾掉。

- [ ] **Step 3: 创建 voice-benchmarks.md**

新文件 `/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/docs/voice-benchmarks.md`:

```markdown
# 语音管线性能基线

**测量时间:** 2026-05-01(实施验收)
**环境:** 本地 macOS,Wi-Fi,Chrome 最新版,默认 Mac 麦克风。
**测量方法:** 跑 10 次完整轮次,在 LessonController + asr-proxy + tts-proxy 中加临时打点(实施时打点代码不入主分支,仅本次记录)。

## 实测

| 指标 | 目标 | 实测中位 | 实测 90 分位 |
|------|------|---------|--------------|
| 用户松手 → ASR final | < 500ms | TBD | TBD |
| ASR final → LLM 第一句 token | < 1s | TBD | TBD |
| LLM 第一句 token → TTS 首 PCM 包 | < 500ms | TBD | TBD |
| **首音频总延迟** | **< 2s** | **TBD** | **TBD** |
| 5 轮平均 round-trip | < 3s | TBD | TBD |

> 实施同学:跑完 10 次后把 TBD 替换为真实数字。

## 备注

- 跑测时关闭其他大流量应用(避免网络抖动)。
- 第一次 round-trip 因为 TTS WS 还没有 cache,可能比第 2 轮起慢 ~200ms;TBD 取第 2-10 轮中位。
- 如果首音频中位 > 2.5s,排查顺序:
  1. 是否真的连豆包(检查 .env / 是否误开 VOICE_MOCK)
  2. 网络 RTT 到 `openspeech.bytedance.com`
  3. LLM 首 token 延迟(MiMo 端)— 切到非流式 callLLM 看差距
```

- [ ] **Step 4: 跑 10 次实测,把 TBD 填上**

跑 10 次完整对话(按住空格,说一句话,等 AI 回应)。Chrome DevTools Network 面板可以看 SSE 时间戳;或在 `lesson-controller.ts` 临时插日志:

```typescript
// 临时打点:
console.time('asr-final-to-first-pcm');
// 在 ASR final 时 console.time('asr-final')
// 在第一个 'pcm' 事件 console.timeEnd('asr-final')
```

收 10 个数据,算中位 / 90 分位,填进 `docs/voice-benchmarks.md`。打点代码不入库,验收完删除。

- [ ] **Step 5: 提交 docs**

```bash
git add README.md docs/TODO.md docs/voice-benchmarks.md
git commit -m "docs(voice): sync README/TODO/benchmarks with voice pipeline iteration"
```

- [ ] **Step 6: 验收 self-check**

确认下面三项全部为 yes:

- [ ] `pnpm test` 全绿
- [ ] `pnpm exec tsc --noEmit` 无错
- [ ] `pnpm run dev` 起来后,跑 spec §11.3 E2E 12 项全过
- [ ] README、TODO、voice-benchmarks 三个文档真实反映当前状态(memory 反复强调"不允许只改代码不动文档")

全部通过 → 实施完成。

---

# 附录:常见坑速查

| 现象 | 排查 |
|------|------|
| 启动报 `Missing env var` | 检查 .env.local,或临时 `VOICE_MOCK=true` |
| WS upgrade 404 | server.ts 没生效?确认 `pnpm run dev` 走的是 tsx 而不是 next dev |
| 浏览器收不到 PCM | TTS 客户端 `binaryType` 没设 `'arraybuffer'` |
| 录音麦克风开不了 | 浏览器 chrome://settings/content/microphone 或重新允许 |
| Speech 字幕不流式滚 | SpeechExtractor 状态机出错;跑单测看哪个 case fail |
| ASR final 总是空 | 豆包 `result.utterances` 字段名有变?加 console.log 看原始 frame.payload |
| TTS 抽卡 / 音色变 | 检查没用 `seed-tts-2.0-expressive`,没传 `context_texts`,`use_tag_parser=false` |
| Audio context underrun | PcmPlayer 的 `+0.02` 缓冲调到 `+0.05` |

---

# 附录:执行此 plan 的建议

**Subagent-Driven 模式更适合这个 plan:**
- Task 3 / 4 / 14 是纯 TDD,subagent 自己跑测试 → 改代码 → 跑测试,fast-iteration。
- Task 8 / 9(豆包代理)涉及外部服务,real network 联调时主 session 评审更清晰。
- Task 18 / 19(联调 + 验收)需要 human-in-the-loop,主 session 操作浏览器更顺。

**关键评审检查点:**
- Task 3 完成后(codec):跑完整测试集,任何 fail 都不能放过。
- Task 6 完成后(orchestrator):手动 curl `/api/chat` action=start,看 SSE 帧是否正确。
- Task 9 完成后(TTS proxy):浏览器 console 验 `connection-started` / `session-started` 收到。
- Task 17 完成后(LessonView):VOICE_MOCK=true 下点开一个课程,流程能跑通。
- Task 19 完成后:全 12 项 E2E 验收;Task 20 让用户拍板 docs。

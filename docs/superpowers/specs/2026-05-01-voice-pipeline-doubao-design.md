# 语音管线迭代 — 接入豆包流式 ASR / TTS

**日期：** 2026-05-01
**迭代目标：** 用字节豆包流式 ASR + 流式 TTS 替换 MiMo 的非流式 ASR/TTS，把端到端首音频延迟从 ~12s 降到 ~2s，同时把录音交互改造为"按住说话"。MiMo LLM 保留不动。

---

## 1. 整体架构

### 混合式架构（豆包语音 I/O + MiMo 大脑）

```
浏览器（前端）                    服务端（Next.js 自定义 server）         上游服务
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│ AudioWorklet     │─WS────▶│ ASR 代理              │─WS────▶│ 豆包流式 ASR    │
│ 录 PCM 16kHz     │         │ asr-proxy.ts          │         │ bigmodel_async  │
│                  │◀────────│                      │◀────────│                 │
│ HoldToTalkButton │         │                      │         └─────────────────┘
│                  │         │                      │
│ LessonController │◀─SSE───│ Chat Route (SSE)      │         ┌─────────────────┐
│ (调度器)         │         │                      │         │ MiMo LLM        │
│                  │         │ SpeechExtractor       │─fetch─▶│ mimo-v2.5-pro   │
│ PCM Player       │◀─WS────│ TTS 代理              │─WS────▶│ 豆包流式 TTS    │
│ (Web Audio)      │         │ tts-proxy.ts          │◀────────│ bidirection     │
└─────────────────┘         └──────────────────────┘         └─────────────────┘
```

**为什么是混合架构而不是端到端：** 豆包 RealtimeAPI 端到端方案会替换掉 MiMo LLM，丢失我们已有的结构化 `actions`（focus/show/annotate）和课程教学逻辑。混合架构的精髓是"豆包做耳朵和嘴，MiMo 做大脑"，既拿到流式 ASR/TTS 的延迟优势，又保留所有教学侧的智能能力。

### 关键架构决策

- **三条独立通路：** ASR / LLM / TTS 各走自己的连接，独立生命周期、独立失败、独立重连。
- **服务端做 WebSocket 代理：** 浏览器不直接连豆包，所有豆包鉴权信息只在服务端用环境变量持有。
- **TTS 连接复用：** 每节课开始时建立一次 TTS WebSocket 长连，后续每轮 AI 回应只开 session 不重建连接。
- **ASR 连接按轮建立：** 每次按下空格/麦克风按钮时新建 ASR 连接，松开后发送负包 + 关连接（push_to_talk 模式）。
- **MiMo Chat 走 SSE：** `/api/chat` 响应改为 SSE 流式。
- **音频格式统一：** 浏览器录 PCM 16kHz mono int16 → ASR；TTS 返 PCM 24kHz mono int16 → 浏览器。
- **`actions` 旁路：** MiMo LLM 输出的 `actions` 与 TTS 文本并行往前端推（SSE 内分两种 event 类型），画布动画与音频独立播放，不互相阻塞。

### 延迟预算（目标 ~2s）

| 阶段 | 当前 | 目标 | 实现手段 |
|------|------|------|---------|
| ASR | ~7s（整段缓冲） | ~300-500ms | 流式 WebSocket，partial 文本边说边出 |
| LLM | ~2.5s | ~800ms（首句） | SSE 流式，token delta 即时透传 |
| TTS | ~3s（整段合成） | ~300ms（首 PCM 包） | 流式 PCM 边合成边吐 |
| **总计** | **~12s** | **~1.5-2s** | — |

---

## 2. 录音交互 — 按住说话

### 行为定义

- **桌面（有键盘）：** 按住空格键开始录音，松开结束。
- **平板（触屏）：** 手指按住按钮开始录音，抬起结束。
- **不做撤回：** 一旦松开就把录音送出，没有取消手势。用户明确选择简化优先于边界 case，本次迭代核心是验证流式语音交互。
- **去抖：** 按住空格不放只触发一次开始，忽略 `keyup`/`keydown` 的 repeat 事件。

### 触发时序

```
桌面（有键盘）:                   平板（触屏）:
─────────────                    ─────────────
按下 SPACE     → 开始录音         手指按下按钮  → 开始录音
持续按住       → 持续推 PCM       持续按住       → 持续推 PCM
松开 SPACE     → 结束录音         手指抬起       → 结束录音
```

**实现要点：**
- 全局 `keydown` / `keyup` 监听 SPACE（在 LessonView 范围内绑定，输入框聚焦时禁用）。
- 触屏：`pointerdown` / `pointerup` 在按钮上。`pointercancel` 仅做资源清理（如系统打断），不视为用户取消。
- 防 repeat：`keydown` 触发时用 ref 锁定，按住不放只触发一次开始。

### 状态机

```
[idle] ──开始上课──▶ [greeting] ──tts done──▶ [awaiting]
                                                 │
                       ┌─────────────────────────┘
                       ▼
                [listening] ◀──── 松开
                  (录音中)
                       │
                  asr final
                       ▼
                [thinking]
                  (LLM 流式)
                       │
                  首个 TTS chunk
                       ▼
                [speaking]
                  (TTS 流式播放)
                       │
                  TTS 结束
                       ▼
                [awaiting]  (循环)

任何状态 ──结束课堂──▶ [ending] ──完成──▶ [idle]
```

### 视觉反馈 — 小兔子

小兔子 SVG 角色提供视觉反馈，纯 CSS/SVG 实现，**不引入** Lottie/Rive 等动画库。四个状态对应 LessonView 的状态机（详见第 7 段视觉映射表）：

| LessonView 状态 | 兔子动作 |
|---|---|
| `idle` / `awaiting` / `greeting` | 安静坐着，耳朵下垂 |
| `listening` | 耳朵竖立 + 抖动（CSS keyframes） |
| `thinking` | 歪头思考（头部轻微摆动） |
| `speaking` | 嘴巴一张一合 |

设计目标：让小朋友"看一眼就知道现在该做什么"。这次迭代的核心是验证流式语音交互，兔子是辅助而非核心。

### 音频采集管线

```
MediaStream (getUserMedia)
    │
    ▼
AudioContext (sampleRate=16000)        ← 直接以目标采样率创建，省一次 resample
    │
    ▼
MediaStreamAudioSourceNode
    │
    ▼
AudioWorkletNode (pcm-recorder.js)     ← Worker 线程，避免主线程卡顿
    │  每 200ms 一包（200ms × 16000Hz × 2byte = 6400 字节）
    │  Float32Array → Int16Array 量化
    ▼
WebSocket.send(arrayBuffer)            ← 二进制帧直传
```

**为什么用 AudioWorklet 而不是 MediaRecorder：**
- MediaRecorder 只能输出 webm/ogg/mp4 容器，要再解码成 PCM。
- AudioWorklet 直接拿到原始 Float32 PCM，零转码、零延迟、无需 ffmpeg。
- 浏览器兼容性：Chrome / Safari / Edge 全 OK。

**关键技术细节：**
- 采样率适配：`AudioContext({ sampleRate: 16000 })` 让浏览器内建 resampler 处理用户麦克风的 44.1k/48k → 16k 转换。
- 包大小：200ms / 包（豆包文档原话："双向流式模式选取 200ms 大小的分包性能最优"）。
- 静音处理：push_to_talk 模式下不需要补静音，按下到松开期间正常推音频。
- 回声抑制：`getUserMedia({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })`，防止 AI 还在说话时录到自己的声音。

---

## 3. 豆包流式 ASR 集成

### 端点

```
wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async
```

双向流式优化版：不再是每包输入对应一包返回，只有当结果有变化时才会返回新数据包，性能（rtf 和首字、尾字时延）均有提升。

### 鉴权头（服务端代理拼装，凭据来自环境变量）

| Header | Value |
|--------|-------|
| `X-Api-App-Key` | `DOUBAO_APP_ID` |
| `X-Api-Access-Key` | `DOUBAO_ACCESS_KEY` |
| `X-Api-Resource-Id` | `volc.seedasr.sauc.duration` |
| `X-Api-Request-Id` | 每次新建一个 UUID |
| `X-Api-Sequence` | -1 |

### 二进制协议 — Header 格式

豆包使用自定义二进制协议，**所有整数使用大端序**。

```
Byte 0:  [Protocol version (4bit)] [Header size (4bit)]
Byte 1:  [Message type (4bit)]     [Message type specific flags (4bit)]
Byte 2:  [Serialization method (4bit)] [Compression (4bit)]
Byte 3:  [Reserved (8bit)]
```

#### Protocol version (4 bit)
| Value | 含义 |
|-------|------|
| `0b0001` | Version 1（目前唯一版本） |

#### Header size (4 bit)
| Value | 含义 |
|-------|------|
| `0b0001` | Header 大小 = 4 字节（1 × 4） |

#### Message type (4 bit)
| Value | 含义 |
|-------|------|
| `0b0001` | Full-client request（客户端发送文本事件） |
| `0b0010` | Audio-only request（客户端发送音频数据） |
| `0b1001` | Full-server response（服务端返回识别结果） |
| `0b1111` | Error information（服务端错误事件） |

#### Message type specific flags (4 bit)
| Value | 含义 |
|-------|------|
| `0b0000` | Header 后无 sequence number |
| `0b0001` | Header 后 4 字节为正序号 |
| `0b0010` | 无序号，仅指示此为最后一包（负包） |
| `0b0011` | Header 后 4 字节为负序号（最后一包） |

#### Serialization method (4 bit)
| Value | 含义 |
|-------|------|
| `0b0000` | 无序列化（raw binary，用于 PCM） |
| `0b0001` | JSON 格式 |

#### Compression (4 bit)
| Value | 含义 |
|-------|------|
| `0b0000` | 无压缩 |
| `0b0001` | Gzip 压缩 |

### 二进制协议 — 帧结构

```
┌──────────┬──────────────┬───────────────┐
│ Header   │ Payload Size │ Payload       │
│ (4 bytes)│ (4 bytes)    │ (变长)        │
│          │ 大端         │ JSON 或 PCM   │
└──────────┴──────────────┴───────────────┘
```

部分消息类型会在 header 之后、payload size 之前携带可选字段（sequence number、event ID、session ID 等），由 message type specific flags 决定。

### Full Client Request Payload

WebSocket 建连后发送的第一个请求，payload 为 JSON：

```json
{
  "user": {
    "uid": "eduagent-<sessionId>",
    "platform": "web"
  },
  "audio": {
    "format": "pcm",
    "rate": 16000,
    "bits": 16,
    "channel": 1
  },
  "request": {
    "model_name": "bigmodel",
    "enable_punc": true,
    "enable_ddc": true,
    "result_type": "single"
  }
}
```

字段说明：
- `format`: 音频容器，pcm / wav / ogg / mp3。
- `rate`: 采样率，目前只支持 16000。
- `bits`: 采样点位数，16。
- `channel`: 1（mono）。
- `model_name`: 目前只有 `bigmodel`。
- `enable_punc`: 启用标点（开启）。
- `enable_ddc`: 启用语义顺滑（开启，方便后续按句切给 TTS 用）。
- `result_type`: `single` 增量返回，省带宽。

### 连接生命周期

- ASR WebSocket 连接**按轮建立**（每次 push-to-talk 新建一个连接）。
- 流程：建连 → 发 full_client_request → 双向转发循环 → 发负包 → 等最终结果 → 关闭。

### ASR 代理状态机

```
前端连接到 /api/voice/asr (WebSocket Upgrade)
        │
        ▼
代理立刻向豆包发起 WebSocket 连接（携带鉴权 headers）
        │
        ▼
代理向豆包发 full_client_request (JSON, 音频配置)
        │
        ▼ ─── 进入双向转发循环 ───
        │
        ◀── 前端二进制帧 (PCM 200ms) ──
        ──→ 包装成 audio_only_request 转给豆包
        │
        ◀── 豆包 full_server_response (识别结果 JSON) ──
        ──→ 解析 → 提取 text → 转发给前端 (JSON)
        │
        ◀── 前端关闭 WS ──
        ──→ 给豆包发最后一包（flags=0b0010 负包，空 payload）
        ──→ 等豆包返回最终 result → 转发 → 关闭
```

### 前端契约（简化）

前端不直接处理豆包二进制协议，代理把豆包结果转成简单 JSON：

```typescript
// 前端收到的事件（JSON 文本帧）
type AsrEvent =
  | { type: 'partial'; text: string }       // 实时部分文本
  | { type: 'final';   text: string }       // 最终确定文本
  | { type: 'error';   code: string; message: string };

// 前端发的：纯二进制 PCM 帧（200ms 一包）
ws.send(pcmInt16ArrayBuffer);

// 结束：关闭 WS
ws.close();
```

### 音频格式

- 浏览器录音：PCM 16kHz, mono, int16, 小端序。
- 每包大小：200ms × 16000Hz × 2byte = 6400 字节。

---

## 4. 豆包流式 TTS 集成

### 端点

```
wss://openspeech.bytedance.com/api/v3/tts/bidirection
```

### 鉴权头

| Header | Value |
|--------|-------|
| `X-Api-App-Id` | `DOUBAO_APP_ID` |
| `X-Api-Access-Key` | `DOUBAO_ACCESS_KEY` |
| `X-Api-Resource-Id` | `seed-tts-2.0` |
| `X-Api-Connect-Id` | UUID |

### 连接生命周期（长连复用）

TTS 跟 ASR 不一样：**WebSocket 连接长期保活**，每轮 AI 回应只开一个 session：

```
课堂开始 → 服务端为这节课开一个 TTS WebSocket
  │
  ├── 发 StartConnection (event=1)
  │   ◀── ConnectionStarted (event=50)
  │
  ├── 第 1 轮 AI 回应:
  │     发 StartSession (event=100, sessionId=uuid1, 配置音色等)
  │       ◀── SessionStarted (event=150)
  │     发 TaskRequest (event=200, sessionId=uuid1, payload="Hello!")
  │     发 TaskRequest (event=200, sessionId=uuid1, payload=" Look at this.")
  │     ...                          ← LLM 流式 token 来一段就推一段
  │       ◀── TTSSentenceStart (event=350)
  │       ◀── TTSResponse (event=352, binary PCM) × N
  │       ◀── TTSSentenceEnd  (event=351)
  │     发 FinishSession (event=102)
  │       ◀── SessionFinished (event=152)
  │
  ├── 第 2 轮 AI 回应: 重开 session（uuid2）...
  │
  └── 课堂结束: 发 FinishConnection (event=2) → 关 WS
```

豆包文档原话："**同一个 WebSocket 连接下支持多次 session，但不支持同时多个 session**"。这个约束正好对得上"AI 一次只说一段话"的语义。

### Event ID 参考

| Event ID | 名称 | 方向 | 说明 |
|---------|------|------|------|
| 1 | StartConnection | Client → Server | 建立连接 |
| 2 | FinishConnection | Client → Server | 关闭连接 |
| 50 | ConnectionStarted | Server → Client | 连接建立成功 |
| 100 | StartSession | Client → Server | 开始一个 TTS session |
| 101 | CancelSession | Client → Server | 取消当前 session（用于打断） |
| 102 | FinishSession | Client → Server | 正常结束 session |
| 150 | SessionStarted | Server → Client | session 启动成功 |
| 152 | SessionFinished | Server → Client | session 结束 |
| 200 | TaskRequest | Client → Server | 发送待合成文本 |
| 350 | TTSSentenceStart | Server → Client | 一句话开始（含文本，用于字幕） |
| 351 | TTSSentenceEnd | Server → Client | 一句话结束 |
| 352 | TTSResponse | Server → Client | PCM 音频数据（二进制帧） |

### StartSession 配置（一致性策略落地）

```json
{
  "event": 100,
  "namespace": "BidirectionalTTS",
  "req_params": {
    "speaker": "<seed-tts-2.0 列表里的儿童友好女声，实施阶段定档>",
    "model": "seed-tts-2.0-standard",
    "audio_params": {
      "format": "pcm",
      "sample_rate": 24000,
      "speech_rate": -10,
      "loudness_rate": 0
    },
    "additions": {
      "disable_markdown_filter": false,
      "cache_config": {
        "text_type": 1,
        "use_cache": true,
        "use_segment_cache": true
      }
    }
  }
}
```

### 音色一致性策略

| 设置项 | 选择 | 原因 |
|---------|------|------|
| 模型 | `seed-tts-2.0-standard` | 稳定优先，不抽卡（expressive 版"可能存在抽卡"，文档原话） |
| Speaker | 固定一个 seed-tts-2.0 列表里的儿童友好女声（实施阶段定档） | 选定后不再改；不开试听页，节省时间 |
| 情感参数 | 固定一套 | 不动态调整，避免随机化 |
| 缓存 | 开启（`use_cache: true`, `use_segment_cache: true`） | 完全相同文本 1 小时内复用，开场白/提示语 100% 一致 |
| `use_tag_parser` | false（不用 CoT 标签） | CoT 标签会显式改变语气 |
| `context_texts` | 不传 | 该字段会让语气变化 |

按这套策略落地后，每次 AI 老师开口的"基线音色 + 情绪"是稳定的。会有的"差别"只剩 neural TTS 的自然 prosody 变化（同一句话在不同上下文略有差异），听感上是"有生气而不是机械"，不是缺陷。

### 音频格式

- 豆包返回：**PCM 16-bit, 24kHz, mono**（小端序）。
- 浏览器用 Web Audio API `AudioContext` 在 24kHz 播放。
- 每个音频块到达后立刻入队播放，不缓冲（流式）。

### TTS 代理状态机

```
/api/voice/tts (WebSocket) — 每节课一个连接
  │
  前端连接到代理 →
        │
        ▼
  代理与豆包建立 TTS WS（一次性，长连）
        │
  代理发 StartConnection (event=1)
        ◀── ConnectionStarted (event=50)
        │
        ▼ ─── 进入"等待 session 请求"状态 ───
        │
        ◀── 前端 JSON 帧: { type: "session-start", sessionId }
        ──→ 代理向豆包发 StartSession (event=100)
              ◀── SessionStarted (event=150) → 转发给前端
        │
        ◀── 前端 JSON 帧: { type: "text-chunk", text: "Hello!" }
        ──→ 代理向豆包发 TaskRequest (event=200, payload=text)
        │
        ◀── 豆包 TTSSentenceStart (event=350) {text}
        ──→ 转发: { type: "subtitle", text }
        ◀── 豆包 TTSResponse (event=352) {pcm}
        ──→ 转发: 二进制 PCM 帧
        ◀── 豆包 TTSSentenceEnd (event=351)
        ──→ 转发: { type: "sentence-end" }
        │
        ◀── 前端 JSON 帧: { type: "session-finish" }
        ──→ 代理向豆包发 FinishSession (event=102)
              ◀── SessionFinished (event=152) → 转发
        │
        ◀── 前端中途 { type: "session-cancel" }
        ──→ 代理向豆包发 CancelSession (event=101)
        │
        ── 课程结束 ──
        ──→ 代理向豆包发 FinishConnection (event=2)
        ──→ 关 WS
```

### 前端契约（简化）

```typescript
// 前端发：JSON 文本帧
type TtsRequest =
  | { type: 'session-start'; sessionId: string }
  | { type: 'text-chunk';    text: string }
  | { type: 'session-finish' }
  | { type: 'session-cancel' };                // 打断

// 前端收：混合帧
//   - 二进制帧：PCM 数据 → 直接灌进播放队列
//   - JSON 帧：
type TtsEvent =
  | { type: 'session-started'; sessionId: string }
  | { type: 'subtitle';        text: string }
  | { type: 'sentence-end' }
  | { type: 'session-finished' }
  | { type: 'error'; code: string; message: string };
```

---

## 5. MiMo LLM 流式化 + 后端编排

### 改动逻辑

当前 `/api/chat` 是同步：等 MiMo 全部返回 → 一次性 `NextResponse.json`。本次改成 **SSE 流式**，让 LLM 出 token 的同时往前端 + TTS 推。

调用形式：

```
POST /v1/chat/completions
{
  "model": "mimo-v2.5-pro",
  "stream": true,
  "response_format": { "type": "json_object" },
  ...
}
```

Base URL: `https://token-plan-cn.xiaomimimo.com/v1`
Auth: `Authorization: Bearer` header

### 结构化输出难题

我们的 LLM 输出是 JSON，长这样：

```json
{
  "speech": "Hello! Look at this. It's a boat!",
  "actions": [{ "tool": "show", "params": { "image_id": "boat" } }, ...],
  "state_update": { "current_word": "boat" }
}
```

而 MiMo 用 `response_format: { type: 'json_object' }` 流式输出时，token 是按字节顺序出的：

```
{"speech": "Hello! Look at this. It
              ^----- 这时候我们必须能取出 "Hello! Look at this. It" 推给 TTS，
                     而不是等整个 JSON 解析完
```

### 解决方案：流式 JSON 字段提取器

写一个轻量的"流式 JSON 字段读取器"`StreamingSpeechExtractor`，专门解析 `"speech": "..."` 字段，**不等 JSON 收尾**：

**状态机：** `LOOKING_FOR_KEY` → `IN_KEY` → `COLON` → `VALUE_START` → `IN_STRING` → `IN_STRING_ESCAPE` → `DONE`

**输出：** 从 delta token 中持续吐出 speech 文本片段（处理 `\"` `\\` `\n` `\uXXXX` 转义）。

**接口：**

```typescript
class StreamingSpeechExtractor {
  feed(chunk: string): { speechDelta?: string; complete?: boolean }
  finalize(fullJson: string): AgentResponse  // 全部 token 收到后正常 JSON.parse 拿 actions
}
```

**为什么这么做：**
- `speech` 字段必须流式给 TTS（核心目标，决定首音频延迟）。
- `actions` 必须等完整才能用（数组结构，部分数组无法渲染）。
- `state_update` 同理。

**为什么不用备选方案（两次 LLM 调用）：**
- 单次 LLM 成本低、延迟最优。
- 提取器约 50-100 行代码不算复杂。
- 备选方案多 500ms 延迟。

### 两条独立时间线

一个 LLM 响应在前端展开成两条独立时间线：

- **音频/字幕线：** speech 字符流 → TTS WS → PCM 播放（实时）。
- **画布线：** 等 JSON 完整 → actions 数组 → 画布动画（晚 1-2s 出现，可接受）。

### LLM ↔ TTS 衔接策略

豆包 TTS 文档建议："**推荐将流式输出的文本直接输入该接口，而不要额外增加切句或者攒句的逻辑。同样的文本调用一次该接口与多次调用合成接口相比，前者会更为自然，情绪更饱满**"。

**策略：LLM 每个 delta 一来就直接 `TaskRequest` 推过去，让豆包自己内部 buffer + 切句。不做客户端切句。**

用户明确表态："要的是效果"——所以选择"自然/情绪饱满"优于"代码上的可预测性"。

### SSE 协议

`POST /api/chat`（message action）返回 `text/event-stream`：

```
event: speech-delta
data: {"text": "Hello"}

event: speech-delta
data: {"text": "! Let's"}

event: speech-end
data: {}

event: actions
data: {"actions": [{ "tool": "show", ... }], "state_update": {...}}

event: done
data: {}
```

前端用 `fetch + ReadableStream` 订阅（POST 方式，因为现有 `/api/chat` 用的是 POST + body），一边往 TTS WS 推 speech-delta，一边等 actions 事件渲染画布。

### 编排时序

```
用户松手（ASR final 事件来）
  │
  ▼
前端 POST /api/chat (action=message) ──────── SSE 开始 ────┐
  │                                                        │
  │   服务端：                                              │
  │     ├── getSession                                      │
  │     ├── memory.update(userInput)                        │
  │     ├── 调 MiMo /chat/completions stream:true           │
  │     │     │                                             │
  │     │     ▼ token 来一段                                │
  │     ├── StreamingSpeechExtractor.feed(token)            │
  │     │     │                                             │
  │     │     ▼ 有 speech delta                             │
  │     ├── send SSE: event=speech-delta                    │
  │     │                                                   │
  │     └── token 流结束                                    │
  │           ├── parse 完整 JSON                           │
  │           ├── memory.commitState(state_update)          │
  │           ├── send SSE: event=actions                   │
  │           └── send SSE: event=done                      │
  │                                                        │
  ▼                                                        │
前端处理:                                                    │
  speech-delta → tts.send({type:'text-chunk', text})        │
  actions      → setActions(...)                            │
  done         → tts.send({type:'session-finish'})          │
                                                            │
  整条 SSE 关闭 ─────────────────────────────────────────┘
```

---

## 6. 浏览器端音频管线

### 录音管线（AudioWorklet）

详见第 2 段"音频采集管线"小节。要点：

- AudioContext 直接 16kHz 采样率创建。
- AudioWorklet 在 worker 线程做 Float32 → Int16 量化、200ms 分包。
- 二进制 ArrayBuffer 直传 WebSocket。

### 播放管线（Web Audio 流式队列）

```typescript
// 维护一个累积的 nextStartTime
let nextStartTime = audioContext.currentTime;

function enqueue(pcm: Int16Array) {
  const buffer = audioContext.createBuffer(1, pcm.length, 24000);
  buffer.getChannelData(0).set(float32Of(pcm));

  const src = audioContext.createBufferSource();
  src.buffer = buffer;
  src.connect(audioContext.destination);

  // 关键：用 currentTime 防止 underrun
  const startAt = Math.max(nextStartTime, audioContext.currentTime + 0.02);
  src.start(startAt);
  nextStartTime = startAt + buffer.duration;
}
```

**为什么不用 `<audio>` 标签：** HTMLAudioElement 不支持流式喂 PCM；MSE（Media Source Extensions）也不支持 raw PCM。必须走 Web Audio API + 精确时间调度。

### 字幕同步

TTS WS 事件流中，`TTSSentenceStart` 事件包含整句文本。字幕策略：

- `TTSSentenceStart` 到时立刻设置 `subtitle = text`，**不等音频**。
- 视觉上字幕领先音频 100-200ms，对小朋友更友好（先看到字再听到声音）。
- 不做字级时间戳同步（`enable_subtitle` 复杂度高，本次迭代不上）。

### 打断处理

用户在 `speaking` 状态下按住空格 → 立刻：

1. `audioBufferSources.forEach(s => s.stop())` 清空播放队列。
2. TTS WS 发 `session-cancel`（豆包 event=101）→ 豆包停止合成节省 token。
3. 字幕清空。
4. 进入 `listening`。

这给了小朋友"我说话比 AI 快也没关系"的反馈，避免要等 AI 说完才能讲。

---

## 7. 前端状态机 + UX

### LessonView 完整状态机

```
       ┌──────────┐
       │   idle   │  课程未开始
       └─────┬────┘
             │ 点击"开始上课"
             │ 建立 TTS WS 长连
             ▼
       ┌──────────┐
       │ greeting │  AI 开场白合成 + 播放中
       └─────┬────┘
             │ 开场白播完
             ▼
       ┌──────────┐
   ┌──▶│ awaiting │  等待用户按住空格 / 按钮
   │   └─────┬────┘
   │         │ keydown SPACE / pointerdown
   │         │ 打断当前 TTS 播放（如果有）
   │         │ 建立 ASR WS
   │         ▼
   │   ┌──────────┐
   │   │listening │  小兔子听耳朵动 + ASR partial 字幕滚动
   │   └─────┬────┘
   │         │ keyup / pointerup
   │         │ 关闭 ASR WS（发负包）
   │         ▼
   │   ┌──────────┐
   │   │thinking  │  等 ASR final + 触发 /api/chat SSE
   │   └─────┬────┘
   │         │ SSE 第一个 speech-delta 来
   │         │ 转发给 TTS WS
   │         ▼
   │   ┌──────────┐
   │   │speaking  │  AI 说话中（PCM 边到边播 + 字幕领先）
   │   └─────┬────┘
   │         │ TTS session-finished
   │         │ 课堂未结束
   └─────────┘
             │ 用户点"结束课堂"
             ▼
       ┌──────────┐
       │  ending  │  关 TTS WS / 清理资源
       └──────────┘
```

### 状态-视觉映射表

| 状态 | 主视觉 | 字幕 | 按钮区 |
|------|--------|------|------|
| idle | 课程封面 | 空 | "开始上课"按钮 |
| greeting | 课程图 | AI 字幕（领先） | 灰色禁用麦克风（提示"等老师讲完哦"） |
| awaiting | 课程图 | AI 字幕保留 | 兔子安静坐着 + 提示"按住说话" |
| listening | 课程图 | ASR partial 实时滚 | 兔子耳朵抖动 + 红色边框脉动 |
| thinking | 课程图 | "..." 三点动画 | 兔子歪头思考 |
| speaking | 课程图 | AI 字幕（领先） | 兔子嘴巴动 + 灰色（按住可打断） |

### Greeting 状态禁麦

`greeting` 状态时禁用麦克风（小朋友等老师讲完），不允许打断。这是为了避免一进入课堂小朋友"乱按"导致体验混乱。

### 打断时序

用户在 `speaking` 状态按住空格 → 立刻：

1. PCM 播放队列全部 stop。
2. TTS WS 发 `session-cancel`。
3. 字幕清空。
4. 进入 `listening`。

### 错误处理

| 错误来源 | 处理 |
|---------|------|
| ASR WS 建连失败 | 提示"麦克风开不了哦，再试一次" + 回到 awaiting |
| ASR final 为空 | 字幕"没听清呢~再说一次"，回到 awaiting，不调 LLM |
| MiMo SSE 异常 | 已经播放出去的不撤回，字幕"我有点没反应过来…我们再聊一句？"，回到 awaiting |
| TTS WS 断连 | 自动重连一次；再失败即报错，当轮回应改用兜底 alert |
| 浏览器麦克风权限拒绝 | 提示开权限的引导（首次进入时主动 request） |

### LessonController（统一调度器）

把三条 WebSocket / SSE 线封装到一个 controller 里，让 LessonView 只关心 UI 状态：

```typescript
class LessonController extends EventEmitter {
  startLesson(courseId: string): Promise<void>
  startListening(): void              // 空格按下
  stopListening(): void               // 空格松开
  endLesson(): void

  // 事件 emit:
  // on('subtitle', (text: string, source: 'user'|'ai') => ...)
  // on('actions', (actions: ToolAction[]) => ...)
  // on('state', (state: LessonState) => ...)
  // on('error', (err: Error) => ...)
}
```

LessonView 只订阅事件 + 渲染。voice 管线和 UI 解耦，未来好扩展（比如换 ASR 提供商也只动 controller 内部）。

---

## 8. 自定义 Next.js Server

### 问题

Next.js App Router 的 Route Handlers 不支持 WebSocket upgrade 事件。

### 方案

写一个自定义 `server.ts` 包裹 Next.js：

```typescript
import { createServer } from 'http';
import next from 'next';
import { handleASRUpgrade } from './src/lib/voice/asr-proxy';
import { handleTTSUpgrade } from './src/lib/voice/tts-proxy';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const server = createServer((req, res) => {
  handle(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/api/voice/asr') {
    handleASRUpgrade(req, socket, head);
  } else if (req.url === '/api/voice/tts') {
    handleTTSUpgrade(req, socket, head);
  }
});

app.prepare().then(() => {
  server.listen(3000, () => {
    console.log('Server ready on http://localhost:3000');
  });
});
```

### `npm scripts` 调整

```json
{
  "dev": "tsx watch server.ts",
  "build": "next build",
  "start": "NODE_ENV=production tsx server.ts"
}
```

开发模式用 `tsx watch` 替代 `next dev`，支持 WebSocket upgrade + 热重载。用户已确认接受这个改动（"重过都没关系"），目标是本地部署验证。

---

## 9. 鉴权与密钥管理

### 环境变量

新增 `.env.local`（不入库）：

```bash
# MiMo（保留，仅 LLM 用）
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_API_KEY=<MIMO_KEY_REDACTED>

# 豆包 ASR + TTS（共享 AppID/Token）
DOUBAO_APP_ID=<DOUBAO_APP_ID_REDACTED>
DOUBAO_ACCESS_KEY=<DOUBAO_ACCESS_KEY_REDACTED>
DOUBAO_ASR_RESOURCE_ID=volc.seedasr.sauc.duration
DOUBAO_TTS_RESOURCE_ID=seed-tts-2.0

# TTS 默认音色（实施阶段从 seed-tts-2.0 列表选定后填入）
DOUBAO_TTS_DEFAULT_SPEAKER=<implementation>
```

### 密钥流向

```
浏览器                        Node 服务端                       豆包
──────                        ────────────                       ────
不持有任何密钥                  process.env.DOUBAO_*              接收 X-Api-* 头
                              ▲
                              │ 服务端代理时拼装鉴权头
连接 ws://localhost:3000/api/voice/asr
                  ──────────▶ 接受 upgrade
                              建立到豆包的 ws + 注入 headers
                                                ──────────▶
```

**硬规则：绝对不会把任何豆包/MiMo 密钥发到浏览器。** 这条原则在代码评审时是硬规则，发现有 `NEXT_PUBLIC_*` 前缀的密钥变量直接打回。

### Git 安全

- `.env.local` 进 `.gitignore`。
- `.env.example` 进库，全是占位符。
- spec 文档里的真实凭据需要在提交前移除（或单独管理）。

### `.env.example`（模板）

```bash
# MiMo LLM
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_API_KEY=your-mimo-api-key

# 豆包语音（ASR + TTS）
DOUBAO_APP_ID=your-app-id
DOUBAO_ACCESS_KEY=your-access-key
DOUBAO_ASR_RESOURCE_ID=volc.seedasr.sauc.duration
DOUBAO_TTS_RESOURCE_ID=seed-tts-2.0
DOUBAO_TTS_DEFAULT_SPEAKER=your-speaker-id
```

### 启动校验

`src/lib/init.ts` 在启动时执行一次：

```typescript
const required = [
  'MIMO_BASE_URL', 'MIMO_API_KEY',
  'DOUBAO_APP_ID', 'DOUBAO_ACCESS_KEY',
  'DOUBAO_ASR_RESOURCE_ID', 'DOUBAO_TTS_RESOURCE_ID',
];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing env var: ${key}. See .env.example`);
  }
}
```

---

## 10. 文件结构

### 删除

| 文件 | 原因 |
|------|------|
| `src/lib/mimo/asr.ts` | 由豆包 ASR WebSocket 替代 |
| `src/lib/mimo/tts.ts` | 由豆包 TTS WebSocket 替代 |
| `src/lib/audio/convert.ts` | AudioWorklet 直接出 PCM，不再需要 ffmpeg webm→wav |
| `src/app/api/audio/route.ts` | ASR/TTS 都走 WebSocket，HTTP 路由没用了 |
| `src/components/lesson/RecordButton.tsx` | 由 HoldToTalkButton 替代 |

### 修改

| 文件 | 改动 |
|------|------|
| `src/lib/mimo/llm.ts` | 加流式支持（`stream: true`），返回 async generator |
| `src/lib/agent/session.ts` | `processUserInput` 改为流式接口，逐段产出 speech delta |
| `src/lib/agent/memory.ts` | 适配流式调用的 commit 时机（state_update 在 actions 事件后提交） |
| `src/components/lesson/LessonView.tsx` | 全面重写：新状态机 + 集成 LessonController |
| `src/components/lesson/SubtitleBar.tsx` | 支持 partial（用户）和 leading（AI）两种风格 |
| `src/lib/init.ts` | 加豆包 env 变量校验 |
| `src/app/api/chat/route.ts` | 改为 SSE，`message` action 走流式 |
| `package.json` | 加 `ws`、`tsx` 依赖；更新 `dev` / `start` 脚本 |
| `tsconfig.json` | 加 `tsconfig.server.json` 引用 |

### 新增

| 文件 | 用途 |
|------|------|
| `server.ts` | 自定义 Next.js server，接管 WebSocket upgrade |
| `tsconfig.server.json` | 服务端 TypeScript 配置 |
| `src/lib/voice/doubao-codec.ts` | 二进制协议编解码（ASR/TTS 共用） |
| `src/lib/voice/asr-proxy.ts` | 服务端 ASR WebSocket 代理（浏览器 ↔ 豆包） |
| `src/lib/voice/tts-proxy.ts` | 服务端 TTS WebSocket 代理（浏览器 ↔ 豆包） |
| `src/lib/voice/asr-client.ts` | 前端 ASR 客户端封装 |
| `src/lib/voice/tts-client.ts` | 前端 TTS 客户端封装 |
| `src/lib/voice/lesson-controller.ts` | 调度器：统一编排 ASR + LLM SSE + TTS 三条线 |
| `src/lib/agent/speech-extractor.ts` | 流式 JSON `speech` 字段提取器 |
| `src/lib/agent/orchestrator.ts` | SSE 编排逻辑（聚合 LLM + memory + actions） |
| `src/lib/audio/pcm-recorder.worklet.ts` | AudioWorklet 处理脚本：Float32 → Int16，200ms 分包 |
| `src/lib/audio/recorder.ts` | 录音器封装类，绑定 getUserMedia 到 WebSocket |
| `src/lib/audio/pcm-player.ts` | 流式 PCM 播放队列（Web Audio API） |
| `src/components/lesson/HoldToTalkButton.tsx` | 按住说话按钮组件 |
| `src/components/lesson/Bunny.tsx` | SVG 兔子动画（耳朵抖/嘴巴动） |
| `src/hooks/useSpacebar.ts` | 空格键 keydown/keyup hook，处理 repeat、focus |
| `.env.example` | 环境变量模板（脱敏占位符） |

---

## 11. 测试与验收

### 单元测试（vitest）

```
src/lib/voice/__tests__/doubao-codec.test.ts
  - encode/decode 各种 message type 来回 roundtrip
  - 边界：sessionId 长度、payload 0 字节、错误码帧
  - 大端序整数读写

src/lib/agent/__tests__/speech-extractor.test.ts
  - 各种 LLM 流式 chunk 进来能正确吐出 speech delta
  - 处理转义：\" \\ \n \uXXXX
  - 处理 speech 字段不在最前的情况
  - 处理 actions 出现在 speech 之前的情况
  - 处理畸形 JSON（最后整体 parse 失败时的兜底）
```

### Mock 模式（集成测试）

环境变量 `VOICE_MOCK=true` 时启用，让本地不连豆包也能跑全链路：

- Mock ASR：定时返回固定文本（模拟 partial → final）。
- Mock TTS：返回 `/public/mock-audio/*.pcm`。
- 用于 CI 和无网络环境调试。

### E2E 验收清单（共 12 项，人工跑）

实施完后必须人工过一遍：

**核心流程：**
- [ ] 进入课程 → 开场白能正常播放，PCM 衔接无爆音
- [ ] 按住空格 → 兔子耳朵动 → ASR partial 实时上字幕
- [ ] 松开空格 → ASR final → "thinking" → AI 流式开口
- [ ] AI 说话时按下空格 → 立刻打断 → 转 listening
- [ ] AI 输出的 actions（focus/show/annotate）能正确渲染到画布
- [ ] 一节课 5+ 轮对话不崩，TTS 长连保持

**延迟测：**
- [ ] 用户松手到听见 AI 第一个字 ≤ 2s（90 分位）
- [ ] ASR partial 滚动延迟 ≤ 500ms

**异常：**
- [ ] 拒绝麦克风权限 → 友好提示
- [ ] 网络断 → 重连一次或友好降级
- [ ] 长时间不说话 → 不报错（push_to_talk 没说话就不触发）
- [ ] 课程切换、刷新页面 → 资源清理干净，无内存泄漏

### 性能基线（实施完成后记录）

跑 10 次完整轮次，记录到 `docs/voice-benchmarks.md`：

| 指标 | 目标 | 实测 |
|------|------|------|
| 用户松手 → ASR final | < 500ms | ? |
| ASR final → LLM 第一句 | < 1s | ? |
| LLM 第一句 → TTS 首 PCM 包 | < 500ms | ? |
| 首音频总延迟 | < 2s | ? |
| 5 轮平均 round-trip | < 3s | ? |

数据进文档，下次迭代有 baseline 对比。

---

## 12. 关键决策与权衡

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 流式 JSON 提取方式 | 状态机解析（单次 LLM） | 节省一次 LLM 调用 + 延迟最优；提取器约 50-100 行 |
| TTS 音色一致性 | 固定 `seed-tts-2.0-standard` + 缓存开启 | 用户优先稳定性；规避 expressive 模型抽卡 |
| 不做客户端切句 | LLM token 直接透传 TTS | 用户要求"效果"；豆包文档建议"更自然、情绪更饱满" |
| 回声抑制 | 浏览器 getUserMedia 标志位 | 防止 AI 音频回灌；简单，无服务端 DSP |
| 自定义 Next.js server | 必须 | App Router 不支持 `upgrade` 事件 |
| ASR 按轮建连 / TTS 长连 | 不同生命周期 | ASR 每段对话需新 session；TTS 长连节省握手开销 |
| 桌面只用空格键 | 简化优先 | 用户："不需要撤回 先不用搞这么复杂" |
| 字幕领先音频 | 不做时间戳同步 | 用户接受字幕领先；保持实现简单 |
| MiMo ASR/TTS 直接删 | 无 fallback | 用户："直接删"，迭代干净 |
| 端到端 vs 分开接入豆包 | 分开（ASR + TTS 独立） | 端到端会丢 actions/课程逻辑，且改造量更大 |

---

## 13. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 豆包 WebSocket 断连 | 音频中断 | 重连一次；再失败即报错并停止当轮（本次迭代不做指数退避） |
| AudioWorklet 浏览器兼容 | 老浏览器不支持 | 目标现代 Chrome / Safari；不支持时友好降级提示 |
| 回声消除不彻底 | 音频反馈循环 | 监控；必要时考虑服务端 VAD 兜底 |
| MiMo 流式 JSON 格式异常 | SpeechExtractor 失败 | 兜底：N 个 token 后还没找到 `speech` 字段就改用整体缓冲 + 完成后一次性 JSON.parse |
| PCM 采样率不匹配 | 音频失真 | Worklet 处理 resample；分别验证 16kHz（ASR）和 24kHz（TTS）链路 |
| TTS 语气不稳定 | 体验不一致 | 固定 speaker + model + 情感参数 + cache，不用 CoT/context_texts |
| WebSocket 代理连接泄漏 | 服务端资源耗尽 | 课程结束 / 连接断开时严格清理；监控连接数指标 |

---

## 14. 文档同步（迭代收尾必做）

按用户强调，迭代收尾必须更新这些文档（实施 plan 末尾会有显式 phase）：

| 文件 | 动作 |
|------|------|
| `README.md` | 更新架构图、依赖清单（加 `ws` `tsx`）、env 变量、运行方式（`npm run dev` 行为变化） |
| `docs/TODO.md` | P0 语音延迟/录音交互勾掉，把"音色微调"等小项移到 P1 |
| `docs/voice-benchmarks.md` | 新增，记录 10 次延迟实测基线 |
| `.env.example` | 加入豆包变量占位（已纳入第 9 段） |
| `docs/superpowers/specs/2026-05-01-voice-pipeline-doubao-design.md` | 本次 spec（已存在） |

每次迭代结束的"finishing-a-development-branch"环节必须把"docs 是否同步"作为完成判定的一部分，不允许只改代码不动文档。

# EduAgent 架构(living doc)

> **本文档反映 master 上的当前实际实现。改 bug / 加功能必须同步更新。**
> 历史迭代设计请看 `docs/superpowers/specs/*`,本文不复述当时的"打算怎么做",只描述"现在长什么样"。
> 维护规则见 `/CLAUDE.md`。

最近重大同步:E2E 验收期间多处集成 bug 修复 + 体验优化(2026-05-01)。具体 commit 参考 `git log --oneline docs/architecture.md`。

---

## 1. 系统全景

```
浏览器                                Next.js 自定义 server                     上游
┌─────────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│ AudioWorklet        │         │ ASR proxy            │         │ 豆包流式 ASR     │
│  pcm-recorder       │── WS ──▶│  /api/voice/asr      │── WS ──▶│  bigmodel_async │
│  + Recorder/        │         │  (按轮建连 + buffer)  │         └─────────────────┘
│    HoldToTalk       │         │                      │                          
│                     │         │ Chat / SSE           │── HTTP ▶│ MiMo LLM        │
│ LessonController    │◀── SSE ─│  /api/chat           │  stream │  mimo-v2.5-pro  │
│  (浏览器调度状态机)  │         │  (SpeechExtractor)   │         └─────────────────┘
│                     │         │                      │                          
│ PcmPlayer           │         │ TTS proxy            │         │ 豆包流式 TTS     │
│  + SubtitleBar      │── WS ──▶│  /api/voice/tts      │── WS ──▶│  seed-tts-2.0   │
│  + Bunny + Canvas   │         │  (长连复用 + cancel)  │         │  Tina老师2.0     │
└─────────────────────┘         └──────────────────────┘         └─────────────────┘
                                       ↓
                                 SQLite (lessons/turns/word_performance)
```

**为什么自定义 Next.js server**:Next.js App Router 不支持 WebSocket `upgrade` 事件。`server.ts` 接管 HTTP server,把 `/api/voice/asr` 与 `/api/voice/tts` 的 upgrade 请求转给对应 proxy 模块,其它请求让 Next.js 处理。

---

## 2. 模块清单与职责

| 文件 | 职责(一句话) |
|------|--------------|
| `server.ts` | 自定义 Next.js server,WebSocket upgrade 路由分发 |
| `src/lib/init.ts` | 启动期 env 校验(DOUBAO_*、MIMO_*),`VOICE_MOCK=true` 时放行 |
| `src/lib/voice/doubao-codec.ts` | 豆包二进制协议编解码,ASR/TTS 共用 |
| `src/lib/voice/asr-proxy.ts` | server 端 ASR 代理,**握手期 PCM buffer + finish 缓存 + targetWords hot_words 注入** |
| `src/lib/voice/tts-proxy.ts` | server 端 TTS 代理,**长连复用**(StartConnection 一次,session 多次) |
| `src/lib/voice/asr-client.ts` | 浏览器 ASR WS 包装,`finish()` 通知 proxy 录音结束 |
| `src/lib/voice/tts-client.ts` | 浏览器 TTS WS 包装,转发 startSession/text-chunk/finishSession/cancel |
| `src/lib/voice/lesson-controller.ts` | **浏览器侧调度器,7 状态机,统一编排 ASR + SSE + TTS** |
| `src/lib/agent/orchestrator.ts` | 把 `streamUserInput` 包成 SSE `ReadableStream` 给 `/api/chat` |
| `src/lib/agent/session.ts` | LLM 一轮对话:词汇尝试判定 → 取 history → 调 streamLLM → 收 chunk → 记录 usage |
| `src/lib/agent/speech-extractor.ts` | **流式 JSON 中提取 `speech` 字段值,状态机解析,边收边吐 delta** |
| `src/lib/agent/memory.ts` | 课堂记忆:词汇命中、兴趣信号、turn 历史、当前词精确尝试判定 |
| `src/lib/agent/prompt.ts` | 课堂 system prompt 拼装,包含已学词总结与连续失败切策略约束 |
| `src/lib/mimo/llm.ts` | MiMo 调用,`streamLLM` 异步生成 token delta + final usage |
| `src/lib/audio/recorder.ts` | **mic + AudioContext + worklet 模块单例**,`prewarmRecorder` 在 startLesson 提前就绪 |
| `src/lib/audio/pcm-player.ts` | 浏览器 24kHz PCM 队列播放,`stop()` 立即静音 |
| `public/worklets/pcm-recorder.worklet.js` | 16kHz Float32 → Int16 量化,200ms 一包,**支持 flush 残余** |
| `src/components/lesson/LessonView.tsx` | UI 容器,绑定 LessonController + 空格 + 按钮 + 兔子 + 字幕 + 画布;idle 时画布下方显示 Bunny+开始按钮,上课后 Bunny+说话按钮移至画布右下角,下方切为字幕栏 |
| `src/components/lesson/HoldToTalkButton.tsx` | pointerdown/up + setPointerCapture |
| `src/components/lesson/Bunny.tsx` | 4 状态 SVG 角色(idle/listening/thinking/speaking) |
| `src/components/lesson/WordCardCanvas.tsx` | 词卡画布:1:1 正方形,图片区 75%(4:3) + 文字区 25%,按 `show_card` 切换当前卡片 |
| `src/components/lesson/SubtitleBar.tsx` | 字幕,user/ai 区分 |
| `src/hooks/useSpacebar.ts` | 文档级空格 push-to-talk(过滤 `e.repeat` 与输入框) |
| `src/lib/db/schema.ts` + `queries.ts` | SQLite 表结构 + 查询封装 |

---

## 3. 关键数据流

### 3.1 进入课程(开场白)

```
LessonView mount → new LessonController
  ├─ controller.startLesson(courseId)
  │    ├─ Promise.all:
  │    │   ├─ tts.open() → WS /api/voice/tts → 豆包 StartConnection (event=1)
  │    │   │     ◀── ConnectionStarted (event=50, ~3.7s 首次握手)
  │    │   └─ prewarmRecorder() — getUserMedia + AudioContext + worklet + source 全就绪
  │    └─ POST /api/chat?action=start
  │         ◀── SSE: speech-delta × N, actions, done
  │              ├─ speech-delta → tts.startSession + sendText (流式合成)
  │              │     ◀── TTSResponse (event=352, PCM) → PcmPlayer.enqueue
  │              └─ done → tts.finishSession (event=102)
  │                   ◀── SessionFinished (event=152) → state→awaiting
```

### 3.2 一轮对话

```
用户按住空格(state=awaiting)
  └─ controller.startListening
       ├─ setState('listening'), 记 listenStartedAt
       ├─ new AsrClient,绑 partial/final/error
       ├─ Promise.all:
       │   ├─ asr.open() → WS /api/voice/asr?courseId&targetWords&cardId → 豆包 ASR upstream 握手
       │   │   server 收到 PCM 时:upstreamReady ? 直接发 : 进 pendingPcm 缓存
       │   └─ startRecorder({ onChunk: pcm => asr.sendPcm(pcm) })
       │         worklet emit 200ms PCM × N
       │
       │  ASR 服务端:upstream open → 发 FullClientRequest(配置)→ flush pendingPcm
       │              ◀── partial × N(基于 utterances[].definite=false)
       │                      → onmessage('partial') → emit subtitle
用户松开空格
  └─ controller.stopListening
       ├─ recordedMs < 800ms? → emit error '太短啦~' + state→awaiting (return)
       ├─ recorder.stop():postMessage flush → worklet 吐残余 → onChunk → asr.sendPcm
       ├─ asr.finish() → JSON {type:'finish'} 给 proxy
       │   server 收到 finish:upstreamReady ? 发 -seq : pendingFinish=true
       │   upstream 收到 -seq → 处理剩余 audio → 发 final 帧(utterances 全 definite=true)
       │   server onmessage(final) → JSON {type:'final', text} 给 client
       ├─ setState('thinking')
       └─ asrFinalTimer = setTimeout(5000, ...)  // 5s 兜底
            
ASR final 到达 client
  └─ controller.handleAsrFinal(text)
       ├─ clearTimeout(asrFinalTimer), asr.close, asr=null
       ├─ POST /api/chat { action:'message', sessionId, text, asrResult }
       │   server: add raw ASR user message
       │           → streamLLM (MiMo, prompt 含 currentCardId/cardProgress/drillParts)
       │           → SpeechExtractor 状态机 → SSE
       │           → commit attempt_assessment + show_card 到 cardProgress/clearedCardIds
       │           → token_usage 记录 LLM + ASR + TTS 字符数
       │            speech-delta × N + actions + done
       └─ consumeSSE:
            speech-delta:
              第一个 → ensureTtsSession (event=100 StartSession)
                       onFirstSpeech → setState('speaking')
              tts.sendText (event=200 TaskRequest)
                ◀── TTSResponse (event=352) → tts.on('pcm') → PcmPlayer.enqueue
                                              (state guard:listening/thinking 时丢弃)
              ◀── TTSSentenceStart (event=350) → tts.on('subtitle') → emit subtitle
            actions:
              emit('actions') → LessonView 从最后一条 show_card 提取 card_id → WordCardCanvas 切换当前卡片
              server 同步使用 show_card 作为 currentCardId 的事实来源
            done → tts.finishSession (event=102)
              ◀── SessionFinished (event=152) → setState('awaiting')
```

### 3.3 结束课程

```
controller.endLesson:
  → chatAbort.abort + asrFinalTimer.clear
  → recorder.stop / asr.close
  → player.stop + tts.close (FinishConnection event=2)
  → POST /api/chat?action=end
  → player.dispose + disposeRecorder (彻底释放 mic + AudioContext)
  → state=idle
```

---

## 4. LessonController 状态机

```
              startLesson
   idle ──────────────────▶ greeting
   ▲                          │
   │ endLesson                │ TTS session-finished (开场白播完)
   │                          ▼
   ending ◀── 任意状态 ─────  awaiting ◀──┐
                                │         │ TTS session-finished
                                │ 按下空格 │ (一轮 AI 回应播完)
                                ▼         │
                              listening   │
                                │         │
                                │ 松开空格 │
                                │ (≥800ms)│
                                ▼         │
                              thinking ───┤
                                │         │
                                │ ASR final│
                                │ → SSE   │
                                │ speech-delta(第一个)
                                ▼         │
                              speaking ───┘
```

转移说明:
- `idle → greeting`:用户点"开始上课"
- `greeting → awaiting`:开场白 TTS session-finished
- `awaiting → listening`:用户按下空格(必经 awaiting,**不支持**从 speaking 打断)
- `listening → awaiting`:松开 + 录音 < 800ms(短按拦截)
- `listening → thinking`:松开 + 录音 ≥ 800ms,等 ASR final
- `thinking → awaiting`:5 秒兜底超时,或 final text 为空
- `thinking → speaking`:收到第一个 speech-delta(`onFirstSpeech`)
- `speaking → awaiting`:TTS session-finished
- 任意 → ending → idle:用户点"结束课堂"

---

## 5. 协议踩坑摘要(详情指向其它文档)

完整原文:`docs/DOUBAO Protocol/{asr,tts}.md`。日常协作关键点:

### 豆包 V3 双向 TTS

- **codec flag 锁 0x04**(with event)。是否带 sessionId 由 event_id 决定(< 100 不带、≥ 100 带 + ConnectionStarted=50 带 connection_id)。**不要**根据"有没有 sessionId"切换 flag,豆包会按 V1 sequence 协议解码报"sequence mismatch"伪错。
- **`req_params.additions` 是 jsonstring**(serialize 后的字符串),不是 object。Doc 表写 `jsonstring` 易看漏。
- **TaskRequest 的 text 在 `req_params.text`**,不是顶层。所有合成参数都嵌在 req_params。
- **长连复用**:一个 WebSocket 多次 session,但同一时刻只能有一个 session。session 间不重发 StartConnection。

### 豆包 V3 流式 ASR

- **`show_utterances: true` 必传**,否则 response 没有 utterances 字段,无法判 final。
- **`result_type: 'full'`**,不是 'single'。single 是增量,只返回当前分句,前面字会丢。
- **`enable_ddc: false`**,儿童语料场景关掉语义顺滑(否则停顿/重复词被删字)。
- **targetWords hot_words 注入**:浏览器 ASR WS 带 `courseId` / `targetWords` / `cardId` query,proxy 在 full client request 中写入 `request.corpus.context = "{\"hotwords\":[...]}"`。豆包本地协议文档没有 per-word weight 字段,也没有 `language_hint`;当前继续不传 `audio.language`,使用默认中英文识别能力。
- **真实回归基线(2026-05-05)**:hotwords 注入对 `hour -> Our.`、`One thousand is ten hundreds -> 1000 is 10.` 未生效——豆包 ASR 在英文短词与数字归一化场景上 weak,protocol 层 hot_words 不解决根因。曾尝试过的"final 阶段窄规则纠正(`Our.` → `hour`)"已撤销,因为字典化纠正会过拟合到一节课的具体误识结果,且让下游 LLM 看不见 ASR 真实输出,反而损害"基于 raw ASR 自行容错判定"的 mastery 检测路径。真实 ASR 容错改由教学循环 v1.1 的 LLM 容错判定承担(见 TODO P1 §3)。
- **客户端不能直接 close WS**:必须发 `{type:'finish'}` 控制帧给 proxy,proxy 发 -seq 给豆包后等 final 自然回来,client 收到 final 才 close。直接 close 会让上游 session 立刻断,final 永远收不到,UI 卡 thinking。
- **proxy 必须 buffer upstream 握手期间的 PCM**:client WS 几十 ms 就 open,但 proxy → 豆包 upstream 握手 + 发 full client request 要 1-3 秒。这段时间 client 已经在送 PCM,如果 proxy 直接 drop,前 1-3 秒说话会丢失。

### 鉴权头差异

- ASR(旧版控制台):`X-Api-App-Key` / `X-Api-Access-Key` / `X-Api-Resource-Id` / `X-Api-Request-Id` / `X-Api-Sequence: -1`
- TTS(旧版控制台):`X-Api-App-Id` / `X-Api-Access-Key` / `X-Api-Resource-Id` / `X-Api-Connect-Id`

注意 **App-Key vs App-Id** 一字之差。`X-Api-Sequence: -1` ASR 必传。

---

## 6. 关键设计决策

| 决策 | 选择 | 为什么 |
|------|------|--------|
| 流式 JSON 提取 | `SpeechExtractor` 状态机解析单个 LLM 响应 | 节省一次 LLM 调用 + 首字延迟最优;约 100 行 |
| TTS 音色 | 固定 `seed-tts-2.0-standard` + Tina老师2.0 + 缓存 | 稳定性优先,避免 expressive 抽卡;开场白 / 提示语 100% 一致 |
| 不做客户端切句 | LLM token 直接透传 TTS | 豆包文档建议"更自然、情绪更饱满" |
| 回声抑制 | 浏览器 getUserMedia 三标志位 | 简单,无服务端 DSP |
| ASR 按轮建连 / TTS 长连 | 不同生命周期 | ASR 每段对话需新 session;TTS 长连节省 3.7s 握手 |
| AudioContext 模块单例 | 不每轮 close+new | 浏览器配额限制,3-5 轮反复重建后 mic 失活 |
| mic 在 startLesson prewarm | 用户按住瞬间能录 | 否则 getUserMedia + worklet 启动 ~300ms,前几个字丢 |
| ASR proxy 握手期 PCM buffer | 不丢前 1-3 秒录音 | 详见踩坑 |
| worklet flush 残余 | 不丢尾字 | 之前未满 200ms 的 buffer 在 disconnect 时被丢 |
| 短按 < 800ms 前端拦截 | 不进 thinking 不空等 | 豆包对 < 1.5s 录音置信度不够,大概率 timeout |
| 5s 不 9s 的 ASR final 兜底 | 用户更快感知失败 | 9s 太长,影响"再说一次"的连续性 |
| 不打断(speaking 时空格忽略) | 简化优先 | 实测打断后 inflight PCM 难完全清干净;后续再加 |
| 字幕领先音频 | 不做时间戳同步 | spec 当时接受;但**实测画布跳得比讲解快 ~3s,见 TODO** |
| 词汇正确性判定 | 当前目标英文词精确 token 命中 | 保守优先,`train` 算对、`tree` 不算;不做发音相似度猜测 |
| ASR/TTS usage | ASR 记请求数 + 识别文本长度,TTS 记请求数 + speech 字符数 | 当前没有 provider-native ASR token/TTS usage,先保证课后报告可观测 |
| 画布比例 | 1:1 正方形,图片区 75%(4:3),文字区 25% | 幼儿教学:图片为主角(75%),文字为锚点(25%);图片生成统一 4:3 横版(1024×768)填满图片区 |

---

## 7. 性能基线

详见 `docs/voice-benchmarks.md`(2026-05-01 18 轮人工实测,14 轮成功)。

| 指标 | 目标 | 实测中位 | 状态 |
|------|------|---------|------|
| 用户松手 → ASR final | < 500ms | 594ms | 接近(prewarm + buffer 之后,主要余下豆包识别本身) |
| ASR final → LLM 第一句 token | < 1s | 3976ms | **超目标**(MiMo first-token 慢,前端无法优化) |
| LLM 第一句 token → TTS 首 PCM 包 | < 500ms | ~2200ms | **超目标**(SSE 解析 + TTS 合成 + 网络) |
| **首音频总延迟** | **< 2s** | **6212ms** | **超目标**,主要被 LLM 拖累 |
| round-trip(用户松手到 AI 说完) | < 3s | 8860ms | 含 AI 实际说话时长,非纯首响指标 |

**主要瓶颈**:MiMo first-token 4 秒。前端再快也只能省几百 ms。可选优化:换更快模型 / prompt 强制最先吐 speech / 思考期播一句"嗯..."占位。

---

## 8. 已知不足(指向 TODO.md 详情)

- **课程 Session resume**:`sessions` 是 module-level in-memory Map,server 重启 / 刷新 / 断网 = 客户端旧 sessionId 失效。客户端 fetch `/api/chat?action=message` 收 404 时仅提示"课程已过期,回首页重新进入"。需 SQLite 持久化 + client resume 流程。
- **actions 与 TTS 时序**:`show_card` 动作领先 AI 讲解,体感跳得太快
- **MiMo first-token 4 秒**:首音频延迟主要瓶颈,前端无法优化
- **ASR 识别质量**:已补 targetWords hotwords;字典化 fallback 纠正已撤销(见 §「真实回归基线」)。当前由教学循环 v1.1 的 LLM `attempt_assessment` 基于 raw ASR + currentCardId + drillParts 做课堂内容错判定,真实儿童语音效果等下一节课实测
- **Token 消耗偏高**:LLM message history 已裁到最近 12 条(约 6 轮),仍未做摘要压缩
- **音色微调**:Tina老师2.0 当前满足,后续可做更细试听
- **VAD 自动停止**:依赖用户主动松手,无静音兜底(防"按住不放")
- **WebSocket 重连退避**:当前重连一次,可加指数退避
- **预加载开场白 TTS**:利用豆包 cache 让首句几乎零延迟

---

## 9. 文件演进历史(粗粒度)

- 2026-05-01 — 初版语音管线实施 + sync 文档(README/TODO/benchmarks)
- 2026-05-01 — **E2E 验收期间多处集成 bug 修复**(架构定型的关键改动)
- 2026-05-01 — 删 [bench] 打点 + TODO 增补
- 2026-05-01 — 新增 architecture.md + CLAUDE.md(本 living doc 制度建立)
- 2026-05-01 — git history redact secrets + CLAUDE.md 加凭据规则
- 2026-05-05 — **画布 v2:WordCardCanvas 替换 ImageCanvas** — 协议从 show/focus/annotate 统一为 `show_card`;课程数据从 `images[]` 迁移到 `cards[]`(`kind: 'word'|'sentence'`);画布层从图叠层改为图+中英文独立 DOM;删除 ShowTool/FocusTool/AnnotateTool 组件
- 2026-05-10 — **教学循环 v1.1:课堂内进度引擎 + drillParts** — 每张 card 必填 `drillParts`;服务端用 `show_card` 同步 currentCardId;LLM 输出 `attempt_assessment`;memory 维护 `cardProgress` / `clearedCardIds`;history 裁到最近 12 条

> 不再 hardcode SHA — 因 git history 经过 redact 重写,SHA 不稳定。具体 commit 用 `git log --oneline` 现查。

---

## 10. 开发工具链 — 课后报告生成器

实测课后用 `/lesson-report` slash command 生成内部诊断报告,驱动迭代决策。

调用链:

    /lesson-report [session-id?]
      ↓ Claude 读 .claude/commands/lesson-report.md
      ↓ 跑 pnpm tsx scripts/lesson-report-data.ts [session-id?]
      ↓ 拿 JSON(基础聚合 + anomaly flags + 全部 interactions)
      ↓ Claude 按 prompt 模板生成 markdown
      ↓ Write 到 docs/lesson-reports/YYYY-MM-DD-<sid8>.md(已 gitignore)

**职责切分**:
- **`scripts/lesson-report-data.ts`**(数据层,有单测):基础聚合 + 课程目标词 + anomaly flags(`highAvgInput` / `asrUsageNotTracked` / `ttsUsageNotTracked` / `tokensCorrupted`)。pure 函数 `buildReport(db, sessionId, courseLoader)`,接受依赖注入。
- **`.claude/commands/lesson-report.md`**(LLM 层):报告模板 + 写作要求,LLM 看 raw `interactions` 判 ASR 误识 / 话术循环卡死。

**报告范围**:只产出**工程信号**(ASR 误识 / 话术循环 / token / 埋点),教学策略类观察只列不评判。spec 见 `docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`。

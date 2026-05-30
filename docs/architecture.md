# EduAgent 架构(living doc)

> **本文档反映 master 上的当前实际实现。改 bug / 加功能必须同步更新。**
> 历史迭代设计请看 `docs/superpowers/specs/*`,本文不复述当时的"打算怎么做",只描述"现在长什么样"。
> 维护规则见 `/CLAUDE.md`。
> 跟读"答对"的分层产品规则见 `docs/superpowers/specs/2026-05-25-pronunciation-assessment-design.md`。

最近重大同步:**SessionStore + SQLite migrations(2026-05-30)** — 活动课堂 session 现在通过 `SessionStore` 边界读写,当前实现仍是进程内 `InMemorySessionStore`,但 `session.ts` 不再直接拥有 module-level Map;SQLite 初始化改为 `schema_migrations` + versioned migration runner,现有三张表作为 v1 `initial_lesson_schema` 幂等创建。上次重大同步:**Reliability P0/P1 修复(2026-05-30)** — 只读聚合 API(`/api/progress` / `/api/stats` / `/api/sessions`)现在会初始化 SQLite schema,不再依赖 `/api/chat` 先创建表;TTS proxy 会在 Doubao `ConnectionStarted` 前按顺序缓存 `session-start` / `text-chunk` / `session-finish` / `session-cancel`,避免本地 WS 已 open 但 upstream 未 ready 时丢开场白;`LessonController.startLesson()` / `PhasedLessonController.startLesson()` 返回启动是否成功,`PhasedLessonView` 失败时回到可重试的未开始界面。上次重大同步:**Guard pipeline 重构(2026-05-24)** — 把 `streamUserInput` 里的 4 段内联 guard 逻辑拆成 `src/lib/agent/guards/` 下的独立模块(GuardContext / GuardFn / runPipeline + closingGuard / prematureClosingGuard / normalizeActions / speechCardAlign);`streamUserInput` 从 169 行压缩到 60 行;每个 guard 有独立单测;行为不变。上次重大同步:**代码库清扫 + prompt schema 瘦身(2026-05-24)** — 删除死代码 6 项(logger.ts 整文件、callLLM 非流式函数、incrementSilentTurns、silentTurns 字段、GenerateState、addAssistantMessage 内联进 commitAssistantStreamResult、getNextWordCardId);LLM 输出 schema 瘦身:state_update 删除 `current_card_id` / `phase` / `words_learned` / `generated_content` 4 个废字段,仅保留 `current_word` + `attempt_assessment`;mockStreamLLM 修正为合法 ToolAction shape;phase 不再由 LLM 控制(由 PhasedLessonController 规则切换)。上次重大同步:**R-C 服务端 2-hit 切卡规则 + speech/show_card 对齐(2026-05-23)** — 词卡 cleared 触发器从 "1 次 LLM 判 correct + R2 verify" 改为 **"raw ASR 字面命中目标 token 累计 2 次"**,由服务器权威判定,LLM 的 result 仅影响 streak/needs_review。未通过 2 次前服务端强制 `show_card → currentCard`;第 2 次命中那一轮服务端自动推到 `nextCard`。由于实测出现"UI 已切 bird/fish,老师还让读 dog/bird",`streamUserInput()` 现在先缓存 LLM speech,跑完 closing/premature guard 与 `normalizeAssistantActions()`,必要时把 speech 改写为当前 `show_card` 对应卡片后再发 `speech-delta` 给 TTS。上次大改:premature-closing guard + R2 cleared-card un-clear bug(2026-05-23)。再上次:R-A celebration-turn stay(2026-05-23,已被 R-C 取代)。再上次:reinforcement quiz 静态 TTS 引导(2026-05-22)。再上次:Teacher Agent state sync 三项修复(R5-R7,2026-05-22)。再上次:Teacher Agent UX 四项 P0 修复(R1-R4,2026-05-22 早些时候)。具体 commit 参考 `git log --oneline docs/architecture.md`。

**当前运行范围**:本项目现阶段只作为本地电脑浏览器工具使用,默认访问方式是桌面浏览器打开 `localhost`。暂不支持 iPadOS app、移动端 Web、或面向公网发布后的移动兼容。

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
│  + CatSpeech        │── WS ──▶│  /api/voice/tts      │── WS ──▶│  seed-tts-2.0   │
│  + PictureCard      │         │  (长连复用 + cancel)  │         │  Tina老师2.0     │
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
| `src/lib/init.ts` | 启动期 env 校验(DOUBAO_*、MIMO_*),`VOICE_MOCK=true` 时放行;只读聚合 API 可单独调用 `ensureDatabaseInitialized()` 建表 |
| `src/lib/voice/doubao-codec.ts` | 豆包二进制协议编解码,ASR/TTS 共用 |
| `src/lib/voice/asr-proxy.ts` | server 端 ASR 代理,**握手期 PCM buffer + finish 缓存 + 按 currentCardId/nextCardId 注入 hot_words(无 cardId 时 fallback 全课词)** |
| `src/lib/voice/tts-proxy.ts` | server 端 TTS 代理,**长连复用**(StartConnection 一次,session 多次),ConnectionStarted 前缓存 session 控制帧 |
| `src/lib/voice/asr-client.ts` | 浏览器 ASR WS 包装,`finish()` 通知 proxy 录音结束 |
| `src/lib/voice/tts-client.ts` | 浏览器 TTS WS 包装,转发 startSession/text-chunk/finishSession/cancel |
| `src/lib/voice/lesson-controller.ts` | **浏览器侧调度器,8 状态机,统一编排 ASR + SSE + TTS + 静态 quiz TTS** |
| `src/lib/agent/orchestrator.ts` | 把 `streamUserInput` 包成 SSE `ReadableStream` 给 `/api/chat` |
| `src/lib/agent/session-store.ts` | 活动课堂 session 的存取边界;当前默认实现是进程内 `InMemorySessionStore`,后续 SQLite resume 应替换这里而不是在 `session.ts` 里加第二套 Map |
| `src/lib/agent/session.ts` | LLM 一轮对话骨架:通过 `SessionStore` 查找 session + addUserMessage → streamLLM 消费 → finalize + sanitize → **runPipeline(guards)** → yield SSE → commitTurn |
| `src/lib/agent/guards/` | **Guard pipeline**(见下方 §Agent Guard Pipeline) |
| `src/lib/agent/speech-extractor.ts` | **流式 JSON 中提取 `speech` 字段值,状态机解析,边收边吐 delta;导出 `sanitizeSpeech` 剥离 `xxx_yyy` 这种 card_id token,防止 TTS 把 `_` 读成"下划线 / underscore"** |
| `src/lib/agent/memory.ts` | 课堂记忆:词汇命中、兴趣信号、turn 历史、当前词精确尝试判定 |
| `src/lib/agent/prompt.ts` | 课堂 system prompt 拼装,包含已学词总结与连续失败切策略约束 |
| `src/lib/mimo/llm.ts` | MiMo 调用,`streamLLM` 异步生成 token delta + final usage |
| `src/lib/audio/recorder.ts` | **mic + AudioContext + worklet 模块单例**,`prewarmRecorder` 在 startLesson 提前就绪 |
| `src/lib/audio/pcm-player.ts` | 浏览器 24kHz PCM 队列播放,`stop()` 立即静音 |
| `public/worklets/pcm-recorder.worklet.js` | 16kHz Float32 → Int16 量化,200ms 一包,**支持 flush 残余** |
| `src/data/courses/*.ts` | 可见课程数据:常规课为 12 word cards + 4 sentence cards,使用 `tone` 驱动 CC 调色 |
| `src/data/courses/index.ts` | 新标准课程 registry,导出 `allCourses` / `getCourseById`;首页、API、lesson route 共用 |
| `src/lib/voice/phased-lesson-controller.ts` | 外层 phase 状态机,包装 `LessonController` 音频管线并规则驱动 phase 切换 |
| `src/components/magic/*` | CC 绘本风原子组件:Cat / PaperBg / Star / Sparkle / PaperButton / IllustrationSlot / PictureCard |
| `src/components/home/HomeStudy.tsx` | 首页魔法书房,课程书本入口 + journal/parents CTA |
| `src/components/lesson/PhasedLessonView.tsx` | 顶层 lesson UI,按 currentPhase 切 Intro / Mandala / Reinforce / Done |
| `src/components/lesson/IntroFrame.tsx` | 主题导入:麻吉 + 锁定 chip 网格,不再依赖 scene.svg |
| `src/components/lesson/LessonMandalaV2.tsx` | 跟读练习法阵,保留 `LessonController` ASR/TTS 管线 |
| `src/components/lesson/useStaticPromptSpeech.ts` | 强化 quiz 静态 TTS gate:等待 `awaiting`,调用 `speakStatic`,短暂失败重试,播完后解锁 UI |
| `src/components/lesson/QuizPickWordFrame.tsx` | quiz:静态 TTS 播 prompt + 正确英文词,播完前锁 PictureCard 选择 |
| `src/components/lesson/ReinforceFrame.tsx` | quiz:静态 TTS 播 targetText,播完前锁 repeat-after-me 录音 |
| `src/components/lesson/ReinforcementFlow.tsx` | 强化巩固流程编排,串联 pick-word / repeat-after-me quizzes,错答时播静态 retry hint |
| `src/components/lesson/DoneCelebrateFrame.tsx` | 下课庆祝页,星星 + 数据 + 双 CTA |
| `src/components/journal/JournalPage.tsx` | 魔法书双页,展示 progress 聚合的词卡 |
| `src/components/parents/PINGateFrame.tsx` / `ParentsPage.tsx` | 家长阁楼 PIN 解锁 + stats/session dashboard |
| `src/hooks/useSpacebar.ts` | 文档级空格 push-to-talk(过滤 `e.repeat` 与输入框) |
| `src/lib/db/schema.ts` + `queries.ts` | SQLite migration runner / 表结构 + 查询封装;`schema_migrations` 记录已执行版本 |

---

## 3. 关键数据流

### 3.1 进入课程(开场白)

```
PhasedLessonView mount → new LessonController → new PhasedLessonController
  ├─ phased.startLesson()
  │    └─ controller.startLesson(courseId)
  │    ├─ Promise.all:
  │    │   ├─ tts.open() → WS /api/voice/tts → 豆包 StartConnection (event=1)
  │    │   │     ◀── ConnectionStarted (event=50, ~3.7s 首次握手)
  │    │   │     ConnectionStarted 前前端发来的 session 控制帧在 proxy 内排队
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
       ├─ 若 ASR/recorder startup 还在进行:先记录 stoppedAt,等 startup settle 后再清理
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
       │           → buildPromptInput 生成 MiMo system prompt + inputBreakdown(静态规则 / phase / 课程定义 / 状态 / history)
       │           → streamLLM (MiMo, prompt 含 currentCardId/cardProgress/drillParts)
       │           → SpeechExtractor 状态机 → server guards → normalize show_card(过滤/替换已通过或非当前目标卡) → speech/show_card 对齐 → SSE
       │           → commit attempt_assessment + 归一化后的 show_card 到 cardProgress/clearedCardIds
       │           → token_usage 记录 LLM + ASR + TTS 字符数;interaction_logs.model_calls.llm 记录 inputBreakdown 供课后报告量化
       │            speech-delta + actions + done
       └─ consumeSSE:
            speech-delta:
              第一个 → ensureTtsSession (event=100 StartSession)
                       onFirstSpeech → setState('speaking')
              tts.sendText (event=200 TaskRequest)
                ◀── TTSResponse (event=352) → tts.on('pcm') → PcmPlayer.enqueue
                                              (state guard:listening/thinking 时丢弃)
              ◀── TTSSentenceStart (event=350) → tts.on('subtitle') → emit subtitle
            actions:
              **缓冲到 TTS session-finished 再 emit**(`pendingActions` in LessonController)
              → LessonMandalaV2 从最后一条有效 show_card 提取 card_id → PictureCard 切换当前卡片(word 或 sentence_* 均可;已通过 word/sentence 回跳会被 UI 忽略)
              server 同步使用归一化后的 show_card 作为 currentCardId 的事实来源
            done → tts.finishSession (event=102)
              ◀── SessionFinished (event=152) → setState('awaiting')
```

强化巩固里的 `repeat-after-me` 复用同一套 ASR 录音管线,但调用
`LessonController.startListening({ routeToChat:false })`。这类录音仍会 emit
`asr-final` 给 `ReinforceFrame` 做本地短句判定并由
`ReinforcementFlow` 记录 `quiz-answer`,但不会再进入 `/api/chat?action=message`
触发额外 LLM/TTS 回合。

强化巩固的 quiz 引导不走 LLM。`QuizPickWordFrame` mount 后调用
`LessonController.speakStatic(prompt + correctEnglish)`,`ReinforceFrame` mount 后
调用 `speakStatic(targetText)`;两者都等 `state=awaiting` 才发起静态 TTS,播放中进入
`quiz-speaking` 并锁住选择/录音。`useStaticPromptSpeech` 只在 `speakStatic()`
resolve 后标记 prompt 已听完;如果 controller 还没回到 `awaiting` 或静态 TTS 忙导致
短暂 reject,继续锁住 UI 并在 `awaiting` 后重试。错答且仍可重试时,
`ReinforcementFlow` 播 `再听一次: ${prompt || targetText}` 后再允许下一次作答。

### 3.3 结束课程

```
controller.endLesson:
  → chatAbort.abort + asrFinalTimer.clear
  → pendingActions = null (丢弃任何待 emit 的 show_card 动作)
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
                                ▲
                                │ speakStatic(quiz prompt / targetText)
                                │
                            quiz-speaking
```

转移说明:
- `idle → greeting`:用户点"开始上课";如果 `/api/chat?action=start` 失败,`LessonController.startLesson()` 返回 `false`,状态回到 `idle`,外层 `PhasedLessonView` 回到开始按钮可重试
- `greeting → awaiting`:开场白 TTS session-finished
- `awaiting → listening`:用户按下空格(必经 awaiting,**不支持**从 speaking 打断)
- `listening → awaiting`:松开 + 录音 < 800ms(短按拦截)
- `listening → thinking`:松开 + 录音 ≥ 800ms,等 ASR final
- `thinking → awaiting`:5 秒兜底超时,或 final text 为空
- `thinking → speaking`:收到第一个 speech-delta(`onFirstSpeech`)
- `speaking → awaiting`:TTS session-finished
- `awaiting → quiz-speaking → awaiting`:reinforcement 静态 quiz TTS 播放,不经过 `/api/chat` 与 LLM
- 任意 → ending → idle:用户点"结束课堂"

### 4b. PhasedLessonController phase 轴(课程 registry)

```
idle ─startLesson─▶ intro ─[切1]─▶ interactive ─[切2]─▶ reinforcement ─[切3]─▶ done
  ▲                                                                              │
  └────── endLesson(任意 phase 都能立刻退出)──────────────────────────────────────┘
```

- 切1:开场介绍 TTS 播放结束,底层 `LessonController` 回到 `awaiting` 后立刻切到 `interactive`;intro 不等待全部 word cards 都被 `show_card` 介绍。
- 切2:`clearedWordCardIds.size === wordCards.length` 或 `totalAttempts >= 3 × wordCards.length`,且底层回到 `awaiting`;进入 reinforcement 前先播 `/api/chat?action=phase-transition` 返回的过渡 TTS,播完再 emit phase-change,避免第一道 quiz 静态 TTS 与过渡语音抢同一个长连 session。sentence cards 只在 reinforcement 使用。
- 切3:reinforcement 所有 quizzes 答完。
- phase 切换由 `PhasedLessonController` 判定,LLM 不输出 phase transition。
- interactive 阶段的主目标由 prompt 中的"当前目标控制"约束:继续当前未通过 word card,否则切到 `teachingHints.newCardIds` 里的第一个未通过 word card。若老师说短句,必须 `show_card` 对应 `sentence_*` 卡;进度计数仍只按 word cards。server 在 SSE/commit 前归一化 `show_card`,把已通过或非当前目标的回跳替换为当前应练习的 word card。
- `LessonController` 仍是唯一 ASR/TTS/SSE 管线;旧 `LessonView` fallback 已删除。

---

## 4c. Agent Guard Pipeline

Guard pipeline 在 `src/lib/agent/guards/` 下,由 `streamUserInput` 在 LLM 流式消费结束后、SSE yield 之前调用。

### GuardContext(输入输出 shape)

```ts
interface GuardContext {
  speech: string;          // 当前 AI 语音文本(各 guard 可替换)
  actions: ToolAction[];   // 当前 show_card 动作列表(normalizeActions 后有效)
  stateUpdate: AgentResponse['state_update'];
  memory: LessonMemory;    // read-only 视图 — guard 不得修改 memory
  course: Course;
  asrText?: string;        // 原始 raw ASR 字符串
  currentPhase: PhaseName;
}
```

`GuardContext.memory` 是 **read-only 视图**。所有 memory 修改仍在 pipeline 之后的 `commitAssistantStreamResult` 里发生。

### Guard 职责与顺序(顺序敏感)

| 顺序 | Guard | 文件 | 职责 |
|------|-------|------|------|
| 1 | `closingGuard` | `closing-guard.ts` | R4/R6:speech 含未学词时替换安全模板;`memory.currentWord` 与 `state_update.current_word` 豁免 |
| 2 | `prematureClosingGuard` | `premature-closing-guard.ts` | R-B:interactive 阶段说"下次再来"等软关闭词时覆盖 speech 并强推下一个 untouched 词卡 |
| 3 | `normalizeActions` | `normalize-actions.ts` | R-C wrapper:调 `normalizeAssistantActions(memory.ts)`,服务端权威选牌 |
| 4 | `speechCardAlign` | `speech-card-align.ts` | speech 提到的词卡与 normalizeActions 结果不一致时替换 speech |

**为什么顺序敏感**:guard 4(`speechCardAlign`)读取 guard 3(`normalizeActions`)写入的 `ctx.actions` 来确定 forceCardId。如果顺序颠倒,speechCardAlign 会读到 normalize 前的 LLM 原始 actions,得出错误的对齐判断。

### runPipeline 失败策略

guard 抛异常时:`console.error('[guard]', guard.name, 'failed:', err)`,并用抛出前的 ctx 继续走下一个 guard。这是 fail-safe 策略:单个 guard 的 bug 不会让整个课堂 SSE 冻住。

### 与 memory.ts 的边界

`normalizeAssistantActions` 保留在 `memory.ts`(与 `applyAttemptAssessment` 强耦合)。`guards/normalize-actions.ts` 是薄 wrapper,只把签名适配成 GuardFn。后续若解耦 memory 状态,可把 normalize 搬进 guards/;当前不动。

---

## 5. 协议踩坑摘要(详情指向其它文档)

完整原文:`docs/DOUBAO Protocol/{asr,tts}.md`。日常协作关键点:

### 豆包 V3 双向 TTS

- **codec flag 锁 0x04**(with event)。是否带 sessionId 由 event_id 决定(< 100 不带、≥ 100 带 + ConnectionStarted=50 带 connection_id)。**不要**根据"有没有 sessionId"切换 flag,豆包会按 V1 sequence 协议解码报"sequence mismatch"伪错。
- **`req_params.additions` 是 jsonstring**(serialize 后的字符串),不是 object。Doc 表写 `jsonstring` 易看漏。
- **TaskRequest 的 text 在 `req_params.text`**,不是顶层。所有合成参数都嵌在 req_params。
- **长连复用**:一个 WebSocket 多次 session,但同一时刻只能有一个 session。session 间不重发 StartConnection。
- **ConnectionStarted 前必须缓存控制帧**:浏览器到本地 proxy 的 WS 会先 open,但豆包 upstream 还没完成 StartConnection;`session-start` / `text-chunk` / `session-finish` / `session-cancel` 必须按收到顺序排队,等 event=50 后 flush,不能直接 `upstream.send()`。

### 豆包 V3 流式 ASR

- **`show_utterances: true` 必传**,否则 response 没有 utterances 字段,无法判 final。
- **`result_type: 'full'`**,不是 'single'。single 是增量,只返回当前分句,前面字会丢。
- **`enable_ddc: false`**,儿童语料场景关掉语义顺滑(否则停顿/重复词被删字)。
- **current/next hot_words 注入**:浏览器 ASR WS 带 `courseId` / `cardId` / `clearedCardIds` query;proxy 优先按当前卡 + 下一张未 cleared 词卡形成 W2 hot_words 窗口,无 `cardId` 时 fallback 全课 word cards。full client request 写入 `request.corpus.context = "{\"hotwords\":[...]}"`。豆包本地协议文档没有 per-word weight 字段,也没有 `language_hint`;当前继续不传 `audio.language`,使用默认中英文识别能力。
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
| TTS proxy 握手期 control buffer | 不丢开场白 / 静态 quiz 文本 | 浏览器 WS 先 open,豆包 ConnectionStarted 慢于本地 client 控制帧 |
| worklet flush 残余 | 不丢尾字 | 之前未满 200ms 的 buffer 在 disconnect 时被丢 |
| 短按 < 800ms 前端拦截 | 不进 thinking 不空等;若 keyup 早于 ASR/recorder startup settle,先记录 stoppedAt,等 startup settle 后再 close,避免撕掉 connecting WS 产生假 upstream error | 豆包对 < 1.5s 录音置信度不够,大概率 timeout;真实短按是本地 UX 事件,不应被记录成 provider 故障 |
| 5s 不 9s 的 ASR final 兜底 | 用户更快感知失败 | 9s 太长,影响"再说一次"的连续性 |
| 不打断(speaking 时空格忽略) | 简化优先 | 实测打断后 inflight PCM 难完全清干净;后续再加 |
| ~~字幕领先音频~~ → **R1 已修复** | actions(`show_card`)缓冲到 `tts.session-finished` 再 emit | 实测 bd78d967 报告确认 UX 杀手;`pendingActions` in `LessonController` 解决;TTS error 路径也释放 |
| 词汇正确性判定 | **R2:raw ASR 字面 verify**:raw ASR 命中当前卡的英文或课程显式 `asrAliases` 才计 hit;比较前会折叠大小写、标点、空格、连字符等分隔符 | LLM 曾把 "Kite." 判成 cat correct;字面 verify 截断过度容错;`ice cream` / `ice-cream` / `icecream` 这类 compound word 分隔符差异不应阻断进度;`pie`/`派` 这类中英同音词必须由课程显式 alias 放宽,不能默认把所有中文释义当成英文通过 |
| ~~show_card normalize (R3 放宽)~~ → **R5 严格白名单** | word card 必须 ∈ `{currentCard, nextCard}`;currentCard 若已 cleared 也拒绝;rejected 时 fallback push `activeWordCardId` | R3 过宽导致 LLM 在 cat 已通过后仍 show_card 回 cat(2026-05-22 实测 70 轮里 7 次);严格白名单 + nextCard 计算确保只能切到目标顺序的下一张 |
| closing 总结约束 | **R4 始终注入** + **R6 currentWord 白名单**:扫 speech 含未学词时替换为安全模板,但 `memory.currentWord` 与 `state_update.current_word` 不算未学词 | R4 原意防 LLM 结课时枚举全部 12 词;R6 修正:教 cat 时说"cat"不算 unlearned,否则每轮都触发整句替换 |
| 词卡 cleared 触发 + 切卡 | **R-C(2026-05-23,取代 R-A/R5/R7):服务端权威 — `cardCorrectCount[cardId]` 计 raw ASR 字面命中 canonical target token 的次数,累计 ≥ 2 时 mark `cleared`(锁,不再计数)。** target 集合来自 `WordCard.english` + `WordCard.asrAliases`;canonical token 会 lower-case,保留 ASCII 字母/数字和 CJK 字符,删除分隔符,所以 `ice cream` 可命中 `icecream`,`派` 可作为 `pie` 的显式别名命中。normalize 模式机:(1) 当前卡未 cleared → 强制 `show_card → currentCard`,拒绝任何其它 word card 切换;(2) 当前卡本轮刚 cleared → 强制推进 `show_card → nextCard`,这就是"OK 你说对了 → 看下一个"那一刻;(3) sentence card 只允许 `sentence_<currentCard>`。LLM `attempt_assessment.result` 不再决定 cleared,仅在无 R2 命中时驱动 streak / needs_review。 | LLM 主观判定 close/correct 不稳定:实测同一句 "Cat." 一次判 close 一次判 correct,导致一会儿不推一会儿乱推;且 R7 强推 + LLM speech 滞后产生卡嘴错位,R-A 又造成 LLM 当回合 speech 跟卡面对不齐。R-C 把"是否推卡"完全交给服务器按字面计数判定,LLM 只负责语言反馈;同时 2 次门槛比 1 次更接近真实学习强度(小朋友说对一次可能是巧合,2 次基本能复现) |
| ASR/TTS usage | ASR 记请求数 + 识别文本长度,TTS 记请求数 + speech 字符数 | 当前没有 provider-native ASR token/TTS usage,先保证课后报告可观测 |
| 画布比例 | 1:1 正方形,图片区 75%(4:3),文字区 25% | 幼儿教学:图片为主角(75%),文字为锚点(25%);图片生成统一 4:3 横版(1024×768)填满图片区 |
| 三阶段 phase 切换 | 规则驱动,`PhasedLessonController` 判定 | LLM 自主切换不可预测;规则可测、可回滚 |
| reinforcement 静态 TTS | quiz prompt / retry hint 由 `LessonController.speakStatic` 走既有长连 TTS,不调 LLM | 强化阶段提示语是课程数据里的确定文本,复用音频链路即可,避免额外 LLM 延迟与不可预测文案 |
| 新标准唯一化 | 当前通过 registry 暴露 10 门常规课程;旧 `transportation` / `timeNumbers` 数据与 `LessonView` fallback 已退役 | 避免长期维护两套课程路径 |
| LessonController 定位 | 继续复用 ASR/TTS/SSE 管线,不作为独立 lesson UI 入口 | 降低重写音频链路风险 |

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

- **课程 Session resume**:活动 session 已有 `SessionStore` 边界,但默认实现仍是进程内 `InMemorySessionStore`;server 重启 / 刷新 / 断网后客户端旧 sessionId 仍会失效。客户端 fetch `/api/chat?action=message` 收 404 时仅提示"课程已过期,回首页重新进入"。完整 resume 仍需 SQLite-backed store + client resume 流程。
- ~~**actions 与 TTS 时序**~~ — **已修复(R1)**:`pendingActions` 缓冲机制,`show_card` emit 推迟到 `tts.session-finished`
- **MiMo first-token 4 秒**:首音频延迟主要瓶颈,前端无法优化
- **ASR 识别质量**:已补 targetWords hotwords;字典化 fallback 纠正已撤销(见 §「真实回归基线」)。当前由教学循环 v1.1 的 LLM `attempt_assessment` 基于 raw ASR + currentCardId + drillParts 做课堂内容错判定,真实儿童语音效果等下一节课实测
- **Token 消耗偏高**:LLM message history 已裁到最近 12 条(约 6 轮),仍未做摘要压缩
- **音色微调**:Tina老师2.0 当前满足,后续可做更细试听
- **VAD 自动停止**:依赖用户主动松手,无静音兜底(防"按住不放")
- **WebSocket 重连退避**:当前重连一次,可加指数退避
- **预加载开场白 TTS**:利用豆包 cache 让首句几乎零延迟

---

## 9. Eval 设计:让 Agent 可以被量化地演化

EduAgent 不是一次性脚本,而是一个会持续迭代的课堂 Agent。只看单轮回复是否
"像老师"不够,因为真实问题常发生在跨轮教学循环里:有没有推进目标词、有没有卡住、
老师说的话和画面是否一致、一次课的上下文成本是否过高、修复后同类问题是否真的减少。
Eval 的职责就是把这些课后人工判断沉淀成确定性、可比较、可回归的数据。

### 为什么需要 Eval

- **把体感变成决策依据**:真实试听能发现问题,但下一步改 prompt、改状态机、改课程数据还是
  改 provider tracking,必须依赖同一套指标比较。
- **防止只优化局部回复**:Agent 的质量不只是一句话,而是一节课能不能从 intro 推进到
  interactive / reinforcement / done,并在目标词上形成有效循环。
- **支撑长期演化**:每次修复或压缩 prompt 后,需要用相同口径比较前后 session,否则容易
  只凭最新一节课的印象做决策。
- **控制成本与质量的 tradeoff**:Prompt Slimming 这类优化必须同时看 token 成本、教学推进、
  speech/show_card 对齐和提前收尾风险,不能只看输入 token 下降。

### 设计原则

1. **确定性优先**:Eval v1 不使用 LLM-as-judge。所有指标来自 SQLite 日志、课程定义、
   `word_performance`、token usage 和 prompt input breakdown。
2. **评估 session,不是评估孩子**:`cleared` 只表示本节课内达到两次 raw-ASR 命中后可以推进,
   不代表长期掌握度;`needs_review` 也只是课堂内复习信号。
3. **面向迭代决策**:Eval 输出不是为了给一节课打总分,而是指出下一步优先级,例如
   `prompt_input_slimming`、`teaching_loop_stuck`、`speech_card_alignment` 或
   `provider_tracking`。
4. **跨版本可比较**:同一指标口径要能用于真实课、smoke 课和历史 session。老 session 缺
   `inputBreakdown` 或 `word_performance` 时,报告应降级为空/零值,不能中断读取。
5. **先覆盖工程可观测面**:v1 先量化运行健康、成本、教学推进和 Agent 行为风险;主观体验、
   孩子兴趣、长期学习效果留给后续 Eval 版本或人工报告补充。

### Eval v1 评估维度

`scripts/lesson-report-data.ts` 在基础 session / tokens / interactions 之外输出
`eval` 结构化评分卡:

| 维度 | 评估什么 | 典型问题 |
|------|----------|----------|
| `sessionHealth` | 这节课日志是否完整、是否结束、交互数是否一致、provider usage 是否可观测 | session 中断、ASR/TTS usage 缺失、token 数据坏 |
| `costContext` | LLM 输入/输出成本、平均每轮 input、最大 input、prompt breakdown 覆盖率和最大 bucket | 平均输入过高、最大成本来自 static rules 或 course definition |
| `teachingLoop` | 目标词覆盖、attempted / cleared / needs_review、clear rate、连续卡同一张卡的 run | 目标词没覆盖、clear rate 低、某张卡卡住 3 轮以上 |
| `agentBehavior` | speech/show_card 残余错位、提前收尾、空回复、空 action、重复话术 | 老师讲 dog 但画面是 bird、还没教完就总结、连续重复 |
| `nextIterationSignals` | 把上述指标翻译成下一步工作信号 | 进入 Prompt Slimming、修教学循环、补 provider tracking |

### 样本准入与使用方式

用于产品/Agent 决策的真实课样本至少要满足:交互轮数足够(当前人工口径是 >15),
不是已知 UI bug 造成的中断课,并且 session 数据能被 `lesson-report-data.ts` 读出。
Smoke session 可以验证状态机和报告管线,但不能替代真实课样本。

典型决策流程:

1. 真实课结束后跑 `pnpm tsx scripts/lesson-report-data.ts <session-id>`。
2. 先看 `sessionHealth`:如果数据不完整,优先修埋点或 session 记录。
3. 再看 `agentBehavior`:如果有 speech/card 错位、提前收尾、空回复,优先修行为正确性。
4. 行为基本健康后看 `teachingLoop`:判断 coverage / clear rate / stuck run 是否需要改教学循环。
5. 最后结合 `costContext`:当教学行为健康但 input 仍过高,才进入 Prompt Slimming 这类成本优化。

### v1 不评估什么

- 不评估孩子的长期掌握度或真实英语能力。
- 不评估主观体验、动画观感、老师音色是否更讨喜。
- 不用 LLM 对课堂质量做开放式打分。
- 不替代课后人工报告;它提供可回归指标,人工报告仍负责解释具体 ASR 误识、话术质量和产品判断。

---

## 10. 文件演进历史(粗粒度)

- 2026-05-01 — 初版语音管线实施 + sync 文档(README/TODO/benchmarks)
- 2026-05-01 — **E2E 验收期间多处集成 bug 修复**(架构定型的关键改动)
- 2026-05-01 — 删 [bench] 打点 + TODO 增补
- 2026-05-01 — 新增 architecture.md + CLAUDE.md(本 living doc 制度建立)
- 2026-05-01 — git history redact secrets + CLAUDE.md 加凭据规则
- 2026-05-05 — **画布 v2:WordCardCanvas 替换 ImageCanvas** — 协议从 show/focus/annotate 统一为 `show_card`;课程数据从 `images[]` 迁移到 `cards[]`(`kind: 'word'|'sentence'`);画布层从图叠层改为图+中英文独立 DOM;删除 ShowTool/FocusTool/AnnotateTool 组件
- 2026-05-10 — **教学循环 v1.1:课堂内进度引擎 + drillParts** — 每张 card 必填 `drillParts`;服务端用 `show_card` 同步 currentCardId;LLM 输出 `attempt_assessment`;memory 维护 `cardProgress` / `clearedCardIds`;history 裁到最近 12 条
- 2026-05-14 — **前端重构 Bunny 的小院子** — 5 空间 5 页面;Bunny 升级为 pose × mood 全身组件;新增 SceneFrame + LetterCard + WordBook + BloomButton + StickerWord + 储物间 / 阁楼;新增 /api/{progress,sessions,stats};客户端 PIN 门控;详见 §12
- 2026-05-15 — **三阶段 lesson structure refactor** — 新增 food 三阶段课程、ImageGen PNG 单卡资产 + 结构化 `scene.svg`;新增 phase-aware prompt / SSE progress_snapshot / `phase-transition` / `quiz-answer`;新增 `PhasedLessonController` + Intro / Interactive / Reinforce / Quiz 组件;删除旧课程数据与旧 `LessonView` fallback;`Course.phases` 收紧为必填
- 2026-05-20 — **CC 手绘绘本风 UI 接入** — 前端替换为麻吉魔法学院;新增 magic 原子 / PictureCard / HomeStudy / IntroFrame / LessonMandalaV2 / ReinforcementFlow / JournalPage / ParentsPage;`theme` 改 `tone`;删除 scene.svg 与旧 UI 组件。
- 2026-05-21 — **课程 registry 扩展** — 可见课程扩到 10 门;常规课合同收紧为 12 word cards + 4 sentence cards;repeat-after-me 绑定 sentence cards;课程资产只为 word cards 生成 Codex 内置 `image_gen` PNG,sentence cards 复用目标词图片。
- 2026-05-22 — **Teacher Agent UX P0 四项修复** — R1:actions/TTS 时序(pendingActions 缓冲);R2:ASR 字面 verify(LLM correct + raw ASR 双重确认才 cleared);R3:normalize 放宽(word card 接受任意 untouched/attempted);R4:closing guard 始终注入 + 服务端 speech 扫描替换。
- 2026-05-22 — **Teacher Agent state sync 三项修复**(从 05-22 实测课报告) — R5:show_card 严格白名单 `{currentCard, nextCard}`(R3 收紧,防 LLM 回跳已通过卡);R6:closing guard 加 `currentWord` 白名单(防教学中误触发整句替换);R7:correct 后服务端自动 push `show_card: nextCard`(防 LLM 命中后不推进)。（旧 `getNextWordCardId` helper 已在 2026-05-24 清扫时删除,其功能被 R-C 的 `findFirstUncleared` 内联替代）
- 2026-05-22 — **reinforcement quiz 静态 TTS 引导** — 新增 `LessonController.speakStatic` 与 `quiz-speaking` state;pick-word 播 prompt + correct English,repetition 播 targetText;播完前锁 UI,错答播 retry hint;reinforcement phase-change 等过渡 TTS 完成后再显示 quiz。

- 2026-05-24 — **代码库清扫(A+B+C)** — 删 logger.ts / callLLM / incrementSilentTurns / silentTurns / GenerateState / addAssistantMessage(内联) / getNextWordCardId;prompt state_update 删 4 废字段(current_card_id / phase / words_learned / generated_content),仅保留 current_word + attempt_assessment;mockStreamLLM 修正为合法 ToolAction。
- 2026-05-24 — **Guard pipeline 重构(D)** — 新增 `src/lib/agent/guards/`(index / closing-guard / premature-closing-guard / normalize-actions / speech-card-align + 各自 *.test.ts);`streamUserInput` 从 169 行压缩到 60 行;行为不变;每个 guard 有独立单测;`docs/architecture.md` 新增 §4c。
- 2026-05-25 — **R-C canonical matching + explicit ASR aliases** — R-C 计数前对 target 与 raw ASR lower-case,保留 ASCII 字母/数字和 CJK 字符并删除分隔符,修复 treats 课程 `ice cream` ASR 输出无法命中 `icecream` 卡片 id、导致无法推进到 `lollipop` 的问题;新增 `WordCard.asrAliases` 支持课程显式声明 `pie` 可由 ASR 输出 `派` 命中,但不默认把所有中文释义算作英文通过。
- 2026-05-26 — **Prompt input quantification** — `/api/chat` 每轮 LLM 调用前通过 `buildPromptInput()` 生成同一份 system prompt 与 inputBreakdown,按 static rules / phase rules / course definition / lesson state / summary constraints / history / separators 记录字符数,并在拿到 MiMo `prompt_tokens` 后按字符占比估算各 bucket token;`interaction_logs.model_calls.llm.inputBreakdown` 持久化该诊断,`lesson-report-data.ts` 聚合 trackedTurns、平均字符、最大 bucket 和估算 token share,用于决定下一轮 prompt slimming 先压哪里。
- 2026-05-26 — **Eval v1 lesson quality scorecard** — `lesson-report-data.ts` 在原有 session/tokens/interactions 基础上输出 `eval` 结构化评分卡:session health、cost/context、teaching-loop outcomes、agent behavior risks、next-iteration signals。所有指标从 `lesson_logs`、`interaction_logs`、课程词卡定义和 `word_performance` 确定性计算,不引入 LLM-as-judge,用于把课后报告里的人工判断沉淀成可回归、可比较的数据。

> 不再 hardcode SHA — 因 git history 经过 redact 重写,SHA 不稳定。具体 commit 用 `git log --oneline` 现查。

---

## 11. 开发工具链 — 课后报告生成器

实测课后用 `/lesson-report` slash command 生成内部诊断报告,驱动迭代决策。

调用链:

    /lesson-report [session-id?]
      ↓ Claude 读 .claude/commands/lesson-report.md
      ↓ 跑 pnpm tsx scripts/lesson-report-data.ts [session-id?]
      ↓ 拿 JSON(基础聚合 + anomaly flags + prompt input breakdown + eval scorecard + 全部 interactions)
      ↓ Claude 按 prompt 模板生成 markdown
      ↓ Write 到 docs/lesson-reports/YYYY-MM-DD-<sid8>.md(已 gitignore)

**职责切分**:
- **`scripts/lesson-report-data.ts`**(数据层,有单测):基础聚合 + 课程目标词 + anomaly flags(`highAvgInput` / `asrUsageNotTracked` / `ttsUsageNotTracked` / `tokensCorrupted`) + prompt input breakdown 聚合(`trackedTurns`、平均字符、最大 bucket、估算 token share) + Eval v1 scorecard。Eval v1 输出 `sessionHealth`、`costContext`、`teachingLoop`、`agentBehavior`、`nextIterationSignals`,用于量化 session 是否健康、上下文成本是否偏高、目标词覆盖/清除情况、卡住/错位/提前收尾等 Agent 行为风险,以及下一步应该优先做 prompt slimming、教学循环修复、provider tracking 还是数据完整性修复。pure 函数 `buildReport(db, sessionId, courseLoader)`,接受依赖注入。
- **`.claude/commands/lesson-report.md`**(LLM 层):报告模板 + 写作要求,LLM 看 raw `interactions` 判 ASR 误识 / 话术循环卡死。

**报告范围**:只产出**工程信号**(ASR 误识 / 话术循环 / token / 埋点),教学策略类观察只列不评判。spec 见 `docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`。

---

## 12. 前端架构(麻吉魔法学院,2026-05 CC 重构)

5 个空间 / 5 个页面 / 1 个麻吉小猫组件:

```
/                          魔法书房  · HomeStudy
/lesson/[id]               魔法课堂  · IntroFrame / LessonMandalaV2 / ReinforcementFlow
/lesson/[id]/done          下课庆祝  · DoneCelebrateFrame
/journal                   魔法书    · JournalPage
/parents                   家长阁楼  · PINGateFrame + ParentsPage (PIN 客户端门控)
```

### 关键模块

| 文件 | 职责 |
|------|------|
| `src/components/magic/*` | 绘本风 UI 原子:Cat / PaperBg / Star / Sparkle / PaperButton / IllustrationSlot / PictureCard |
| `src/components/home/HomeStudy.tsx` | 魔法书房首页,课程以书本卡呈现 |
| `src/components/lesson/{IntroFrame,LessonMandalaV2,QuizPickWordFrame,ReinforceFrame,ReinforcementFlow,DoneCelebrateFrame}.tsx` | 课中六屏 view 层,保留控制器与 phase 状态机 |
| `src/components/lesson/useStaticPromptSpeech.ts` | 强化 quiz 静态 TTS 播放与解锁 gate |
| `src/components/journal/JournalPage.tsx` | 魔法书双页,按 progress 聚合展示词卡 |
| `src/components/parents/{PINGateFrame,ParentsPage}.tsx` | 家长阁楼 PIN + dashboard |
| `src/components/ui/{ErrorBoundary,SVGDefs}.tsx` | root 兜底与全局 SVG defs |
| `src/lib/progress.ts` / `stats.ts` / `pin.ts` | 纯聚合 + 客户端 PIN |
| `src/app/api/{progress,sessions,stats}/route.ts` | 三个只读聚合 API;请求开始先 `ensureDatabaseInitialized()` 支持 fresh DB |
| `scripts/smoke-pages.ts` | `pnpm run smoke` 起 dev server + 探 5 页面 + 4 API |
| `scripts/lesson-smoke.ts` | `pnpm smoke:lesson` 先用 Chrome 验证 push-to-talk 按钮 / Space 持按保持 recording,再用 `/api/chat` 文本脚本验证 teacher agent 状态机与 speech/show_card 一致性 |

### Design tokens

- 调色:`tailwind.config.ts` 中 `paper / ink / rose / butter / mint / sky / lilac / peach / cat* / ember` 以及 Deep / Shadow 变体。
- 字体:全局 `globals.css` 加载 LXGW WenKai TC / ZCOOL KuaiLe / Fredoka / Caveat / JetBrains Mono,并通过 `font-zh` / `font-display` / `font-en` / `font-en-script` / `font-mono` 使用。
- 圆角阶:`rounded-paper-sm/md/lg/pill`。
- 阴影:`shadow-paper` / `shadow-paper-hero`,均为绘本纸张的实心偏移阴影。

### PIN 门控

家长后台 PIN 在客户端 `lib/pin.ts`,SHA-256 加盐 hash 存 localStorage,错 3 次锁 30s,成功验证 reset 失败计数。不走服务端 API(单用户本地工具)。

### 数据流

```
fetch /api/courses    → 首页 HomeStudy 书本列表(当前返回 registry 中 10 门课程)
fetch /api/progress   → JournalPage / 总结页(WordMastery + 3 星掌握筛选)
fetch /api/sessions   → ParentsPage 最近课堂列表(默认 limit=10)
fetch /api/stats      → ParentsPage 数据卡(总分钟 + 掌握词数;streak/accuracy 暂显示占位)
voice WS / SSE        → 上课页(PhasedLessonController 包装 LessonController)
```

`/api/progress` / `/api/sessions` / `/api/stats` 是只读业务接口,但会在查询前调用 `ensureDatabaseInitialized()` 跑 SQLite migrations。这样 fresh checkout 或临时 `DATABASE_PATH` 不需要先跑一节课或命中 `/api/chat`。当前 migration v1 创建 `lesson_logs` / `interaction_logs` / `word_performance`,并在 `schema_migrations` 写入版本 marker;已有本地 DB 若缺少 marker,会幂等补写而不删除课堂数据。

### Mastery 派生

```ts
masteryStarsFromRatio(correct, attempts):
  attempts === 0      → 0
  ratio >= 0.9        → 3
  ratio >= 0.6        → 2
  ratio > 0           → 1
```

`buildProgressSnapshot` 跨多 lesson SUM(attempts/correct),`lastPracticed` 取 `MAX(start_time)`。

### Reduced-motion 策略

`prefers-reduced-motion: reduce` 时,全局动画/过渡降级为 0.01ms,并显式关闭 `.magic-sparkle` 闪烁动画。

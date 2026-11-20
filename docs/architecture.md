# EduAgent 架构(living doc)

> **本文档反映 master 上的当前实际实现。改 bug / 加功能必须同步更新。**
> 本文不复述历史实施计划,只描述"现在长什么样"。
> 跟读"答对"的分层产品规则:ASR 字面命中只做基础推进信号,真正的发音质量评估需要原始 audio + reference text,当前还未接入专门 pronunciation scoring 服务。

**变更历史**:2026-10-30 之前每次重大同步的说明、MiMo 时代性能基线和文件演进历史已原样移到 [`docs/archive/architecture-history.md`](archive/architecture-history.md)。本文只写现状,不再在这里追加同步记录;变化过程看 git log。

**当前运行范围**:本项目支持本地 Mac Electron 桌面版和桌面浏览器开发模式(访问本地 server)。暂不支持 iPadOS app、移动端 Web、或面向公网发布后的移动兼容。

**导航**:两种课堂模式共用前端、数据和桌面外壳。原有按住说话课堂(豆包 ASR/TTS + LLM)见 §1–§4c;Realtime 自然对话课堂见 §16–§18。前端 §12,数据一致性 §13,配置来源 §14,桌面版 §15。

---

## 1. 系统全景

```
浏览器                                Next.js 自定义 server                     上游
┌─────────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│ AudioWorklet        │         │ ASR proxy            │         │ 豆包流式 ASR     │
│  pcm-recorder       │── WS ──▶│  /api/voice/asr      │── WS ──▶│  bigmodel_async │
│  + Recorder/        │         │  (按轮建连 + buffer)  │         └─────────────────┘
│    HoldToTalk       │         │                      │                          
│                     │         │ Chat / SSE           │── HTTP ▶│ LLM(OpenAI兼容) │
│ LessonController    │◀── SSE ─│  /api/chat           │  stream │  渠道见 §14     │
│                     │         │                      │         │                 │
│  (浏览器调度状态机)  │         │  (SpeechExtractor)   │         └─────────────────┘
│                     │         │                      │                          
│ PcmPlayer           │         │ TTS proxy            │         │ 豆包流式 TTS     │
│  + CatSpeech        │── WS ──▶│  /api/voice/tts      │── WS ──▶│  seed-tts-2.0   │
│  + PictureCard      │         │  (长连复用 + cancel)  │         │  Tina老师2.0     │
└─────────────────────┘         └──────────────────────┘         └─────────────────┘
                                       ↓
                                 SQLite (lesson_logs / interaction_logs /
                                 word_performance / course_progress / learners)
```

上图是原有按住说话课堂的管线。Realtime 模式不经过豆包代理和 `/api/chat`:浏览器麦克风轨道经 WebRTC 直连 OpenAI,服务端通过 sideband 执行教学工具并写同一套 SQLite,见 §18。

**为什么自定义 Next.js server**:Next.js App Router 不支持 WebSocket `upgrade` 事件。`server.ts` 接管 HTTP server,把 `/api/voice/asr` 与 `/api/voice/tts` 的 upgrade 请求转给对应 proxy 模块,其它请求让 Next.js 处理。upgrade 前先按 `isAllowedWsOrigin`(loopback + 配置端口白名单,`src/lib/voice/ws-origin.ts`)校验 `Origin`,拒绝跨站 WS 劫持(CSWSH,会盗用服务端豆包凭据);缺失 `Origin` 的非浏览器客户端放行。

---

## 2. 模块清单与职责

| 文件 | 职责(一句话) |
|------|--------------|
| `server.ts` | 自定义 Next.js server,WebSocket upgrade 路由分发 |
| `src/lib/init.ts` | 数据库初始化(`ensureInitialized` / `ensureDatabaseInitialized`)。不再校验 env:凭据缺省由 `config.ts` 的 `isConfigured()` 判定,见 §14「配置来源与未配置状态」 |
| `src/lib/voice/doubao-codec.ts` | 豆包二进制协议编解码,ASR/TTS 共用 |
| `src/lib/voice/asr-proxy.ts` | server 端 ASR 代理,**握手期 PCM buffer + finish 缓存 + 按 currentCardId/nextCardId 注入 hot_words(无 cardId 时 fallback 全课词)** |
| `src/lib/voice/tts-proxy.ts` | server 端 TTS 代理,**长连复用**(StartConnection 一次,session 多次),ConnectionStarted 前缓存 session 控制帧 |
| `src/lib/voice/ws-teardown.ts` | ASR/TTS proxy 共用的幂等 teardown(`createWsTeardown` → `{ close, isClosed }`:关一次、两端都关、吞异常);只共享 teardown,握手/缓冲/sequencing 仍各自独立 |
| `src/lib/voice/asr-client.ts` | 浏览器 ASR WS 包装,`finish()` 通知 proxy 录音结束 |
| `src/lib/voice/tts-client.ts` | 浏览器 TTS WS 包装,转发 startSession/text-chunk/finishSession/cancel |
| `src/lib/voice/lesson-controller.ts` | **浏览器侧调度器,8 状态机,统一编排 ASR + SSE + TTS + 静态 quiz TTS** |
| `src/lib/voice/turn-timeout-guard.ts` | 命名一次性恢复计时器(asrFinal 5s / chatWatchdog 35s / speechFinish 1.5s)的 arm/clear/clearAll 记账;recovery 回调仍在 controller(staticSpeech 10s promise 超时不归它管) |
| `src/lib/agent/orchestrator.ts` | 把 `streamUserInput` 包成 SSE `ReadableStream` 给 `/api/chat` |
| `src/lib/agent/session-store.ts` | 活动课堂 session 的存取边界;运行态 session 仍是进程内 `InMemorySessionStore`(退出即焚)。**跨会话续课(2026-07-20)不替换这里**——而是把"每门课的进度断点"落 `course_progress` 表,进课时 `createSessionFromSnapshot` 重建 memory(见 `course-progress.ts` / §3.1b) |
| `src/lib/agent/session.ts` | LLM 一轮对话骨架:通过 `SessionStore` 查找 session + addUserMessage → streamLLM 消费 → finalize + sanitize → **runPipeline(guards)** → yield SSE → commitTurn;`commitTurn`/`recordQuizAnswer` 每轮 `upsertCourseProgress` 落断点,`createSessionFromSnapshot` 从断点重建会话 |
| `src/lib/agent/course-progress.ts` | **会话持久化(2026-07-20)**:LessonMemory 进度子集 ↔ `course_progress` 快照序列化(排除 messages/interestSignals);`isCourseComplete`(全 word cleared + 全 quiz passed)、`isResumableProgress`(排除 completed 与空 intro 断点)、`resolveResumeCardId` |
| `src/lib/agent/guards/` | **Guard pipeline**(见 §4c) |
| `src/lib/agent/speech-extractor.ts` | **流式 JSON 中提取 `speech` 字段值,状态机解析,边收边吐 delta;导出 `sanitizeSpeech` 剥离 `xxx_yyy` 这种 card_id token,防止 TTS 把 `_` 读成"下划线 / underscore"** |
| `src/lib/agent/memory.ts` | 课堂记忆:词汇命中、兴趣信号、turn 历史、当前词精确尝试判定 |
| `src/lib/agent/prompt.ts` | 课堂 system prompt 拼装,包含已学词总结与连续失败切策略约束 |
| `src/lib/llm.ts` | OpenAI 兼容 chat/completions 调用(当前渠道见 §14),`streamLLM` 异步生成 token delta + final usage;只读 `LLM_*`,见 `config.ts` |
| `src/lib/audio/recorder.ts` | **课堂实例拥有 mic + AudioContext + worklet**，`LessonRecorder.prewarm()` 提前就绪，同课多轮复用，旧课清理不触碰新课资源 |
| `src/lib/audio/pcm-player.ts` | 浏览器 24kHz PCM 队列播放,`stop()` 立即静音 |
| `public/worklets/pcm-recorder.worklet.js` | 按所属 AudioContext 的采样率(原有课堂 16kHz)Float32 → Int16 量化,200ms 一包,**支持 flush 残余**;Realtime 自然对话不经 worklet,麦克风轨道直接进 WebRTC |
| `src/data/courses/*.ts` | 可见课程数据:常规课为 12 word cards + 4 sentence cards,`tone` 是课程色板键,不对应 Tailwind 颜色类 |
| `src/data/courses/index.ts` | 新标准课程 registry,导出 `allCourses` / `getCourseById`;首页、API、lesson route 共用 |
| `src/lib/voice/phased-lesson-controller.ts` | 外层 phase 状态机,包装 `LessonController` 音频管线并规则驱动 phase 切换 |
| `src/components/lesson/PhasedLessonView.tsx` | 顶层 lesson UI,按 currentPhase 切 Intro / Mandala / Reinforce / Done |
| `src/components/lesson/IntroFrame.tsx` | 主题导入:麻吉 + 锁定 chip 网格,不再依赖 scene.svg |
| `src/components/lesson/LessonMandalaV2.tsx` | 逐词跟读,保留 `LessonController` ASR/TTS 管线 |
| `src/components/lesson/useStaticPromptSpeech.ts` | 强化 quiz 静态 TTS gate:等待 `awaiting`,调用 `speakStatic`,短暂失败重试,播完后解锁 UI |
| `src/components/lesson/QuizPickWordFrame.tsx` | quiz:静态 TTS 播 prompt + 正确英文词,播完前锁选词卡选择 |
| `src/components/lesson/ReinforceFrame.tsx` | quiz:静态 TTS 播 targetText,播完前锁 repeat-after-me 录音 |
| `src/components/lesson/ReinforcementFlow.tsx` | 强化巩固流程编排,串联 pick-word / repeat-after-me quizzes,错答时播静态 retry hint |
| `src/components/lesson/DoneCelebrateFrame.tsx` | G 下课页:逐词掌握、最近课次时长、建议下一课,课堂内与独立路由共用 |
| `src/hooks/useSpacebar.ts` | 文档级空格 push-to-talk(过滤 `e.repeat` 与输入框) |
| `src/lib/db/sqlite.ts` | SQLite 驱动由 `better-sqlite3` 换成 Node 内置 `node:sqlite`,统一经 `src/lib/db/sqlite.ts` 封装(保留 `prepare/exec/pragma/transaction/close`,嵌套 transaction 用 SAVEPOINT)。无原生模块,`pnpm.onlyBuiltDependencies` 已移除。 |
| `src/lib/db/index.ts` | SQLite 连接持有者。`getDb()` **每次调用时**解析 `DATABASE_PATH`(相对 `process.cwd()`),路径与已开连接不同则 close 旧的重开——正常运行路径恒定,行为仍是进程内单连接;开库前 `mkdirSync(dirname, {recursive:true})`(better-sqlite3 只建文件不建目录,而 `db/` 不在 git 里,fresh checkout 没有该目录);导出 `closeDb()` 供测试在切临时 DB 前后显式释放,堵住"模块加载期捕获路径"导致的跨测试文件泄漏 |
| `src/lib/db/learners.ts` | 孩子档案 CRUD 与单事务连带删除 |
| `src/lib/db/schema.ts` + `queries.ts` | `schema.ts`:SQLite migration runner / 表结构 / `schema_migrations` 版本记录(v6 加课堂模式标识，v5 按孩子隔离，断点表主键为 `(learner_id, course_id)`);`queries.ts`:全部业务 SQL 的单一边界——写入 + 断点读写(`upsert`/`getCourseProgress`)+ 报表只读(`getLessonTimings` / `getRecentLessons` / `getLessonWordPerfCount` / `getWordPerformanceByCourse` / **`getLessonCountByCourse` / `getAllCourseProgress`**),调用方注入 `db` 只做 JS 聚合,自己不写 SQL |
| 前端组件(shell / ui / home / settings / records / lesson 视图) | 见 §12「关键模块」 |

---

## 3. 关键数据流

### 3.1 进入课程(开场白)

```
PhasedLessonView mount → new LessonController → new PhasedLessonController
  ├─ phased.startLesson(learnerId)
  │    └─ controller.startLesson(courseId, learnerId)
  │    ├─ Promise.all:
  │    │   ├─ tts.open() → WS /api/voice/tts → 豆包 StartConnection (event=1)
  │    │   │     ◀── ConnectionStarted (event=50, ~3.7s 首次握手)
  │    │   │     ConnectionStarted 前前端发来的 session 控制帧在 proxy 内排队
  │    │   └─ audioRecorder.prewarm() — getUserMedia + AudioContext + worklet + source 全就绪
  │    └─ POST /api/chat {action:start, courseId, learnerId}
  │         ◀── SSE: speech-delta × N, actions, done
  │              ├─ speech-delta → tts.startSession + sendText (流式合成)
  │              │     ◀── TTSResponse (event=352, PCM) → PcmPlayer.enqueue
  │              └─ done → tts.finishSession (event=102)
  │                   ◀── SessionFinished (event=152) → state→awaiting
```

### 3.1a 课堂操作确认（2026-09-22）

`LessonController.startLesson()` 只有收到 SSE `done` 才返回 true；HTTP 错误、SSE `error`、缺少 `done` 的 EOF 和网络拒绝均清理失败开场并返回 false，页面恢复开课按钮。`sendCustomAction()` 返回 `{ ok, acceptedPhase? }`，失败释放忙态并丢弃未确认 actions。卡片动作必须同时满足 SSE 已确认与原有 TTS 释放条件。

转场 route 在更新 `Session.currentPhase` 后返回 `X-Lesson-Phase`。这个头确认阶段已在服务端接受，不代表开场语音成功或断点已经持久化。`PhasedLessonController` 不再提前改阶段；未确认失败保留原阶段，已接受但语音失败则保留服务端阶段。页面显示“再试一次”，由用户触发单次重试，避免 awaiting 事件自动循环重发。

强化答题统一调用 `LessonController.submitQuizAnswer(quizId, answer, correct)`，HTTP 成功且 JSON `{ok:true}` 才推进题号/错答次数/完成。保存中及保存失败时锁住新的作答，失败保留原答案并提供“重试保存”；保存失败不算答错。网络响应丢失时服务端是否已写入不确定，本实现不自动重发，也不承诺跨断网的持久化 exactly-once。

### 3.1b 断点续课恢复(2026-07-20)

`POST /api/chat?action=start` 必填 `learnerId`，档案不存在返回 404；按 `(learner_id, course_id)` 查 `course_progress`，会话保存 `learnerId`，后续动作只传 `sessionId`:
- `isResumableProgress` 为真(未完成 + 非空 intro 断点)→ `createSessionFromSnapshot` 用断点重建 memory(messages 清空,**不回放对话**),`currentPhase` 恢复到断点阶段,响应头 `X-Resume-Info`(JSON:`{resumed,phase,clearedCardIds,resumeCardId,passedQuizIds}`);前端据此从断点阶段起播、老师"欢迎回来"、reinforcement 从第一个未过 quiz 起。
- 否则(新课 / 已完成 / 空 intro 断点)→ 现状 `createSession`,无 `X-Resume-Info`,响应字节同旧版(PRD"否则现状")。
- 可选请求字段 `fresh: true`(首页"从头复习",仅有断点的课显示)→ 跳过断点直接 `createSession`,无 `X-Resume-Info`,日志 `[chat] fresh start (requested)`。不删旧断点:新会话第一轮 `commitTurn` 按原逻辑覆盖 `course_progress`;`word_performance` 逐词掌握不受影响。前端经 URL `?fresh=1` → `LessonClient` → `PhasedLessonView(fresh)` → `startLesson(..., {fresh})` 透传,开课成功后 `router.replace` 去掉该参数(刷新页面不会再次从头开始)。

每轮 `commitTurn` / `recordQuizAnswer` 用 `serializeProgress` upsert 断点(`isCourseComplete` 判 `completed`)。**完成 = 全 word cleared + 全 quiz passed**(quiz 答对累积 `passedQuizIds`)。**不过期**(PRD R4)——断点一直有效到该课完成;完成后行仍保留但不再恢复(下次是复习式全新开始)。「空 intro 断点」判据(`isResumableProgress`)专门挡住"进课只听开场白就退→误判续课、老师错误地说欢迎回来"。

### 3.1c 模型服务失败提示(2026-10-24)

`llm-errors.ts` 的纯函数 `classifyLlmFailure({ status?, body?, error? })` 供 `streamLLM` 与设置页 LLM 探测共用。稳定错误码为 `LLM_INSUFFICIENT_BALANCE`(402 或余额不足文字)、`LLM_AUTH_FAILED`(401/403 或鉴权文字)、`LLM_MODEL_UNAVAILABLE`(404 或模型错误文字)、`LLM_RATE_LIMITED`(429)、`LLM_TIMEOUT`、`LLM_NETWORK_ERROR`、`LLM_OTHER`。明确 HTTP 状态优先于 body 中可能有歧义的文字,例如 429 的 insufficient quota 仍归限流。超时覆盖连接与流读取;调用方主动取消保持原取消语义。

服务端抛出只含安全信息的 `LlmServiceError`;session 与 orchestrator 保留分类,开课、对话及转场经现有 SSE `error` 发送 `{ code, message }`,不发送上游 body。`LessonController` 保留已知 code 与中文 message,也支持相同结构的 HTTP 错误响应,沿用失败开场清理及对话恢复 awaiting 的流程。未知/无 code 错误保持原位置的通用文案。`PhasedLessonView` 在原提示位置显示具体原因,余额不足、鉴权失败、模型不存在额外显示 `/settings` 的「去设置」链接,这些提示持续保留到开课/转场重试、后续轮次成功提交或离开,其他提示仍在 4 秒后消失。

课堂调用与 LLM 探测失败日志只记录分类 `code`、`status`(无 HTTP 响应时为 null)、安全的 `providerCode`(数字或已知符号码,不可用时为 null),不记录原始错误 body、Key 或任意上游错误文本。

### 3.2 一轮对话

```
用户按住空格(state=awaiting)
  └─ controller.startListening
       ├─ setState('listening'), 记 listenStartedAt
       ├─ new AsrClient,绑 partial/final/error
       ├─ Promise.all:
       │   ├─ asr.open() → WS /api/voice/asr?courseId&targetWords&cardId → 豆包 ASR upstream 握手
       │   │   server 收到 PCM 时:upstreamReady ? 直接发 : 进 pendingPcm 缓存
       │   └─ audioRecorder.start({ onChunk: pcm => asr.sendPcm(pcm) })
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
       ├─ armChatWatchdog(35s):无任何 SSE 事件到达则 abort + 自救回 awaiting(首事件清除)
       ├─ POST /api/chat { action:'message', sessionId, text, asrResult }
       │   (server LLM:4s 无首 token 发对冲请求、出字后 10s 无新 chunk 判卡住、30s 总上限;超时 → SSE error → client 从 thinking 自救)
       │   server: add raw ASR user message
       │           → buildPromptInput 生成 system prompt + inputBreakdown(静态规则 / phase / 课程定义 / 状态 / history)
       │           → streamLLM (prompt 含 currentCardId/cardProgress/drillParts)
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
              → LessonMandalaV2 从最后一条有效 show_card 提取 card_id → LessonCard 切换当前卡片(word 或 sentence_* 均可;已通过 word/sentence 回跳会被 UI 忽略)
              server 同步使用归一化后的 show_card 作为 currentCardId 的事实来源
            done → tts.finishSession (event=102) + armSpeechFinishFallback(1.5s)
              ◀── SessionFinished (event=152) → flushPendingActions + setState('awaiting')
              (若 finish 帧丢失:1.5s 兜底也 flushPendingActions + 回 awaiting,避免卡/词错位)
            error / 无 done 截断 → 命令失败，丢弃未确认 actions、停止失败语音、恢复操作入口
```

强化巩固的共享视图发出 `presentQuiz`、`startQuizListening` 与 `submitPick` 意图。旧模式由 `LegacyClassroom` 调用 `LessonController.startListening({routeToChat:false})`，收到 `asr-final` 后按 `legacy-teaching` 的短句规则判定、保存 `quiz-answer`，再发布来源为 legacy-asr 的 `quiz-result`；不触发额外文本 LLM 回合。共享视图不按转写判分。

旧模式的选词引导和跟读示范仍不走 LLM，适配器将题目转换为既有 `speakStatic`：选词为 prompt 加目标英文，跟读为完整句、慢速分段、完整句。视图的 `useStaticPromptSpeech` 等 `presentQuiz` resolve 后才解锁；控制器忙时继续锁定并在 awaiting 后重试。旧模式适配器保存答案后才累计重试、播放固定重试提示，并按原次数规则给出 retry/advance；共享 `ReinforcementFlow` 只据保存确认呈现结果与推进。

### 3.3 结束课程

```
controller.endLesson:
  → 立即使 run 失效、abort 请求/reader、清理 timers / pendingActions
  → 捕获旧 sessionId / recorder / ASR，同步清空 controller 引用
  → 关闭 ASR / TTS，reject 静态语音 Promise
  → 并行释放本课堂 player / recorder，POST end（独立 5s 截止，不使用已 abort 的 run signal）
  → 同一个 controller 的新 start 等 teardown 完成；新实例可独立启动
  → 只有仍属于该次结束的 controller 才回 idle
```

`LessonController` 的 start/message/custom/quiz 请求及 SSE 消费共享一次 run 的取消信号，并在 await 后检查运行身份。麦克风权限等不能直接取消的初始化，迟到返回后只回收旧资源。`LessonRecorder.dispose()` 同步摘除旧资源引用；迟到 getUserMedia 会停止自己取得的 tracks，不发布给其它课堂。普通录音 stop 仍保留 flush → 尾 PCM → ack/100ms 兜底 → 断开 tap 的顺序。

ASR 上下文按实例传入并复制集合，不再通过模块全局 setter 传递。ASR/TTS 的 socket handler 校验连接身份，close 会结清等待中的 open Promise；旧重连计时器/完成事件不能操作新连接。阶段控制器和 React 等待中的操作也校验是否仍属于当前课堂。

服务端 `Session.lifetime` 持有取消能力。`endSession` 先 abort，公开 lookup 隐藏已关闭课堂；事务保存结束日志/断点成功后从 SessionStore 移除，失败则仅保留供 end 重试。`streamUserInput` 合并请求和 session 信号传给 LLM，在发布事件和实际提交前检查会话对象仍存活；生成器暂停在 actions yield 后也要再检查。普通 LLM 与固定回复两条路径都覆盖。取消流后 orchestrator 不再 enqueue/close；mock provider 也遵守 signal。

这些边界阻止 end 返回后的旧 turn 写入；P2 的同步事务同时保护本轮多表提交与内存发布。结束 HTTP 未送达或进程崩溃不在此保证内；客户端本地释放不依赖服务端响应成功。

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
- `listening → thinking`:松开 + 录音 ≥ 800ms,只等待 ASR final / LLM / TTS;不播放本地 thinking 占位音
- `thinking → awaiting`:5 秒 ASR-final 兜底超时,或 final text 为空,或 35s `chatWatchdog` 超时(LLM/路由卡死),或服务端 SSE `error`(含 LLM 卡住 10s / 总上限 30s 超时)
- `thinking → speaking`:收到第一个 speech-delta(`onFirstSpeech`)
- `speaking → awaiting`:TTS session-finished(或 1.5s speech-finish 兜底,两者都 flushPendingActions)
- `awaiting → quiz-speaking → awaiting`:reinforcement 静态 quiz TTS 播放,不经过 `/api/chat` 与 LLM
- 任意 → ending → idle:用户点"结束课堂"

### 4b. PhasedLessonController phase 轴(课程 registry)

```
idle ─startLesson─▶ intro ─[切1]─▶ interactive ─[切2]─▶ reinforcement ─[切3]─▶ done
  ▲                                                                              │
  └────── endLesson(任意 phase 都能立刻退出)──────────────────────────────────────┘
```

- 切1:开场介绍 TTS 播放结束,底层 `LessonController` 回到 `awaiting` 后立刻切到 `interactive`;intro 不等待全部 word cards 都被 `show_card` 介绍。
- 切2:snapshot `allWordsDone === true`(服务端 `allWordsFinished()`:cleared + parked-after-retry 都算完成,2026-07-03 逃生阀)或 `clearedWordCardIds.size === wordCards.length`(旧 snapshot 兼容 fallback)或 `totalAttempts >= 3 × wordCards.length`,且底层回到 `awaiting` —— 即词全清轮 TTS 播完立即切;转场落地前挤入的学生轮不锁 push-to-talk,由 `speechCardAlign` 的 all-cleared 兜底话术接住(见 §4c);进入 reinforcement 前先播 `/api/chat?action=phase-transition` 返回的过渡 TTS,播完再 emit phase-change,避免第一道 quiz 静态 TTS 与过渡语音抢同一个长连 session。sentence cards 只在 reinforcement 使用。
- 切3:reinforcement 所有 quizzes 答完。
- phase 切换由 `PhasedLessonController` 判定,LLM 不输出 phase transition。
- interactive 阶段的主目标由 prompt 中的"当前目标控制"约束:继续当前未通过 word card,否则切到 `teachingHints.newCardIds` 里的第一个未通过 word card。若老师说短句,必须 `show_card` 对应 `sentence_*` 卡;进度计数仍只按 word cards。server 在 SSE/commit 前归一化 `show_card`,把已通过或非当前目标的回跳替换为当前应练习的 word card。
- `LessonController` 仍是唯一 ASR/TTS/SSE 管线;旧 `LessonView` fallback 已删除。

---

## 4c. Agent Guard Pipeline

Guard pipeline 在 `src/lib/agent/guards/` 下,由 `streamUserInput` 在 LLM 流式消费结束后、SSE yield 之前调用。

**R4(2026-07-04)前置短路,不进 guard pipeline**:`streamUserInput` 入口在会话查找后立即判定——`session.currentPhase === 'reinforcement' && !opts.phaseOpening && rawAsrText 非空 && userText 不以 '[quiz:' 或 '(切换到' 开头` 时,直接调 `respondWithoutLLM()` 回固定短语"我们来玩游戏吧!",完全不进 `streamLLM` / guard pipeline,也不写入 `session.memory.messages`(没有对应的助手回复,写入历史只会留一条悬空的用户轮)。用量只记 ASR/TTS(若有 `asrResult`)、不记 LLM 请求。这条判定专门堵"reinforcement 开场后、首个 quiz 前挤入的一次杂散语音"(quiz 组件本身用 `routeToChat:false` 不会触发,但转场窗口一次杂散按键仍可能带 `routeToChat:true`)——此前这类轮会正常走 LLM,生成一版语义重复的开场白(n=42)。

### GuardContext(输入输出 shape)

```ts
interface GuardContext {
  speech: string;          // 当前 AI 语音文本(各 guard 可替换)
  actions: ToolAction[];   // 当前 show_card 动作列表(normalizeActions 后有效)
  stateUpdate: AgentResponse['state_update'];
  memory: LessonMemory;    // read-only 视图 — guard 不得修改 memory
  course: Course;
  asrText?: string;        // 孩子真实说的 raw ASR(仅用于 R2 字面计数);系统轮传 '' 不计
  currentPhase: PhaseName;
  phaseOpening?: boolean;  // 系统开场/转场轮("(课堂开始)"/"(切换到 X 阶段…)");speechCardAlign 豁免改写(2026-07-03)
  forceCardId?: string;    // normalizeActions 选定的权威词卡;由 normalizeActions 写、speechCardAlign 读
  rcMode?: RcMode;         // R-C 推导模式:no-current/in-progress/parked-advance/just-cleared/post-clear-recovery(normalizeActions 写)
  allWordsCleared?: boolean;      // 词队列终态:全部 cleared 或 parked-after-retry(normalizeActions 写)
  rcRejectedCardIds?: string[];   // R6 埋点:本轮被 R-C 拒绝的 show_card
  rcSuppressedCardIds?: string[]; // R6 埋点:all-cleared 终态被静默抑制的 show_card
  speechRewrite?: string;         // R6 埋点:speechCardAlign 改写类型(in-progress-leak/card-align/all-cleared-*/parked-advance-switch)
}
```

`GuardContext.memory` 是 **read-only 视图**。所有 memory 修改仍在 pipeline 之后的 `commitAssistantStreamResult` 里发生。

### Guard 职责与顺序(顺序敏感)

| 顺序 | Guard | 文件 | 职责 |
|------|-------|------|------|
| 1 | `closingGuard` | `closing-guard.ts` | R4/R6:speech 含未学词时替换安全模板;`memory.currentWord` 与 `state_update.current_word` 豁免 |
| 2 | `prematureClosingGuard` | `premature-closing-guard.ts` | R-B:interactive 阶段说"下次再来"等软关闭词时覆盖 speech 并强推下一个 untouched 词卡 |
| 3 | `normalizeActions` | `normalize-actions.ts` | R-C wrapper:调 `normalizeAssistantActions(memory.ts)`,服务端权威选牌,并把选定词卡写入 `ctx.forceCardId`。**R2(2026-07-04)**:`ctx.phaseOpening === true && ctx.currentPhase === 'reinforcement'` 时传 `opts.skipForceShowCard`,跳过"强制注入 forceCardId 的 show_card"这一步(reinforcement 开场白由 quiz 组件接管画面,强制词卡纯属噪音且触发报告端假 critical)。**严格限定 reinforcement**——interactive 的 phase-opening(如首卡强制展示)不受影响,仍强制注入 |
| 4 | `speechCardAlign` | `speech-card-align.ts` | 读 `ctx.forceCardId` / `rcMode` / `allWordsCleared`(2026-07-03 扩展)。改写条件按优先级:① `phaseOpening` 轮直接豁免(开场白合法提及多词,n=51 误伤修复);② all-cleared 终态(interactive)走确定性收尾——过关轮(just-cleared)话术泄漏教句子(sentence 卡英文 / "学一个短句"句式)或**与终态矛盾**(2026-07-05 fruits n=28:"还有几张水果卡片没看")→ 改写为收尾庆祝模板,其后挤入的学生轮 → 固定衔接语(按上轮 assessment 对错选 praise/neutral),绝不回到词教学模板;③ parked-advance 换卡轮(旧卡≠新卡)**无条件**改写为柔性交接模板 `buildParkedSwitchPrompt`("XX我们先放一放,待会再回来试!现在看这张卡:…")——park 是服务端决定,LLM 当轮话术必然还在教旧词,不改写=静默跳卡(原地 retry 的退化情形走通用路径);④ in-progress 模式提到**任何**其它词卡即改写(不再要求"未提当前词",n=31 换词宣告泄漏修复);⑤ legacy:未提强制卡却提到别的词卡 / 卡已切换。改写模板 `buildCardPrompt(card, {tone, reread})` 按上轮对错选"做得好!"或中性"没关系…"开头;**R3(2026-07-04)**:praise 语气且 `!movedToDifferentCard`(同卡重读,`memory.currentCardId === forceCardId`)时 `reread:true` → 用"做得好,老师听到啦!再读一遍:X!"确认语变体,取代"我们看这张卡…"完整介绍模板(避免孩子把重复模板理解成"没被听到",n=38→39 真实案例);真正换新卡(`movedToDifferentCard`)与 neutral 分支不受影响 |

**为什么顺序敏感**:guard 4(`speechCardAlign`)读取 guard 3(`normalizeActions`)写入的 `ctx.forceCardId`(显式字段,不再倒扫 `ctx.actions` 自行再推导词卡)。如果顺序颠倒,speechCardAlign 读到的 `forceCardId` 为空,直接放行不做对齐。2026-07-03 起同一约束覆盖 `rcMode` / `allWordsCleared`(同为 normalizeActions 写、speechCardAlign 读)。

**R6 观测(2026-07-03)**:normalizeActions 写入的 `rcRejectedCardIds` / `rcSuppressedCardIds` 与 speechCardAlign 写入的 `speechRewrite` 在 `commitTurn`(session.ts)持久化为 `interaction_logs.model_calls.guards`,供课后报告聚合守卫活动 —— 修复本次 eval `speechCardMismatchCount=0` 只看改写后话术的盲区(报告端聚合语义修复另立任务 `07-03-report-semantics-rc-persist`)。

### runPipeline 失败策略

guard 抛异常时:`console.error('[guard]', guard.name, 'failed:', err)`,并用抛出前的 ctx 继续走下一个 guard。这是 fail-safe 策略:单个 guard 的 bug 不会让整个课堂 SSE 冻住。

### 与 memory.ts 的边界

`normalizeAssistantActions` 保留在 `memory.ts`(与 `applyAttemptAssessment` 强耦合)。`guards/normalize-actions.ts` 是薄 wrapper,只把签名适配成 GuardFn。后续若解耦 memory 状态,可把 normalize 搬进 guards/;当前不动。

---

## 5. 协议踩坑摘要(详情指向其它文档)

公开版协议摘要:`docs/DOUBAO Protocol/{asr,tts}.md`。官方完整文档请看火山引擎 / 豆包语音文档。日常协作关键点:

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
- **reinforcement 阶段丢弃词卡上下文**:`cardId` 上下文只在 interactive 由 `show_card` 更新;跟读(`startListening({routeToChat:false})`)读的是整句、不是单张词卡,若沿用 interactive 末尾冻结的词卡(如 `magic` 课的 `princess`),会把那一个词当成唯一热词、反而把句子识别带偏。故 `startListening` 在 `routeToChat===false` 时清掉 `currentAsrCardId`,让热词 fallback 到全课词表(覆盖句子里的各目标词)。(2026-06-21 修)
- **repeat-after-me 句子候选注入 + 降难度提示/判分(2026-07-03 / 2026-07-05)**:sports 真人课(session `1b096ae7`)quiz 轮 "I play tennis." 被识别成 "I'll play Thomas."——热词从不含句子是缺口。现在 `LegacyClassroom.startQuizListening` 把当前 quiz 的 `targetText`(在前)+ 同组其余 repeat-after-me 句(次级候选)经 `startListening({routeToChat:false, asrSentenceTexts})` → `new AsrClient(context)` 的课堂内快照 → WS query `sentenceText`(每句一个 param,整值保留、不做逗号切分)传给 proxy;`buildHotWords` 把句子候选放在最前,后接原有整课词表 fallback(2026-06-21 行为不变),word 卡轮完全零回归(不带 `sentenceTexts` 时热词构造逐字节不变)。**注入格式采用"整句 + 内容词"双注入**(R4 决策):本地协议摘要没有条目长度/格式限制与 per-entry weight,故整句(去尾部标点)作短语级候选,同时拆 ≥3 字母的内容词。2026-07-05 fruits 真人课暴露 q7 `I see the grape.` 被 `See the.` 过宽判 correct;现 repeat-after-me 初次静态 TTS 改为"完整句 → 慢速拆分 → 完整句",降低孩子跟读难度,同时旧模式 `legacy-teaching` 判分要求目标词/核心内容词出现并覆盖足够句子内容,`See the.` 这类缺目标词片段不再 correct。直连探针(TTS 念 "I play tennis." → ASR)实证:整句(含空格)hotword 条目豆包不报协议错、识别命中;儿童真实发音效果继续靠真人课验证。
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
| 流式 JSON 提取 | `SpeechExtractor` 状态机解析单个 LLM 响应;`finalize()` 在整段 JSON 可解析时优先用解析出的 `speech` | 节省一次 LLM 调用;约 100 行。skip 助手只扫当前 chunk,值跨 SSE chunk 边界会丢流式 speech,故 finalize 以完整 buffer 为权威。`feed()` 只累积 buffer 与 `this.speech`(供 `JSON.parse` 失败时兜底),不再产出无人消费的流式 speech delta(原 `FeedResult`/`speechDelta`/`complete` 已删)。`finalize()` 与浏览器 `parseLessonEvent` 共用 `lesson-protocol.ts` 的 `toolActionSchema` 和 `stateUpdateSchema`：动作逐项校验，只保留合法 show_card；state_update 逐字段保留字符串 current_word 和完整合法的 attempt_assessment，坏字段与非对象状态丢弃，不牺牲合法同级字段。未知键按客户端既有 z.object 规则剥离，不放宽客户端校验。存在丢弃时只记一条 `[extractor] dropped malformed fields` warn，字段为固定字段名及丢弃数量，不含模型内容；非数组 actions 视为空。2026-11-15 真实 LLM 冒烟里模型返回了不带 `params` 的动作,`normalizeAssistantActions` 读 `params.card_id` 抛异常,被 guard 兜住后冒烟只看到这一轮没有切卡；实际浏览器还会拒绝含坏动作的整条 actions 事件并使该轮报错，含坏 state_update 也会丢掉同事件内服务端强制的 show_card。入口校验后 guards 仍按既有规则决定切卡 |
| TTS 音色 | 固定 `seed-tts-2.0-standard` + Tina老师2.0 + 缓存 | 稳定性优先,避免 expressive 抽卡;开场白 / 提示语 100% 一致 |
| 不做客户端切句 | LLM token 直接透传 TTS | 豆包文档建议"更自然、情绪更饱满" |
| 回声抑制 | 浏览器 getUserMedia 三标志位 | 简单,无服务端 DSP |
| ASR 按轮建连 / TTS 长连 | 不同生命周期 | ASR 每段对话需新 session;TTS 长连节省 3.7s 握手 |
| AudioContext 同一课堂内复用 | 不每轮 close+new；不同课堂实例隔离 | 浏览器配额限制,3-5 轮反复重建后 mic 失活 |
| mic 在 startLesson prewarm | 用户按住瞬间能录 | 否则 getUserMedia + worklet 启动 ~300ms,前几个字丢 |
| ASR proxy 握手期 PCM buffer | 不丢前 1-3 秒录音 | 详见踩坑 |
| TTS proxy 握手期 control buffer | 不丢开场白 / 静态 quiz 文本 | 浏览器 WS 先 open,豆包 ConnectionStarted 慢于本地 client 控制帧 |
| worklet flush 残余 | 不丢尾字 | 之前未满 200ms 的 buffer 在 disconnect 时被丢 |
| 短按 < 800ms 前端拦截 | 不进 thinking 不空等;若 keyup 早于 ASR/recorder startup settle,先记录 stoppedAt,等 startup settle 后再 close,避免撕掉 connecting WS 产生假 upstream error | 豆包对 < 1.5s 录音置信度不够,大概率 timeout;真实短按是本地 UX 事件,不应被记录成 provider 故障 |
| 5s 不 9s 的 ASR final 兜底 | 用户更快感知失败 | 9s 太长,影响"再说一次"的连续性 |
| LLM 首 token 对冲 + 卡住判定 + 双层上限(server 4s 对冲 / 10s 卡住 / 30s 总上限,client 35s) | 2026-10-25 DeepSeek-V3.2 实测:首 token 中位 ~0.8s,但约 7% 轮次排队 7-9s;生成 15-24 tok/s,偶发 ~7 tok/s。服务端要等整轮回答出完才让老师开口,旧的 20s 一刀切会把「排队 + 慢生成」的轮次整轮作废(基线 3 遍 smoke 中 1 遍失败)。4s 无首 token 并行发同样的请求、取先出字者并取消另一个(约 1 成轮次多花一份输入 token);出字后按 chunk 间隔判卡住,不再按总时长误杀仍在出字的轮;30s 总上限兜底,client 35s 必须大于它 | 上游排队或中途卡死会让课堂停在 thinking;server 超时把卡死转成 SSE error,client watchdog 兜住整路由无响应的情况 |
| thinking 占位音 filler | 已停用;`LessonController` 不再在 thinking 阶段本地 enqueue 预制音频 | 实测会在 ASR/LLM/TTS 正常运行时插入“让老师看看哦”,被误解成没听到孩子发音;真实首音频延迟仍需换更快 LLM / prompt 首句策略 / Hybrid 预渲染解决 |
| 不打断(speaking 时空格忽略) | 简化优先 | 实测打断后 inflight PCM 难完全清干净;后续再加 |
| ~~字幕领先音频~~ → **R1 已修复** | actions(`show_card`)缓冲到 `tts.session-finished` 再 emit | 实测 bd78d967 报告确认 UX 杀手;`pendingActions` in `LessonController` 解决;TTS error 路径也释放 |
| 词汇正确性判定 | **R2:raw ASR 字面 verify**:raw ASR 命中当前卡的英文或课程显式 `asrAliases` 才计 hit;比较前会折叠大小写、标点、空格、连字符等分隔符。**R2 只看孩子真实说的 `rawAsrText`,与喂给 LLM 的 `userText` 分离**:`start` / `phase-transition` / "请老师再说" 这些系统轮的指令文本(可能含目标词)传 `rawAsrText=''`,绝不计为孩子命中 | LLM 曾把 "Kite." 判成 cat correct;字面 verify 截断过度容错;`ice cream` / `ice-cream` / `icecream` 这类 compound word 分隔符差异不应阻断进度;`pie`/`派` 这类中英同音词必须由课程显式 alias 放宽,不能默认把所有中文释义当成英文通过;"请老师再说"曾因把含当前词的指令文本当成孩子 ASR 而误推卡(2026-06-21 修) |
| ~~show_card normalize (R3 放宽)~~ → **R5 严格白名单** | word card 必须 ∈ `{currentCard, nextCard}`;currentCard 若已 cleared 也拒绝;rejected 时 fallback push `activeWordCardId` | R3 过宽导致 LLM 在 cat 已通过后仍 show_card 回 cat(2026-05-22 实测 70 轮里 7 次);严格白名单 + nextCard 计算确保只能切到目标顺序的下一张 |
| closing 总结约束 | **R4 始终注入** + **R6 currentWord 白名单**:扫 speech 含未学词时替换为安全模板,但 `memory.currentWord` 与 `state_update.current_word` 不算未学词 | R4 原意防 LLM 结课时枚举全部 12 词;R6 修正:教 cat 时说"cat"不算 unlearned,否则每轮都触发整句替换 |
| 词卡 cleared 触发 + 切卡 | **R-C(2026-05-23,取代 R-A/R5/R7):服务端权威 — `cardCorrectCount[cardId]` 计 raw ASR 字面命中 canonical target token 的次数,累计 ≥ 2 时 mark `cleared`(锁,不再计数)。** target 集合来自 `WordCard.english` + `WordCard.asrAliases`;canonical token 会 lower-case,保留 ASCII 字母/数字和 CJK 字符,删除分隔符,所以 `ice cream` 可命中 `icecream`,`派` 可作为 `pie` 的显式别名命中。normalize 模式机(2026-07-03 扩展,`RcMode`):(1) no-current → 选第一个候选词;(2) in-progress(当前卡未 cleared)→ 强制 `show_card → currentCard`,拒绝任何其它 word card 切换;(2b) parked-advance:当前卡被逃生阀 park 出局(同卡连续失败 ≥ `PARK_STREAK_THRESHOLD`=5,或 retry 轮再失败)→ 推进下一候选词;(3) just-cleared(本轮刚 cleared)→ 强制推进 `show_card → nextCard`,这就是"OK 你说对了 → 看下一个"那一刻;(4) post-clear-recovery(此前轮已 cleared 的恢复路径)。候选词分两层:先找未 cleared 且未 parked 的 fresh 词;fresh 队列耗尽后 parked 词各得一轮回头 retry(`parkRetryCardIds` 标记,进入 retry 时 streak 清零给新尝试窗口);两层都空 → **all-cleared 终态**(parked-after-retry 视为完成):`forceCardId` 停在最后一张卡不跳变,越界 show_card 静默 suppress(计数不告警),`progress_snapshot.allWordsDone=true` 驱动 client 切 reinforcement,话术由 speechCardAlign 确定性收尾(§4c)。sentence card 只允许 `sentence_<activeCard>`。LLM `attempt_assessment.result` 不再决定 cleared,仅在无 R2 命中时驱动 streak / needs_review / park。 | LLM 主观判定 close/correct 不稳定:实测同一句 "Cat." 一次判 close 一次判 correct,导致一会儿不推一会儿乱推;且 R7 强推 + LLM speech 滞后产生卡嘴错位,R-A 又造成 LLM 当回合 speech 跟卡面对不齐。R-C 把"是否推卡"完全交给服务器按字面计数判定,LLM 只负责语言反馈;同时 2 次门槛比 1 次更接近真实学习强度(小朋友说对一次可能是巧合,2 次基本能复现) |
| ASR/TTS usage | ASR 记请求数 + 识别文本长度,TTS 记请求数 + speech 字符数 | 当前没有 provider-native ASR token/TTS usage,先保证课后报告可观测 |
| 画布比例 | 1:1 正方形,图片区 75%(4:3),文字区 25% | 幼儿教学:图片为主角(75%),文字为锚点(25%);图片生成统一 4:3 横版(1024×768)填满图片区 |
| 三阶段 phase 切换 | 规则驱动,`PhasedLessonController` 判定 | LLM 自主切换不可预测;规则可测、可回滚 |
| reinforcement 静态 TTS | quiz prompt / retry hint 由 `LessonController.speakStatic` 走既有长连 TTS,不调 LLM;repeat-after-me 初次提示由旧模式 `legacy-teaching` 把 `targetText` 扩展成"完整句 → 慢速拆分 → 完整句"后播放,显示文本与 ASR 候选仍保留原始 `targetText` | 强化阶段提示语是课程数据里的确定文本,复用音频链路即可,避免额外 LLM 延迟与不可预测文案;句子跟读只播一次对儿童偏难,但无需改 TTS 协议即可用文本节奏降难度 |
| 新标准唯一化 | 课程通过 registry(`index.ts` 的 `allCourses`)统一暴露,数量以该文件为准;旧 `transportation` / `timeNumbers` 数据与 `LessonView` fallback 已退役 | 避免长期维护两套课程路径 |
| LessonController 定位 | 继续复用 ASR/TTS/SSE 管线,不作为独立 lesson UI 入口 | 降低重写音频链路风险 |

---

## 7. 性能基线

现役延迟与成本数字以 [`docs/voice-benchmarks.md`](voice-benchmarks.md) 为准。原 MiMo 时代基线表已移到 [`docs/archive/architecture-history.md`](archive/architecture-history.md),只作回溯。

---

## 8. 已知不足(指向 TODO.md 详情)

> 本节针对原有按住说话课堂;Realtime 课堂的待验证项见 `docs/TODO.md`。

- **课程 Session resume**:活动 session 仍是进程内 `InMemorySessionStore`,server 重启 / 刷新 / 断网后客户端旧 sessionId 依然失效,`/api/chat?action=message` 收 404 时只提示"课程已过期,回首页重新进入"(跨重启的活动 session 接管未做)。**但课堂进度自 2026-07-20 起已持久化并支持续课**:每轮 upsert `course_progress` 断点,`action=start` 从有效断点 `createSessionFromSnapshot` 恢复(`X-Resume-Info`),重进课程即回到上次阶段,见 §3.1b。
- **LLM first-token 延迟**:首音频延迟主要瓶颈,前端无法优化(MiMo 时代实测 4 秒;现 SiliconFlow DeepSeek-V4-Flash,短 prompt 探针首 token 中位 ~2.7s,真实课堂整步中位 ~5.4s、尾部 ~14s)
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
   `rc_correct` / `rc_cleared` 缺列或 NULL(2026-07-04 前的数据)时,cleared 回退
   `correct >= 2` 旧语义,并以 `clearRateSource` + `clear_rate_source_legacy` 信号显式降级,
   绝不无声混用两本账(2026-07-03 clearRate=0 假报警的教训)。
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

Realtime 的 `stuckCardRuns` / `maxStuckRunLength`、`speechCardMismatches` / `speechCardMismatchCount`、`emptyActionTurns` 都为 `null`：它们依赖原有课堂的 `actions`，不能将其 0 或空清单当作没有问题。`coverage_gap`、`clear_rate_low`、`clear_rate_source_legacy`、`needs_review` 和基于 actions 的 `teaching_loop_stuck` 信号只用于原有课堂；Realtime 改用 `long_target_run`（warn，最长连续目标段不少于 6 次，value 为最长段长度）和 `not_attempts`（info，有「不算」时 value 为条数）。

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

## 10. 文件演进历史

原粗粒度文件演进历史已移到 [`docs/archive/architecture-history.md`](archive/architecture-history.md)。之后的演进看 `git log --oneline -- <path>`。

---

## 11. 开发工具链 — 课后报告生成器

实测课后用 `/lesson-report` slash command 生成内部诊断报告,驱动迭代决策。

调用链:

    /lesson-report [session-id?]
      ↓ 跑 pnpm tsx scripts/lesson-report-data.ts [session-id?]
      ↓ 拿 JSON(基础聚合 + anomaly flags + prompt input breakdown + eval scorecard + 全部 interactions)
      ↓ 按本地诊断模板生成 markdown
      ↓ Write 到 docs/lesson-reports/YYYY-MM-DD-<sid8>.md(已 gitignore)

**职责切分**:
- **`scripts/lesson-report-data.ts`**(数据层,有单测):基础聚合 + 课程目标词 + anomaly flags(`highAvgInput` / `asrUsageNotTracked` / `ttsUsageNotTracked` / `tokensCorrupted`) + prompt input breakdown 聚合(`trackedTurns`、平均字符、最大 bucket、估算 token share) + Eval v1 scorecard。Eval v1 输出 `sessionHealth`、`costContext`、`teachingLoop`、`agentBehavior`、`nextIterationSignals`,用于量化 session 是否健康、上下文成本是否偏高、目标词覆盖/清除情况、卡住/错位/提前收尾等 Agent 行为风险,以及下一步应该优先做 prompt slimming、教学循环修复、provider tracking 还是数据完整性修复。Realtime 课另外输出 `childUtterances`（完成且结果可解析的评估回应数，含「不算」，失败重试的失败行不重复计）、`notAttempts`（有效评估序号 `n`、保存时间 `ts`、绑定屏幕目标 `targetId`、模型自述 `heard`；旧无参数工具记录的目标为 `null`）、`targetRuns`（按已保存作答的 `assessment.target_id` 连续分段，含目标、起止作答轮次、长度、correct 数和段内是否过关；课程卡看 mastered，练习题看正确作答；换目标或缺目标时断段，「不算」不进作答记录）。`childUtterances` 不含完全失败或未留存评估的语音；不能用作答数代替它。2026-11-15 起新增 `turnQuality`（原有课堂为 null）：`englishLeading` 为首个中文字前至少 4 个英文单词的老师发言数，`englishOnly` 为无中文的发言数，均排除告别和评估行；`repeatedShowCard` 检出无文字回应隔开的重复同卡出卡，旧记录无 id 或含未知 id 时为 null；`praiseMismatch`／`correctionMismatch` 对照已保存作答的判定与第一条完整回话，去掉句首英文后分别数错误赞对、正确却纠错，附 `praiseMismatchTurns`／`correctionMismatchTurns` 作答轮次；`stoppingTalk` 数说了先停、待会儿、等会儿或下次我们却没出卡的发言，告别不计；`firstCues` 按每张词卡首次出卡后第一条有文字发言是否含目标英文记录 `{cardId, modelled}`，对照新词使用。重复话术比较前按同一 4 词规则去掉句首英文，中文主体仍逐字比较，纯英文保持原样，不做模糊匹配。新增 Realtime 信号 english_leading（warn，大于 0）、repeated_show_card（info，大于 0）、praise_mismatch（warn，不少于 2）。原有课堂既有字段保持原样。pure 函数 `buildReport(db, sessionId, courseLoader)`,接受依赖注入。
- **报告撰写层**:基于 raw `interactions` 判断 ASR 误识 / 话术循环卡死;项目只跟踪数据脚本,本地 agent prompt 不进入 public repo。

**报告范围**:只产出**工程信号**(ASR 误识 / 话术循环 / token / 埋点),教学策略类观察只列不评判。

---

## 12. 前端架构（2026-10 G 外壳与课程、课堂、学习记录）

课程、课堂、学习记录、设置与首次引导使用 G 组件与水彩麻吉:

```
/                          课程列表与详情 · CourseHome
/lesson/[id]               课堂  · IntroFrame / LessonMandalaV2 / ReinforcementFlow
/lesson/[id]/done          下课庆祝  · DoneCelebrateFrame
/records                   学习记录  · RecordsPage(当前孩子)
/settings                  设置      · AI 老师与语音 / 麦克风 / 孩子 / 关于
/onboarding                首次引导  · 独立全窗口,不挂主工具栏
```

### 关键模块

| 文件 | 职责 |
|------|------|
| `src/components/shell/*` / `src/app/(main)/layout.tsx` | 常驻主导航与孩子切换；内容 template 单独动画 |
| `src/components/ui/{Button,Tag,ProgressBar,Banner,Skeleton,EmptyState,PushToTalkPill,ErrorBoundary}.tsx` | G 基础组件、六状态按住说话条和根错误页 |
| `src/components/home/{CourseHome,LearnerPicker,HomeWordCard}.tsx` | 分组课程列表、详情图片墙、可复用单词卡、孩子选择和读取状态 |
| `src/components/settings/{VoiceSettingsPanel,useSettingsDraft,MicSection,LearnersSection,AboutSection}` | 设置四分区、凭据草稿、连接测试和保存后的退出码 75 |
| `src/components/onboarding/OnboardingScreen.tsx` / `src/lib/onboarding-entry.ts` | 三步首次引导和首页进入条件 |
| `src/components/lesson/{IntroFrame,LessonMandalaV2,QuizPickWordFrame,ReinforceFrame,ReinforcementFlow,DoneCelebrateFrame}.tsx` | G 课堂四段与共享的下课 view 层，保留控制器与 phase 状态机 |
| `src/components/lesson/{LessonToolbar,LessonCard,SubtitleLog}.tsx` | 独立课堂工具栏、共用大卡片、视图层累积字幕 |
| `src/components/lesson/useStaticPromptSpeech.ts` | 强化 quiz 静态 TTS 播放与解锁 gate |
| `src/components/lesson/battle/{battle-state,BattleStage,BattleSummary,monsters,sfx}` / `src/lib/word-battle-pref.ts` | 单词大战(Realtime 学词阶段的战斗场景),见下文「单词大战」 |
| `src/components/records/{RecordsPage,CourseWordsSheet,Heatmap,useLearningRecords,WordMastery}.tsx` | 当前孩子学习记录、居中课程单词墙浮层、正方形热力图、并行读取与请求隔离；下课页逐词表仍用 WordMastery |
| `src/components/lesson/DoneLesson.tsx` | 课堂内和独立下课路由共用的数据加载与导航 |
| `src/app/not-found.tsx` | 未知地址:麻吉、`EmptyState`、「找不到这个页面」、「回到课程」 |
| `src/lib/progress.ts` / `stats.ts` | 纯聚合(SQL 全部下沉到 `db/queries.ts`,这里只对返回行做 JS 整形) |
| `src/app/api/{progress,sessions,stats}/route.ts` | 三个只读聚合 API;请求开始先 `ensureDatabaseInitialized()` 支持 fresh DB |
| `scripts/smoke-pages.ts` | `pnpm run smoke` 起 dev server + 探 4 页面 + 4 API |
| `scripts/lesson-smoke.ts` | `pnpm smoke:lesson` 先用 Chrome 验证 push-to-talk 按钮 / Space 持按保持 recording,再用 `/api/chat` 文本脚本验证 teacher agent 状态机与 speech/show_card 一致性 |

### 单词大战(2026-11-10)

先学后打:Realtime 课堂的学词阶段照常用大词卡教;一次课进入收尾(约 10 分钟)时,原有的"回忆今天的词"变成一场战斗。麻吉是小魔法师,捣蛋鬼抢走了今天学的词卡,孩子用英语说出来就是念对咒语,把卡打回来。只是表现层:不判分、不写库、不调接口,教学和进度仍由 §18 的教学层负责。原有课堂(按住说话)不出现;整门课学完后的练习题阶段也不出现(留给以后的 Boss 关卡)。

- 开关:`src/lib/word-battle-pref.ts`,浏览器 `localStorage` 的 `eduagent.wordBattle`(没有值按开),设置 → Realtime 页的「单词大战」开关直接写它,不走保存重启流程。`PhasedLessonView` 在开课时读一次:Realtime 且开关为开,才给 `startLesson` 传 `game: true`。关着时课堂渲染与之前一致。
- 什么时候打:服务端在收尾提示后第一次成功提交 `show_card` 的回执之后发一次 `sitting-wrap-up`(§18),`PhasedLessonView` 收到后把 `fighting` 置真,`LessonMandalaV2` 从大词卡切到 `BattleStage`,并在这一刻取快照:此刻的收藏(最新 `progress.collectedCardIds`)、今天练过的词(本次课此前有语音作答的词卡,被怪兽抢走)、战斗作答的起点。收尾点只记下待开战,此后放卡之前仍是普通教学,作答不算战斗也不亮出战斗卡英文;没有放卡就结束(含到达告别点)则没有战斗。
- 规则在纯函数 `battle-state.ts`(随机数注入,单测覆盖):只处理语音作答(`via=voice` 且无 `quizId`);`mastered`(不靠提示自己说出)是大招掉 2 滴血,`correct` 掉 1 滴,`close` 擦边不掉血,其余无反应。孩子原本拥有、今天又练过的卡在开战时离开收藏栏,任何一次打中就回来;还没拥有的卡要自己想起来(`mastered`)才进收藏;句子卡不进。血量按第 1、2、3 只 3、4、5(之后都是 5),打完被收服进队伍,下一只出场;5 种怪兽从随机起点轮换,每只十分之一概率是金色;同一 `revision` 只处理一次。没有输、没有倒计时。
- 画面 `BattleStage.tsx` + `battle.css`:整屏背景,左边麻吉、右边当前怪兽,队友站在麻吉旁,咒语卡浮在上方,右上角是怪兽血量,底部是收藏栏。咒语卡显示图和中文,**英文和拆音藏起来**(显示「? ? ?」,英文仍在 DOM 里供测试读取),这张卡在本场战斗里被打中后才亮出来;沿用 `data-picture-card-*` 和 `.p2-word`/`.p2-sent`,「老师再讲一遍」保留。开场演怪兽蹦进来、今天的卡飞进它的袋子;答对时词卡的图变成泡泡从魔杖飞向怪兽,赢回的卡再飞进收藏栏。连续多条作答都会改状态,只演最新一条。`presented` 上报仍在 `LessonMandalaV2` 原处。reduced motion 下不演位移类动画。
- 字幕栏:只在战斗场景下收起(仍挂载、照常累积),模式行右侧的「字幕」按钮展开;学词阶段照常显示。
- 音效 `sfx.ts`:7 个短音效(`public/sounds/battle/`,`scripts/battle-sfx.mjs` 用 ElevenLabs 生成)由页面内 Web Audio 播放。实测(Electron 45,蓝牙音箱加无线麦克风)页面自己播放的声音被回声消除去掉,不会被常开麦克风当成孩子说话;App 之外播放的声音会。课堂进行中不要对麦克风开第二路采集(实测会让提供方持续判定有人说话)。
- 结束:服务端先等在途评估(最多 4000 ms)再发 `sitting-ended`;战斗场景继续接收结果并保留 `BATTLE_END_DELAY_MS`(1800 ms),让最后一击演完后才取最终快照、切到一次课结束页(`sittingEnded`),在原有文案旁显示 `BattleSummary`(本课收藏册、今天收服的怪兽、没打完的那只「跑掉了」);跑掉的怪兽种类用最终快照记在 `localStorage`,下次课的战斗第一只就是它;没有开战则立即切普通结束页。整门课学完的下课页在标题下显示一条收藏册。战斗状态只在浏览器内存里,不存库;收藏册来自服务端(§18)。
- 素材 `public/images/battle/`:背景、全身麻吉、5 种怪兽各 3 个姿势(待机、挨打、收服后),透明 WebP。

### Design tokens

- 界面使用 G 的 primary `#6842FF`、success `#2DD4BF`、accent `#FF9F2E`、text、glass/surface、4/8/12/16/24/32/48 间距、control/panel/card（10/16/24px）圆角与 rim/lift 阴影。具体值在 `tailwind.config.ts` 与 `globals.css`。
- 字体:中文和界面标题使用系统字体（`--font-zh`），英文词使用 `next/font/local` 加载的 Fredoka（`--font-en`），Key 字段使用系统等宽（`--font-mono`）。源码里只保留 Fredoka 字体文件。
- 课程数据里的 `tone`（peach / butter / mint / sky / lilac）只标记课程，不生成 Tailwind 颜色类。

### 本地孩子档案(2026-10-24)

档案只区分学习进度，无登录或角色。首页无档案时引导去设置页新建，单个档案自动选中，多个可切换；当前 id 存 localStorage，读写失败回到选择流程。设置页以独立 `LearnersSection` 管理新建、改名、删除；删除必须输入孩子名字二次确认。学习记录页直接打开，只显示当前孩子统计，不再承担设置功能。

`/api/learners` 提供 GET 列表、POST `{name}`、PATCH `{id,name}`、DELETE `{id}`；写请求复用设置接口的回环 Origin 校验。删除在单事务内先删 interaction / word performance，再删断点、课次和档案；被删孩子的在途会话不能再提交。

数据模型 v5：`learners(id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, created_at TEXT NOT NULL)`；`lesson_logs.learner_id` 关联孩子，`interaction_logs` / `word_performance` 继续经 `lesson_id` 关联，不重复保存归属；`course_progress` 重建为 `(learner_id, course_id)` 复合主键。旧库有记录时创建「宝贝」并迁移课次及原断点，空库不创建默认档案。迁移沿用事务和 PRAGMA 检查，丢失 migration marker 后重跑仍保留已有归属。

`/api/progress`、`/api/stats`、`/api/sessions` 必填 query `learnerId`，缺失返回 400；所有聚合查询和断点读写均按孩子过滤。`lesson-smoke.ts` 自建测试孩子，不清理用户的课程断点；课次报告携带 `learnerId`。

### 数据流

```
fetch /api/courses    → 首页 CourseHome 分组列表与 6×2 单词图片墙(返回 registry `allCourses` 全部课程,数量见 index.ts)
fetch /api/progress?learnerId   → CourseHome / RecordsPage / DoneLesson(首页与下课已会按 masteryStars ≥ 2 计算，列表进度保持断点比例)
fetch /api/sessions?learnerId   → RecordsPage 最近课次与下课页本课时长(记录页和下课页请求 limit=50，接口默认仍为 10)
fetch /api/stats?learnerId      → RecordsPage 总时长/课次、lastDays 91 天热力图、last7Days 最近七天分钟
voice WS / SSE        → 上课页(PhasedLessonController 包装 LessonController)
```

`/api/progress` / `/api/sessions` / `/api/stats` 是只读业务接口,但会在查询前调用 `ensureDatabaseInitialized()` 跑 SQLite migrations。这样 fresh checkout 或临时 `DATABASE_PATH` 不需要先跑一节课或命中 `/api/chat`。当前 migrations:v5 加本地孩子归属与复合断点主键(见上文);v4 加断点表;v1 创建 `lesson_logs` / `interaction_logs` / `word_performance`;v2(2026-07-04)给 `word_performance` 增 `rc_correct` / `rc_cleared`(R-C 权威账本,ALTER 前查 PRAGMA 幂等);v3(2026-07-04)给 `lesson_logs` 增 `ended_gracefully INTEGER DEFAULT 0`(同一 ALTER-前-查-PRAGMA 幂等约定),只由 `finishLessonLog` 置 1,`touchLessonLog` 不碰它。已有本地 DB 若缺少 marker,会幂等补写而不删除课堂数据。

**课堂结算是增量的**:`lesson_logs.end_time` 现在由 `touchLessonLog()` 在**每一轮提交时**写(`commitTurn` 的消息轮 + `recordQuizAnswer` 的 quiz 轮),而不是只靠优雅结课的 `finishLessonLog()`(`action:'end'`)。这样关 tab / 刷新 / 崩溃 / 断网都不会让 `end_time` 永久 NULL —— 否则 `stats.durationMs` 会把整节课时长算成 0。**R1(2026-07-04)**:`touchLessonLog()` 现在同时传 `tokenUsage` 参数、每轮把 `session.tokenUsage` 序列化落库——此前 `token_usage` 只有 `finishLessonLog()` 写,非优雅结束的课永远是 `{}`(报告假报 0 req/asr/tts "not tracked")。但这也意味着 `token_usage` 非空**不再能**当"是否优雅结束"的判据(现在每轮都非空);新增的 `ended_gracefully` 列专门只由 `finishLessonLog()` 置 1,`lesson-report-data.ts` 的 `sessionHealth.endedGracefully` 读这一列。`finishLessonLog()` 保留为优雅结课的最终 flush(`token_usage` + `ended_gracefully=1`)。`end_time IS NULL` 不被任何地方当"进行中"标志,所以课中写它是安全的。

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

### UI 重构 P1 基础层（2026-10-25）

P0 临时 ShellSpike、shell-spike 路由与 native 材质开关已由正式 CSS 外壳替代。`src/app/(main)/layout.tsx` 常驻 Toolbar（52px，红绿灯 x16/y19）、SegmentedControl、LearnerSwitcher，路由包含首页、`/records` 与设置，旧 `/journal`、`/parents` 已删除。切 tab 只由组内 template 对内容做 150ms 淡入和 4px 位移，课堂及下课独立全窗口。首页由 P3 替换为列表/详情，记录由 P4 合并重做，设置暂留原表单；首页原右上浮层由工具栏替代；现有麦克风首次引导移至独立 `/microphone` 路由，不挂主工具栏；完整三步引导留 P5。

G 设计令牌与原 CC 令牌共存；中文与界面标题使用系统字体，英文词汇使用已打包 Fredoka，旧字体文件留待 P6 清理。新组件使用 lucide-react 线性图标。UI primitives 包括 Button、Tag、ProgressBar、Banner、Skeleton、EmptyState、六状态 PushToTalkPill。全局限制拖选、图片拖动、回弹、网页右键菜单，输入和说明可复制；输入右键保留原生编辑菜单，键盘焦点紫色环，降低透明度时工具栏和玻璃面板使用不透明浅色底。

孩子选择仍存 localStorage；同页切换通过 `eduagent:learner-change` 通知首页/记录/工具栏更新，档案写入成功通过 `eduagent:profiles-change` 更新工具栏。原生菜单支持 ⌘, 与 ⌘1/2/3、孩子切换、新建档案、日志目录、全屏和标准编辑/窗口操作。About 面板由 `app.setAboutPanelOptions` 设置名称/版本/介绍，macOS 图标来自 bundle。

窗口 normal bounds 和全屏状态存 userData/window-state.json，200ms 合并 move/resize/fullscreen 写入，close 同步原子替换；启动验证数字、最小尺寸和显示器可见性，损坏或离屏回到默认居中。未改变 origin、权限申请、崩溃恢复和语音/agent/chat 契约。

课堂在 P2 使用自身 52px `LessonToolbar`，不显示主 tab；独立下课路由由 `lesson/[id]/done/layout.tsx` 暂留 P1 原生拖动留位，内容留给 P4。


### UI 重构 P2 课堂视图（2026-10-25）

`PhasedLessonView` 使用独立 `LessonToolbar`：下课按钮和 Esc 回首页，课程名与阶段分段进度居中，右侧显示本课孩子头像。开场进度为预告；逐词进度按当前 cleared word 数显示；巩固由 `ReinforcementFlow.onQuizChange` 传实际 quiz 下标和课程题数。原生拖动区仅覆盖工具栏，控件 no-drag。

`IntroFrame` 为全宽麻吉水彩头像、当前老师字幕气泡和 6×2 图片墙；开始后的卡片点击沿用 `requestIntroCard` 和 introBusy 锁。逐词 `LessonMandalaV2` 与句子 `ReinforceFrame` 共用 `LessonCard`：左侧方图以容器高度和最小文字宽度计算尺寸，Fredoka 单词随容器缩放且长词降档（原型 6/8 字符档，另为现有长词组补 11/14 字符档），显示中文和多段 drillParts；逐词保留 awaiting 才能使用的老师重讲。选词用 2×2 图左字右卡，答对薄荷勾，答错轻微晃动。换卡旧图淡出、新图右侧滑入 250ms，reduced-motion 关闭位移。大卡保留 data-picture-card-size=hero 和 data-picture-card-state，供真实持按 smoke 定位。

右栏 `SubtitleLog` 在逐词及巩固之间常驻，订阅现有 subtitle/subtitle-clear/asr-final，视图层最多累积 50 条。老师白底左对齐，孩子浅紫右对齐；孩子标签根据本课 learnerId 读取档案姓名，读取失败回退「你」；partial 替换同轮识别文本，asr-final 或 clear 结束识别中样式，不把字幕写入控制器或持久数据。开场直接订阅老师当前字幕，不显示右栏。

`PushToTalkPill` 由 LessonStateName 映射六状态，idle/greeting 为 preparing、speaking/quiz-speaking 为 speaking，其余同名。只在 awaiting 开始，listening 保留释放语义；句子仍等待静态提示播完后启用，并沿用 routeToChat:false 与候选句。持按 Space 共用 useSpacebar，pointer capture 不因移出而结束，blur 清除按键锁并释放一次。可访问名称固定为「按住空格说话」，可见文案随状态变化。recorder 未暴露实时音量，声波采用固定动画，不改语音链路。

课堂错误在工具栏下显示 Banner，配置类保留去设置，其他沿用 4 秒消失；transitionRetry 在舞台中显示 EmptyState 和用户触发的再试一次，字幕栏保留。断点 initialCardId/initialClearedCardIds/passedQuizIds、show_card 对已通过词及其句子卡的过滤、controller 推进与保存行为均保持。phase=done 使用 DoneLesson / DoneCelebrateFrame，与独立下课路由共用。

### P3 首页（2026-10-25）

`CourseHome` 使用 232px 可滚动纯文字课程侧栏，按 completed / hasResume / timesStarted 分为接着学、学完了、新课；全部注册课程可选。右侧显示课程事实、单词掌握比例、最近练习时间和 6×2 图片墙。已会按当前词卡 masteryStars ≥ 2 计算，不使用 API 的 3 星 masteredWords 或会话 clearedCardIds；上次取 lastPracticed 最大有效值，按本地日历显示今天/昨天/日期与时间，未上过不显示。单词图片随格子高度 cover，英文单行省略，卡片不响应点击。

显式选课保存为 `eduagent.selectedCourse.<learnerId>`，无有效记忆时优先接着学首课；切换孩子重新挂载并读取该孩子的进度，取消旧请求结果。多档案未选时显示具名选择面板，无档案保持设置建档入口。课程/进度未完成读取显示骨架，任一读取失败显示可重试错误，空目录单独显示空状态。新课按钮为开始上课，上过为继续上课，均复用既有 learnerId 路由和续课能力。没有跳过有效断点的现有入口，因此不提供从头复习按钮，也不改 controller；已完成课程原有 start 自动开启复习的行为保持。

原生菜单监听根 Menu 的 menu-will-show：Electron 45 的 Cocoa controller 在应用子菜单打开时向根 model 发事件。与加载/导航/聚焦刷新共用固定本地读取，无新增 IPC。macOS tracking 期间结构重建会延迟到菜单关闭，所以额外观察当前 renderer 的固定 /api/learners 请求完成事件，提前同步同页档案和选择变化；只读 Node fetch 不经过该 session，不产生循环。异步读取失败保留旧菜单供下次恢复。

### P4 下课与学习记录（2026-10-25）

`/records` 合并原先的单词本和家长页，主工具栏及原生 nav:records / Cmd+2 指向它。`/journal`、`/parents` 路由和旧组件已移除。学习记录只列 timesStarted > 0 的课程，以最近课次和词级 lastPracticed 降序排列。点课程条打开居中玻璃浮层（Esc、遮罩、关闭按钮可关，焦点进入后回到该行，遮罩下 `.shell-content` 与课程列表不滚动），墙为 6 列，复用首页 `HomeWordCard`（图片、中英、三段掌握、≥2 星打勾、未练淡化）。热力图为包含今天的滚动 91 天（13 列、7 行），格子边长取可用宽高减去间距后的较小值并居中，不随窗口压成扁矩形；使用本地日期，按每日 0 / 1–9 / 10–19 / >=20 分钟四档紫色。只展示现有时长、课次、会说单词、最近课次与 attempts > 0 且 masteryStars <= 1 的待练词，不显示占位准确率、连续天数等指标。

`buildStatsSnapshot` / `/api/stats` 返回 `lastDays: { date, minutes }[]`，始终 91 条且按日期升序补零；`last7Days` 等于 `lastDays` 最后七条。课次按 `startTime` 的本地日期归属，每天先累加课次时长，再四舍五入为分钟。累计总时长包含窗口外课次，独立累加后四舍五入。

下课页不再自动跳转；两列六行逐词表按持久 masteryStars 呈现（3 很好、2 好、1 再练练、0 没练到）。标题与今天学会数量使用 >=2 星，与首页一致；时长取 `/api/sessions?limit=50` 中本课最近课次，无课次时不造时长。建议下一课排除当前课与已学会全部词的课，优先有断点，其次未上过的新课；带最多四张未掌握词图。课堂内继续使用原 handleRestart，独立路由进入本课；现有控制器自动恢复有效断点，不新增强制清除断点行为。独立路由使用主工具栏替代旧 52px 留位，课堂内保留课堂工具栏。数据加载失败显示重试，孩子切换与重试忽略过期请求，不把失败当零值。

### P5 设置与首次引导（2026-10-25）

`/settings` 仍在主外壳内，左侧 232px 分区为「AI 老师与语音」「麦克风」「孩子」「关于」，右侧内容最宽 760px。页内不再放「回首页」和「设置」大标题。凭据表单、打码、空值保留、Web 只读、`POST /api/settings` 与退出码 75 的语义不变。连接测试结果按 AI 老师 / 听写 / 发音 显示「未测试」「正常」或失败原因，不回显 Key。ASR/TTS Resource ID 和音色收在「高级」里。删除孩子仍是页内输入名字确认，不用浏览器 `confirm()`。

`/onboarding` 是主外壳之外的全窗口三步引导，自带 52px 标题栏。第 1 步填写 LLM API Key、服务地址、豆包 App ID 和 Access Key，模型和资源 ID 继续用服务端默认值。引导中的保存会在 POST 之前写 `eduagent:onboarding-resume=2`，失败则清掉；Electron 重启后仍 `loadURL` 到 `/`，首页读到标记后进入第 2 步。第 2 步复用 `MicSection` 的试录和音量条。第 3 步标题是「建第一个孩子档案」。每步都可以「以后再说」。`VOICE_MOCK` 或已配置时第 1 步视为完成。首页在未配置、麦克风尚未询问、或没有孩子档案时分别进入对应步骤；设置读取失败则直接显示首页。旧 `/microphone` 路由已删除。孩子选择器底部不再放「设置」，空档案标题为「还没有孩子档案」。原生菜单「新建孩子档案」仍打开 `/settings#learner-name`。preload 没有新增方法。

---

## 13. 数据一致性:单次课堂统计(P2,2026-09-22)

`Session.lessonInteractionCount` 只计算当前 lesson 已写入的互动，创建或续课时均从 0 开始，普通 turn、quiz 与强化阶段固定回复统一递增；touch/finish lesson 汇总只取本次值。`LessonMemory.totalInteractions` 继续保存课程累计教学上下文并进入断点，不替代单次日志计数。历史日志不自动回填或重算。Realtime 课堂另有 `realtime_responses` 表（迁移 v7，一回应一行，存老师的话和静默评估的判定，见 §18），由删除孩子档案的事务一并清理。

### 原子提交（P2，2026-09-22）

普通 turn 的用户消息、教学状态和 token 用量先在草稿中计算，quiz 与固定回复使用同一 `commitSessionUpdate` 入口。同步 SQLite transaction 包含词表现、互动、lesson 汇总及断点；事务成功后才发布 live memory/计数/用量。事务不跨任何 await。LLM 等待期间或预览 yield 期间若有另一笔提交/阶段接受，revision 检查拒绝旧草稿，客户端可重试。

speech/actions 是未提交预览，`progress_snapshot`/`done` 与 quiz `{ok:true}` 只在落盘后发送；失败为 SSE error / HTTP 500。正常教学规则和播放顺序不变。创建先写 lesson log 再发布 session；结束立即取消，事务保存 finish/断点成功后删除。结束落盘失败时课堂保持关闭，仅允许再次 end 尝试保存，不重新开放教学。多次请求的 exactly-once 去重不在本次范围。

### 快照与协议入口（P2，2026-09-22）

`db/progress-snapshot.ts` 用当前格式校验 snapshot、两种不同的 phase、集合成员、非负整数、时间与 completed 标记。`getCourseProgress` 缺行返回 undefined，坏行抛 `InvalidCourseProgressError`；chat start 在创建 lesson/session 前返回 409 / INVALID_COURSE_PROGRESS。页面说明原记录已保留，并恢复启动入口。重复读取、失败启动不覆盖或删除坏行。批量聚合逐行诊断并跳过坏行，正常课程仍可显示；日志只包含 courseId/字段路径，不输出原始快照。

当前完整无版本快照继续兼容；后来新增的卡片仍 backfill，已移除/未知 card 和 quiz ID 保留，在首页派生比例时按当前课程识别项统计。缺整个必需集合不能用默认空数组掩盖。没有格式迁移、历史重算或自动修复。原聚合测试中仅含两个字段的简化 fixture 已补成完整合法快照，它们不代表旧持久化格式。

纯共享 `lib/lesson-protocol.ts` 定义并解析 HTTP request/ack、ResumeInfo、LessonProgressSnapshot 与 StreamUserEvent，服务端编码和浏览器消费复用同一判别联合。跨网络输入在入口校验；非法 done JSON 不算成功，resume phase 不再由任意 string 强转。合法事件 JSON 字段与事件名保持，allWordsDone 和 actions 的 state_update 允许既有可选字段。内部教学函数不重复解析外部 schema。

---

## 14. 配置来源与未配置状态

**配置来源**
- Web 开发模式(无 `EDUAGENT_APP`):`server.ts` 读 `.env.local`,行为不变。
- App 模式(`EDUAGENT_APP=1`):Electron main 只传 `EDUAGENT_SETTINGS_PATH=<userData>/settings.json`,不注入任何 key。`server.ts` 在 `getConfig()` 之前调用 `applySettingsToEnv()`(`src/lib/settings/store.ts`):先清掉继承来的同名 env(`LLM_*`、`OPENAI_*` 与豆包字段)。LLM 只取 `activeLlmChannelId` 指向的那条渠道,非空时写入 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`,并始终写入 `LLM_PROVIDER`(`siliconflow` | `volc-ark` | `deepseek` | `custom`)。语音字段映射到 `DOUBAO_AUTH_MODE`、`DOUBAO_API_KEY`(非空才写)、`DOUBAO_APP_ID`、`DOUBAO_ACCESS_KEY`、`DOUBAO_ASR_RESOURCE_ID`、`DOUBAO_TTS_RESOURCE_ID`、`DOUBAO_TTS_DEFAULT_SPEAKER`。没有 `doubaoAuthMode` 且 App ID 或 Access Key 非空的文件会迁成 `legacy` 并写回;两者都空则内存里用 `apikey`,不因此新建文件。`asr-proxy` / `tts-proxy` / `config.ts` 继续只读 `process.env`。文件不存在时内存里用默认渠道(SiliconFlow、`deepseek-ai/DeepSeek-V3.2`)和默认资源 ID(`volc.seedasr.sauc.duration`、`seed-tts-2.0`),不新建文件。磁盘上只有旧的顶层三字段、没有 `llmChannels` 数组时,按地址主机名推断类型(`siliconflow.cn` / `volces.com` / `deepseek.com`,其余 `custom`),迁成 id 为 `legacy-llm` 的一条渠道并原子写回;写失败仍用迁好的值启动。`config.ts` 读 `LLM_PROVIDER`,缺失或未知值当作 `custom`,这样 Web 的 `.env.local` 不设该变量也能启动。`llm.ts` 的超时与对冲不变(4s 首个 `delta.content`、10s 卡住、30s 总上限);只有 `volc-ark` 在请求体加 `thinking: { type: 'disabled' }`。
- 实验开关 `realtimeTurnMode`（手动划轮，见 §18）：App 模式存于 `settings.json`，不写入 `process.env`，由 `getRealtimeTurnMode()` 每次开会话现读；env `REALTIME_TURN_MODE` 优先。`POST /api/settings` 的 zod 里该字段可选，缺省保留已保存值。
- 豆包 WS 端点由 `src/lib/voice/doubao-endpoints.ts` 提供,env `DOUBAO_ASR_WS_URL` / `DOUBAO_TTS_WS_URL` 可覆盖(仅测试用,指向本地 fake server)。`config.ts` 里原先过期的 v2 默认地址已改成与 proxy 一致的 v3 端点。

**未配置状态**
- `config.ts` 的 `isConfigured()` 直接读 `process.env`:`VOICE_MOCK=true` 视为已配置;否则要求 LLM key(`LLM_API_KEY`)、两个 Resource ID,以及当前鉴权方式的凭据。`apikey` 要 `DOUBAO_API_KEY`;`legacy` 要 `DOUBAO_APP_ID` 和 `DOUBAO_ACCESS_KEY`。`DOUBAO_AUTH_MODE` 只认这两个值,缺省或其它值时按「有 API Key → 新版,否则有 App ID 或 Access Key → 旧版,都没有 → 新版」推断,这样已有 `.env.local` 不用改也能上课。`getConfig()` 缺凭据不再抛错,server 照常启动。
- 未配置时 `POST /api/chat` 返回 HTTP 503 + `{ code: 'NOT_CONFIGURED' }`;语音 WS upgrade 在 `guardUpgrade()`(`voice/upgrade-guard.ts`,先验 Origin 再验配置)里直接回 HTTP 503 并关闭 socket。前端:首页加载时 `GET /api/settings` 发现未配置且没有跳过,进入 `/onboarding` 第 1 步;设置读取失败时首页照常打开。`LessonController.start` 收到 NOT_CONFIGURED 仍跳 `/settings`。

**Settings API**(`src/app/api/settings/`)
- `GET /api/settings` -> `{ mode: 'app'|'web', configured, mock, values }`。`values.llmChannels[].apiKey`、`doubaoApiKey`、`doubaoAppId`、`doubaoAccessKey` 打码(末 4 位,长度 ≤8 只给 `••••`),其余原样。Web 模式没有 key 时展示一条 SiliconFlow 预设渠道(id `env-llm`);有 `LLM_API_KEY` 时渠道名取 `LLM_PROVIDER` 对应的类型名。豆包鉴权方式与 Web env 用同一套推断。
- `POST /api/settings`:仅 App 模式(web 模式 403 `WEB_MODE_READONLY`)。zod 校验渠道列表(1–20 条、id 唯一、当前 id 必须在列表里)。每条渠道的 `apiKey` 按渠道 id 合并:提交打码值或空串保留该 id 已保存的 key,新 id 不继承别的渠道的 key。`doubaoApiKey` 与旧版 App ID / Access Key 同样:打码或空串保留原值。同目录临时文件(0600)写完 rename,再 chmod 0600。返回 200 后 400ms 以**退出码 75** 退出。日志只记当前渠道的 provider 和 `doubaoAuth`,不记 key。
- `POST /api/settings/test`:`scope` 为 `channel` 时只测 `channelId` 那一条(不必是当前渠道),请求体带该渠道的 provider 附加参数,成功原因形如「正常 · 首字 1.2s · 整轮 3.4s」(首字只认 `delta.content` 或一次性 JSON 的 `message.content`);`scope` 为 `voice` 只测豆包 TTS/ASR,请求头按提交的 `doubaoAuthMode` 走同一套鉴权构造(新版只有 `X-Api-Key`,旧版 ASR/TTS 头名不同);`scope` 缺省或 `all` 测当前渠道加语音。打码字段回退已保存值,空的地址/模型用该类型预设补齐。LLM 失败额外返回稳定 `code`,与课堂共用 `classifyLlmFailure` 的中文原因并附 HTTP 状态,例如「余额不足:请到模型服务商控制台充值后再试(HTTP 402)」。豆包原因与错误码保持原契约;不回显、不记录 key。
- **CSRF**:两个 POST 都经 `rejectBadOrigin()`,`Origin` 必须是 `http://localhost:<PORT>` 或 `http://127.0.0.1:<PORT>`;**缺失也拒绝**(与 WS 允许缺失的规则不同),返回 403。

**退出码 75 重启约定**:server 保存设置后以 75 退出;`desktop/main.js` 的 utilityProcess `exit` 回调见 75 就用同样的 env 重启子进程,端口就绪后 `loadURL` 重新加载窗口。非 0 且非 75 退出自动恢复一次,再崩溃则显示含日志路径的错误页;恢复期间显示本地重启页,详见下方「桌面版」。`desktop/main.js` 的 `setWindowOpenHandler` / `will-navigate` 把站外 http(s) 链接交给系统浏览器,其余导航一律拦截。

**ws / bufferutil 坑**:`server.ts` 顶部设 `process.env.WS_NO_BUFFER_UTIL ??= '1'`(开发模式下 Next 路由里的 ws 客户端同样会踩,真实 key 实测 `/api/settings/test` 的 ASR 探测报错),打包时 `desktop/scripts/stage.mjs` 的 esbuild 产物开头也设一次(打包后 ws 先于 server 主体求值)。否则打包版里 `ws` 的可选依赖 `bufferutil` 会被 Next 的 require hook 解析到没有 `mask` 的占位模块,ws 发送 >=48 字节的帧(ASR 请求帧/音频帧)时抛 `t.mask is not a function`;Phase 0 的 mock 模式不经过 ws 客户端,所以没暴露。

---

## 15. 桌面版(Electron)

2026-10-24:Phase 0/1 壳完善为以下生命周期与授权流程;保留既有 standalone + esbuild、自签名、退出码 75 契约。

**进程与端口**:Electron main(`desktop/main.js`)持有窗口和唯一 `utilityProcess` server。打包版优先监听 `127.0.0.1:38417`(`EDUAGENT_PORT` 可覆盖),启动前探测端口,被占用则向系统申请空闲端口并写日志。实际端口通过 `PORT` 注入 server;HTTP Settings CSRF 和语音 WS Origin 白名单均按该值校验,窗口导航、权限和 IPC 校验也只接受实际本地 origin。端口变化会改变 localStorage 的 origin,但 SQLite 和系统麦克风授权不受影响。

**preload 暴露面**:`desktop/preload.js` 在 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` 下暴露 `window.eduagentDesktop` 的五个无参数原生方法及下述只读菜单订阅:`getMicStatus()`、`requestMic()`、`openMicSettings()`、`getAppInfo()`、`openLogsFolder()`。main 验证调用来自当前窗口的主 frame 和本地 origin。版本由 `app.getVersion()` 提供,设置路径、任意 URL、文件系统和原始 IPC 均不传给 renderer。新增只读 `onMenuCommand(callback)` 订阅，返回取消订阅函数，仅允许 `nav:courses / nav:records / nav:settings / learner:new / learner:<id>`；preload 校验枚举与 ID，回调不暴露 IPC event。main 从实际 loopback server 读取孩子档案，以固定代码读取本地选中 ID，加载/导航/聚焦、renderer 档案请求完成与应用菜单打开事件同步孩子菜单，无定时轮询；列表变化重建菜单，只有选择变化时就地更新勾选。

**麦克风授权**:启动仅调用 `getMediaAccessStatus`,不申请授权。首页在配置和只读麦克风检查完成前保持准备状态。未配置且未跳过进入 `/onboarding` 第 1 步;引导里保存会先写 `eduagent:onboarding-resume=2`,退出码 75 后窗口仍先加载 `/`,首页再进入第 2 步。权限为 `not-determined` 且尚未完成或跳过时也进入第 2 步;没有孩子档案且未跳过、档案可读时进入第 3 步。引导是独立全窗口,不挂主工具栏,旧 `/microphone` 已删除。跳过标记只存在当前 origin 的 localStorage。设置页的 `MicSection` 常驻显示「已允许 / 未决定 / 已拒绝」,只有明确点击「允许使用麦克风」才调用 `askForMediaAccess`。已拒绝时,「打开系统设置」经 `shell.openExternal` 打开固定 URL `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`;macOS 修改拒绝状态后可能需要退出重开 App。`restricted` / `unknown` 保守归为已拒绝。

「试录一下」复用 `LessonRecorder` 的 16k AudioContext、AudioWorklet 与 PCM 输出计算 RMS 音量,最多 10 秒,停止或离开页面即 dispose,不保存音频、不连接 ASR。课堂入口 `LessonClient` 仅在权限为 granted 时挂载 `PhasedLessonView`,其他状态显示设置入口,因此不会开始 server session 或预热录音。授权通过后保留 Phase 2 的档案解析,将选定 `learnerId` 传给课堂。回到窗口时重新检查状态。Electron 的 media permission handler 也只对本地 origin、已允许的音频请求放行。Web 无 preload 时使用 `navigator.permissions.query({ name: 'microphone' })` 读取状态,设置页的明确授权按钮才调用 `getUserMedia` 并立即释放 stream;隐藏系统设置和日志文件夹按钮。

**服务重启与退出**:server 保存设置后以 75 退出,main 显示包内 `restarting.html`「正在重启…」,重新启动服务并等待 `/api/settings` 返回 200,再加载首页。首页随后按引导标记决定留在首页或进入 `/onboarding`。非 0 且非 75 退出在本次 App 生命周期内自动重启一次;第二次崩溃、正常意外退出或就绪超过 30 秒,显示错误页与日志位置。旧进程的就绪轮询在新进程接管后取消,避免旧回调覆盖新窗口。退出 App 时先终止 server,等待退出事件,3 秒未退出则强制清理。单实例锁防止重复进程;站外 http(s) 链接用系统浏览器,renderer 导航和 redirect 不能离开本地 origin,保留编辑菜单的复制粘贴快捷键。

**页面缩放（2026-11-15）**：窗口创建时设置 setZoomFactor(1)，每次主文档 did-finish-load 时重置因子；before-input-event 继续拦截 Cmd/Ctrl 的加号、等号、减号、0 及对应键码，窗口状态保存不变。Electron 45 默认 visual zoom 范围为 1–1，应用不再调用 setVisualZoomLevelLimits。原调用在首个 live render frame 出现前先保存设置但 Promise 以“Render frame was disposed”拒绝，同一错误文本也用于 frame 已销毁的情况；移到加载完成后，如紧接着导航，renderer 确认仍可能被丢弃并产生误报警。依据：[Electron API](https://www.electronjs.org/docs/latest/api/web-contents#contentssetvisualzoomlevellimitsminimumlevel-maximumlevel)、[45.0.0 ElectronBrowserClient::OverrideWebPreferences](https://github.com/electron/electron/blob/v45.0.0/shell/browser/electron_browser_client.cc)、[WebContents::SetVisualZoomLevelLimits、MainFrameRenderer 和 AckCallback](https://github.com/electron/electron/blob/v45.0.0/shell/browser/api/electron_api_web_contents.cc)、[WebFrameMain::GetFrameApi](https://github.com/electron/electron/blob/v45.0.0/shell/browser/api/electron_api_web_frame_main.cc)。dev 与打包 e2e 测量 pinch 的 visualViewport.scale 和布局缩放的 getZoomFactor，dev e2e 另检查导航、可实际缩放的正对照及 8 个快捷键。Playwright CDP keyboard 会绕过 before-input-event，快捷键检查用 webContents.sendInputEvent。

**数据与日志**:`app.getPath('userData')`(通常 `~/Library/Application Support/EduAgent/`)下保存 `settings.json`、`eduagent.db` 和 `logs/server.log`;日志启动时超过 5 MiB 轮转为 `server.log.1`,保留一份。关于区块与 App 菜单均可经 `shell.openPath` 打开日志目录。Key 仍由 server 从 settings 文件映射到 env,见上方 Phase 1 节。

**开发与打包**:`pnpm app:dev` 启动本机 `pnpm dev`(优先 3000,占用则改空闲端口),Electron 通过 `EDUAGENT_DEV_URL` 指向该 dev server,不依赖 staged server 或安装包。启动脚本负责清理其 dev 进程组,普通 `pnpm dev` 行为不变。`pnpm app:release`(兼容入口 `pnpm app:pack`)经 `desktop/scripts/release.mjs` 完成 stage → electron-builder dir → 专用钥匙串自签名与 codesign 校验 → dmg。版本从根 `package.json` 注入打包 metadata,文件名为 `EduAgent-<version>-<arch>.dmg`;保留 `EnableNodeCliInspectArguments` fuse 以支持 Playwright。证书步骤见 [mac-signing.md](mac-signing.md)。`pnpm app:e2e` 在临时 userData + VOICE_MOCK 或本地 fake server 下执行;只有 `EDUAGENT_TEST=1` 时 `EDUAGENT_TEST_MIC_STATUS=granted|denied|not-determined` 才覆盖 native 状态,未询问时点允许会在该测试进程内变为 granted。截图默认写到 `desktop/dist/evidence`,设 `EDUAGENT_E2E_EVIDENCE_DIR=<目录>` 可改写到别处(只验证现有构建、不改动 `desktop/dist` 时用)。

**App 图片 staging(2026-10-24 Phase 4)**:`stage.mjs` 在构建前确认本机 `cwebp` 可执行,仅把 `public/images/**/*.png` 转成 q82 WebP 放入 `desktop/build/server/public/images-webp/`,不复制这批 PNG 到 staging,不改仓库原图、课程数据或组件。`next.config.mjs` 仅在 `EDUAGENT_STANDALONE=1` 时开启 standalone 和 rewrite:`/images/:path*.png` → `/images-webp/:path*.webp`;普通 dev/build 没有 rewrite。App 的生产配置从 required-server-files 注入,路由从构建 manifest 读取。`SKIP_NEXT_BUILD=1` 只可复用已有 App 构建,stage 会检查 rewrite 存在,防止误用普通 Web 构建。转换统计保存在 `desktop/build/webp-metrics.json`。standalone 复制排除 `.env*`,发布物不带开发配置、用户数据库或签名文件。

`pnpm app:verify-images` 从 `allCourses` 递归收集全部 `imageUrl`,启动真实打包 App,使用原 PNG URL 逐个检查 200、`image/webp`、RIFF/WEBP 文件头和 Chromium 实际解码。JSON 证据位于 `desktop/dist/evidence/webp-verification.json`;`python3 desktop/scripts/compare-webp.py`(需 Pillow)据此每门课抽一张生成左右对比图,保留原生 512px,供画质目检。采用 Next 原生 [rewrite](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) 与官方 [cwebp](https://developers.google.com/speed/webp/docs/cwebp),没有新增运行时图片处理依赖。

**架构产物**:2026-10-24 用户决定只交付 Apple 芯片 arm64 版,Intel 版按需再做,不生成 universal 包。SQLite 无 ABI 重编译需求,但 Next 构建工具依赖宿主架构的 SWC。Phase 0 曾认为 standalone 会携带该 SWC;本轮实际 staging 未发现 `@next/swc-*` 或 `.node` 二进制,因此不把旧推断当作本轮包内容事实。将来制作 x64 时需要在 x64 环境重新 `next build`,确认 SWC/esbuild 构建依赖可用,再完成 x64 App 冒烟和 Intel Mac 真机验收。当前 release 只接受 arm64 Node,且始终重新构建,不接受 `SKIP_NEXT_BUILD` 跳过。

实现依据:采用 Electron 原生 [systemPreferences](https://www.electronjs.org/docs/latest/api/system-preferences) 和固定方法的 [contextBridge / IPC](https://www.electronjs.org/docs/latest/tutorial/ipc),不新增原生依赖或自制授权协议。真实 TCC 弹窗、系统设置页跳转、覆盖安装后授权保留及实体麦克风音质仍需真机验证。

**server 打包与启动**:Electron main 用 `utilityProcess` 拉起打包后的 server(`EDUAGENT_APP=1`、`EDUAGENT_SETTINGS_PATH=<userData>/settings.json`、`HOST=127.0.0.1`、`DATABASE_PATH=<userData>/eduagent.db`、优先端口 38417,占用时改用空闲端口),等端口就绪再开窗口。`EDUAGENT_APP=1` 时 `server.ts` 不读 `.env.local`,Next 配置取自 `.next/required-server-files.json`(经 `__NEXT_PRIVATE_STANDALONE_CONFIG`),`HOST` 缺省仍监听所有网卡(开发行为不变)。server 打包:`EDUAGENT_STANDALONE=1 next build`(`output: 'standalone'`)+ esbuild 打 `server.ts` + 手动补 `public/`、`.next/static`,见 `desktop/scripts/stage.mjs`。

---

## 16. 课堂视图的意图接口(2026-10-29)

课堂页面通过 `voice/classroom.ts` 的 Classroom 接口订阅状态、字幕、卡片、阶段、保存中的练习、带来源的练习结果和统一的答题结果（`answer-result`，见 §18；目前只有 Realtime 发出，原有课堂不发），发送介绍、重讲、录音、呈现题目及点击答案等意图。`interaction` 区分按住说话（原有）与自然对话（Realtime）；自然对话视图显示对话状态和暂停麦克风按钮，并在渲染后上报 `presented`。入口按开课前选择构造 LegacyClassroom 或 RealtimeClassroom，整堂课模式固定。它组合既有 LessonController 和 PhasedLessonController，保留旧阶段策略。既有原始协议与 ASR/TTS 管线不变。

LegacyClassroom 拥有旧重讲提示词、句子 ASR 匹配、候选句、静态题目话术、保存后重试计数及已清词不可重看的过滤。共享组件不读取 asr-final 来判跟读，不提交模型口头表扬为成绩，也不写 raw LLM 指令。选词仍按课程客观答案确定显示；保存及下一题决定来自控制器的 quiz-result。保存失败留在同题、重试不提前累计，旧模式第三次错误仍按原规则前进。已经通过的非连续题目在续课中被跳过；无待做练习时触发完成出口。

---

## 17. 独立 Realtime 协议实验(2026-10-29)

`scripts/realtime-prototype/` 是独立命令行实验，不是已接入的课堂模式。
现有课堂仍使用豆包 ASR、文本 LLM、guard 与豆包 TTS。实验只用合成音频及
内存工具回执，不修改实际课程、用户配置或学习记录。

WebSocket 实验将 24 kHz PCM 直接送入 Realtime，比较单次语音回应与
“纯文本工具请求 → 内存执行确认 → 语音回应”。输入／工具按应用 turnId 与
回应 metadata 关联；语音和模型自述转写分别记录。模拟服务覆盖重复调用、
错误目标、取消、同会话多轮及不计答题的示范；不会将工具参数重新送旧文字命中算法裁决。

另有独立 WebRTC 连通性脚本，以本地可信服务转发 SDP，长期密钥不进入浏览器；`natural-spike.ts` 在接入课堂前实测了 WebRTC＋sideband、语义 VAD、打断截断与工具先行顺序（结论见下文自然对话课堂；工具先行的结论已于 2026-11-11 被取代，见 §18 工具一条）。
两种实验不共享工作负载，因此不可据其直接比较端到端延迟。收到 PCM、RTP
或模型 response 完成，都不代表实体扬声器播放结束。

运行、费用与证据限制见 [Realtime experiment](./realtime-prototype.md)。日常测试
使用离线假传输，真实调用必须显式加 `--live`；真实失败不记为零费用。

实验还包括模型驱动的两词多轮序列、无孩子输入的题目／分段示范、已有快照格式的离线映射，以及在真实浏览器运行既有 PcmPlayer 的队列排空验证。这些不等于生产课堂、双模式续课或教学质量已验收。

独立实验支持原 PCM 复用、服务端音频哈希核对、分类指令对照及按严格类别／通过率分别汇总。全零 PCM 可显式在调用前忽略，不计评估或 API 用量；这不是房间静音检测。未完成回应保留脱敏状态与已知用量，缺失用量不按零费用计算。这些诊断选项尚未进入生产课堂。

---

## 18. Realtime 自然对话课堂(2026-10-29)

开通 Realtime 通话时，HTTP 429 的结构化错误 `error.code` 或 `error.type` 为 `insufficient_quota` 则保留为 `REALTIME_INSUFFICIENT_QUOTA`，课堂提示到 OpenAI 控制台检查余额和账单；其他 429（含空或无法解析的正文）仍为 `REALTIME_RATE_LIMITED`。不回显或记录提供方错误正文。

上文豆包 WS 与文本 agent 时序属于原有模式，原有课堂仍按住说话。Realtime 模式在 `RealtimeClassroom`（`interaction = 'conversation'`）内实现同一 Classroom 接口，开课后自然全双工：常开麦、提供方自动划轮、外放模式关闭时孩子随时插话。首版的按住说话＋HTTP 整段上传 PCM＋服务端串行 turn 已被替换，不保留为第三种子模式。

传输：浏览器 `getUserMedia`（echoCancellation/noiseSuppression/autoGainControl）只取一条麦克风轨道，直接加入 `RTCPeerConnection`，老师语音由远端轨道经 `<audio>` 播放，回声由浏览器 WebRTC AEC 处理，不经 worklet／PcmPlayer。浏览器把 SDP offer 交给 `POST /api/realtime {action:'connect'}`；服务端 `realtime/call.ts` 用官方 unified interface（multipart `sdp`+`session`）调用 `/v1/realtime/calls`，长期密钥不出服务端，再以 Location 中的 `rtc_` call id 打开 sideband `wss://api.openai.com/v1/realtime?call_id=…`。connect 返回一条长期 SSE：首个事件为 SDP answer，之后是事务回执与转发的会话状态事件（speech_started/stopped、response.created/done、转写 delta、output_audio_buffer.started/stopped/cleared）。数据通道 `oai-events` 仅用于暂停时发 `output_audio_buffer.clear`。不引入新 SDK，不用 GPT-Live，模型仍为 `gpt-realtime-2.1`。

划轮与打断：会话配置 `semantic_vad`（eagerness `medium`，最长等待 4 秒）、`create_response: true`、`interrupt_response: true`，不开输入转写。提供方自动打断（外放模式关闭时）：孩子一开口，提供方取消进行中的回应并清空未播音频。应用不做打断仲裁，原因见下文“打断机制的踩坑结论”。前端状态由事件推导：awaiting＝麦克风开着且安静，listening＝检测到孩子说话，thinking＝等回应，speaking＝老师在播，paused＝孩子暂停麦克风。提供方把输出音频当作一个缓冲区报告：首尾相接的多个回应只有一次 started（第一个回应 id）和一次 stopped（最后一个回应 id），因此“老师在播”是缓冲区级布尔值，缓冲区排空即视为所有已生成完的回应都已播完。

外放模式（2026-11-11，默认开）：浏览器在 `active.size > 0 || playing`（老师在生成或在播）期间把麦克风轨道 `enabled` 置为 false，老师转为空闲后再等 `SPEAKER_RELEASE_MS`（500 ms，让音箱尾音、蓝牙延迟和房间回声消散）才重新开麦；暂停和收尾仍然关麦。轨道开关只在 `RealtimeClassroom.syncMic` 一处设置。开关在 `src/lib/speaker-mode-pref.ts`（localStorage `eduagent.speakerMode`，默认开），设置 → Realtime 里的「外放模式：老师说话时不收音」，开课时读取，下一节课生效；`start` 请求带 `speaker` 字段，服务端只用于 `started` 日志。取舍：外放模式下老师说话时孩子不能插话，要等老师说完；关闭后恢复原来的全双工。原因：2026-11-11 一节外放真实课里老师被自己的回声反复打断，105 个回应中 11 个在产出任何内容前就被取消，27 次作答中 8 次丢了反馈。麦克风被关住时手动划轮的重叠判断没有事可做（孩子的声音根本进不来）。

sideband 连接失败时先记 `sideband rejected`（HTTP 状态码）或 `sideband error`（系统错误码），再走 `provider closed`（2026-11-11 加，此前这条错误路径没有日志）。打断诊断日志（自动划轮，只含 id、安全码、布尔值和数字）：`child speech`（`sessionId`、`durationMs`、`vadWaitMs`、`teacherPlaying`、`teacherActive`、`playedMs`：孩子一段话的时长、等待提供方判定说完的时长，以及开口时老师是否在播或在生成、已播多久；`vadWaitMs = max(0, speech_stopped 到达时刻 − (speech_started 到达时刻 + durationMs))`，单位毫秒；缺少任一音频时间戳时 `durationMs` 按事件到达时刻计算，`vadWaitMs` 为 0）；`response ended early`（`sessionId`、`status`、`reason`、`kind`、`hadSpeech`：回应未正常完成时的状态与原因）。下节真实课看这两条：外放模式下开口时 `teacherPlaying` 应基本为 false，未出声就被取消的回应应消失。

课堂边界日志（info）：`battle started` 在第一张战斗卡已提交、向浏览器发战斗开始事件时记录 `sessionId` 和 `elapsedMs`（本次课已上时长，不计暂停）；`sitting end settled` 在评估等待结束、真正发 `sitting-ended` 时记录 `sessionId`、`waitedMs`、`pending`（进入 endSitting 时的在途评估数）和 `timedOut`（是否因等待超时结束）。2026-11-15 起同时记录 `battleAttempts`、`battleCorrect`、`battleMastered`，从第一张战斗卡成功提交后累计成功保存的评估作答及其中 correct、mastered 的数，不算 not_attempt、保存被拒或重复结果；最后在途评估结算后再写总数，没有战斗时均为 0。第一笔战斗作答可能是孩子最后一笔教学作答，因为计数从首张战斗卡提交时开始，而该作答的评估可能稍后才保存。没有在途评估时也记一条，等待为 0；不含音频、话术、转写或参数正文。

回应记录（2026-11-11）：表 `realtime_responses`（v7 加表迁移，可重复执行，只增不改）每个提供方回应在第一次 `response.done` 时写一行：`lesson_id`、`timestamp`、`kind`（`speech` 表示 VAD 自动创建，`assess` 是不出声的评估回应，其余是应用请求种类 opening/followup/present-quiz/repeat/pick-feedback/goodbye/commit/nudge）、`status`（completed/cancelled/failed/incomplete）、`text`（老师这次说的话，被取消时可能只有一部分或为空，上限 4000 字；`assess` 行存的是评估回应的工具参数原文，即它的判定）、`tools`（逗号分隔；老师回应的换卡写 `show_card(<课程卡 id>)`，仅留已知课程卡 id，未知卡或坏参数写 `show_card(?)`；`start_practice`、`end_sitting` 仍只写名字；评估回应写 `record_assessment(<开口时绑定的课程卡或练习题 id>)`，无绑定时仍写 `record_assessment`；旧记录的无括号工具名仍可读；被取消回应里的工具只记录，仍不执行）、`reply_ms`。只存老师的话和评估回应的判定（其中 `heard` 是模型自述听到的词），孩子的音频不存；写进库不写进日志；写入失败只记一条 warn（`response record failed`），不影响上课。先完成后被以 cancelled 再报的回应保留原来的 completed 行。删除孩子档案时同事务删除这些行。`scripts/lesson-report-data.ts` 输出 `responses` 和 `responseStats`（老师回应的总数、取消数、未出声就被取消数，评估回应的总数、失败数和结果分布，回复等待的中位数、p90、最大值；评估回应不计入老师回应的那几项，便于和此前的课对比）。回复等待日志 `reply wait`（`sessionId`、`replyMs`，仅自动划轮）：孩子停止说话到老师音频开始播的时间。提供方报告语音结束偏晚，所以停止时刻用估计值：`speech_started` 的到达时刻加上由 `audio_end_ms - audio_start_ms` 算出的说话时长；`output_audio_buffer.started` 到达时算差值，若带的 `response_id` 对应已知回应，则把它写入该回应的 `reply_ms`；新的 `speech_started` 会清掉未用的估计。同时改了两处提示词：SITTING 段要求教完约 4 到 6 个词而应用的收尾提示还没到时，不告诉孩子要停，也不再多开新词，而是用新情境、不给示范的回忆和课程目标句继续练这些词（2026-11-14 起，这条只在整门课还有未过关的词时成立；`[app] State` 显示没有剩余词时，不论时间，立刻调用 `start_practice`，不再回忆空转）；评估的 `heard` 只写听到的音或词（可为空字符串），评论和提示说明写进 `evidence`。

指令措辞同步收紧（2026-11-11）：每轮控制在一两句、约五秒；不用固定的“轮到你了”收尾，也不连续用同一个开场词；不对孩子说“目标词”，也不评论是否有提示或帮助。

服务端 `realtime/conversation.ts`（NaturalConversation）拥有工具执行和应用发起的回应：
- 输入绑定：浏览器在 React 提交后上报 `presented`（卡片或题目）。sideband 收到 `speech_started` 时，把该输入 item 绑定到此刻已呈现的目标，而不是服务端此后的当前卡。评估回应针对的就是这个绑定目标，目标 ID 由应用填写，模型不传；同一输入只保存第一份评估。应用发起的回应（开场、重讲、题目示范、点击反馈、告别）没有孩子输入，不产生评估。
- 教学指令（2026-11-01，按孩子状态教学版）：教学部分重写，要点：一次课约 4 到 6 个新词，不要求教完整门课；2 到 3 个相关词由模型按剩余词串成一个情境（课程数据不新增场景字段）；参与阶梯 听懂、二选一、跟读、补词、自己用，会了往上、卡住往下或换帮法，同一种帮法两次不成功就换，沉默时降一级而不是重复原问题；`mastered=true` 的标准是在另一个情境里自己想起来（补词或自己用），首次跟读正确只算练过（`mastered=false`、`retry`）；每轮只做一件事并明确让话；反馈具体、不说“不对”，说得不完全对时自然重述，孩子说中文先肯定意思再给英文；孩子插话或分享经历先接住再连回目标词，不想学了给选择或提前收尾；孩子随时可以开口，开口时老师停下、先接他说的话（简短，一句引导），是跟读就评估、是附和就继续；词熟悉后顺带用课程目标句；续课先用新情境回忆之前过关的 2 到 3 个词，要问的词先放上对应的卡（回忆作答不取消已过关）。同时保留 2026-11-01 迁回的 `drillParts` 拆分、只总结实际练过内容、句子示范先语境和完整句的约束。评估工具的字段描述用同一套标准（2026-11-11 起评估由独立的评估回应完成，见下文「评估回应」，老师的指令里只保留教法：过关由应用判定，跟读之后要换情境再问）。2026-11-14 新增固定的 `SCREEN FIRST`、`SENTENCES` 和 `APP VERDICT` 段（`SCREEN FIRST` 紧挨在 `SENTENCES` 之前，三者位于 `NO BOOKKEEPING TALK` 后、`TOOL RECOVERY` 前，`GAME_RULES` 仍在末尾）。`SCREEN FIRST`：应用按屏幕上的卡评判每一次作答，孩子也看着这张卡，所以要孩子说的必须就是屏幕上的卡；问别的内容（回忆旧词、同一情境里的另一个词、课程句子）之前，同一轮先用 `show_card` 放上那张卡，结果回来后再问；不能一张卡在屏幕上却问另一个词。讲解或铺情境时提到别的词可以，要求孩子说出它们不行。`SENTENCES`：整句练习先按 `SCREEN FIRST` 放上课程句子卡，再示范和邀请；孩子在词卡上自发把屏幕词用进自己的句子可以，不纠正其余部分；非课程目标句只说一次，当作意思示范，不要求整句复述或修正小词。2026-11-15 起，老师静默读取应用对上一条作答的判定，回应新作答按自己听到的来；同一卡的下一步仍与判定一致：correct 不再要求修正那个词，close／wrong／not_attempt 不把词当作已结束（不要求每次都再试一次，以免和「连续没判对就换词」的提醒相抵）；不回头评价已换走的卡，不道歉、不解释，也不念出或提及应用消息。对孩子用中文交流，英文只用于课程目标词句和围绕目标词帮助理解的简短英文示范；鼓励、过渡、指令、提示和叙述下一步都用中文。TEACHING 的英文阶梯示例只是为了简写，实际用中文围绕英文词提问，例如“小狗在 run 还是 sleep？”。同一天给两处既有段加了一句：`SITTING` 里「收尾提示未到就用同一批词继续练」只在还有词没过关时成立，`[app] State` 显示整门课没有剩余未过关的词时立刻 `start_practice`；`RETURNING` 末尾要求要孩子回忆哪个词，就先放上那个词的卡。State 仍追加当前词 attempts/correct，指令和工具整通电话固定。教法与过关依据属于模型指令，未新增服务端次数门槛；mock 仅证明流程支持，不能证明真人教学质量，教学效果由真人课加课后报告判断。2026-11-15 新增固定的 `NEW WORDS` 段（紧接 `PASSING A WORD`）：孩子从没说对过的词是新词，先教再问。卡放上屏幕后先清楚地说出英文和意思（长词用 `drillParts` 拆开），让孩子跟着说；跟读出来之后才用不带这个英文词的提示提问；不能一上来就问新词的英文是什么。起因是 2026-11-15 真人课里 bell、trumpet、harp 三个没学过的词都被直接提问，孩子只说得出开头的音。是不是新词由应用告知：`show_card` 的结果（见下方「工具」），以及 `[app] State` 当前词练习里的 `"correct":0`。
- 工具失败（2026-11-11 改）：老师的工具（`show_card`、`start_practice`、`end_sitting`）被拒绝时记录安全错误码和工具名，不记原始参数或语音；回执是 `ok:false` 加一句提示（什么都没变，不要对孩子提工具、ID 或错误，可用修正后的参数重试一次，否则照屏幕上的内容继续教）。评估不再经过老师的工具，所以此前的题号归一化（模型传句子卡 ID 时改写成题号）和 `expected_target` 恢复提示都已删除：评估目标由应用按绑定填写，不会传错。
- 工具只在 `response.done` 状态 completed 时执行；被打断（cancelled）的回应中的工具一律丢弃，不迟到改屏幕。已完成回应被打断时提供方会以 cancelled 再报一次同一 id，按 id 去重，用量只记一次。
- 工具：老师（说话的回应）只有 `show_card`（讲解／复习／按孩子要求切卡／换到下一个词，不计尝试；2026-11-15 起，放上的是词卡、这个词的累计判对数 `wordPerformance.correct` 为 0 且收尾提示还没到时，成功回执的 `note` 换成一句提示：孩子从没说对过这个词，先示范并让孩子跟读，跟读之后才不带词地问。收尾提示之后的卡是回忆卡或战斗卡，仍用原来的 `note`；句子卡不加）、`start_practice`、`end_sitting`，没有评估工具。孩子尝试英文目标词时，老师在同一轮里直接回话：一句只针对孩子那个词的短反应，接着给下一个提示或问题；要换卡就在短反应之后调 `show_card`，结果回来后由续答介绍新卡；2026-11-15 起，若该回应全部工具都是成功的 show_card，续答带 tool_choice:none，避免同一张卡重复出卡；被拒出卡或含 start_practice 时保留工具；其他用到工具的情况仍是先调工具、结果回来后再说。提示词要求对孩子用中文交流，英文限课程目标词句和帮助理解的简短目标词示范；鼓励、过渡、指令、提示和叙述下一步都用中文。提示词禁止“让我听一下／let me check／我记一下”之类对自己过程的播报。要孩子回忆一个词时，提示语里不出现该英文词（连“说 X”也不行）。练习阶段的跟读题由评估结果翻页（见下），老师只负责反应和在没说完整时再帮一次。
- 评估回应（2026-11-11，替代此前“老师调 `record_assessment`”的做法）：每次孩子的输入提交（`input_audio_buffer.committed`，自动和手动划轮都一样）后，应用立即另发一个 `response.create`：`conversation: "none"`（不进入会话，也不产生会话 item）、`output_modalities: ["text"]`（不出声）、自带 `instructions`（`ASSESSOR` 加上绑定目标的描述）、`tools` 只有 `record_assessment`、`tool_choice: "required"`，`metadata` 为 `{ kind: "assess", request, input }`。它和老师的回应同时进行，上下文是整个会话（老师的话、孩子的音频、`[app]` 消息）。判定字段：`result`（correct／close／wrong／not_attempt）、`heard`、`evidence`、`mastered`、`next_action`。评估口径区分作答对错和独立回忆：清楚完整的跟读为 correct＋mastered=false，清楚的独立回忆为 correct＋mastered=true，2026-11-15 起，熟悉目标词的人能认出孩子说的是整个词就为 correct，儿童口音、元音偏差、词尾辅音或 r 未发出不降级；只有开头音、多音节词少一个音节，或听不出是不是目标词时为 close＋mastered=false。heard 能认出词时用正常拼写，认不出才记听到的音，避免口音拼写反过来影响判定；跟读、二选一或有提示本身不降低 result，只影响 mastered。`not_attempt`（提问、要求、闲聊、只说中文、回答的是别的词、噪声）不保存；其余走原有的 `submitAssessment` 事务（目标取绑定目标，`next_card_id`、`next_phase` 固定为空），回执照常推给浏览器，过关情况经 `[app] State` 告诉老师。跟读题的 `next_action` 为 advance／skip 时浏览器翻到下一题；词卡的 `next_action` 只是记录，换卡由老师决定。2026-11-15 起，本通话首次 output_audio_buffer.started 或老师有非空白转写的 completed 回应之前提交的语音不发起评估、不保存、不计跟读；后者是 sideband 缺少出声事件时的兜底，评估回应、取消回应和空白转写不能解锁评估，自动和手动划轮一致；只记 info 日志 assessment before teacher speech ignored，字段仅 sessionId。其他跳过评估的情况：输入没有绑定目标、目标是点图题、目标是词卡但阶段已不是 interactive、本次课已结束。评估回应不在 `active` 集合里，不参与老师回应的串行化和沉默计时，也不转发给浏览器（`forBrowser` 丢弃 `kind: assess` 的事件，否则外放模式会把它当成老师在说话而关麦克风）。失败处理：状态不是 completed、没有工具调用、参数不合规，或提供方直接拒绝了这次请求（`error` 事件）时，记 `assessment failed`（`code`、`tries`）并重发一次，再失败就放弃这次作答的记录；事务拒绝记 `assessment rejected`。`mastered=true` 同时 `next_action=skip` 这种自相矛盾的记录按 advance 保存，不因此丢掉这次作答。成功记 `assessment`（`result`、`mastered`、`saved`、`ms`，不含内容）。老师对这次输入的第一句完整回话存为该作答的反馈（回话和评估谁先完成都可以）。因为评估可能比老师的 `start_practice` 晚到，`submitAssessment` 对词卡目标接受 interactive 和 reinforcement 两个阶段。提供方行为（2026-11-11 付费实测，见 `docs/voice-benchmarks.md`）：这类回应可以和会话内的回应并行；孩子再次开口（VAD 打断）和不带 id 的 `response.cancel` 都不会取消它；它能读到会话里孩子的音频。
- 评估结果写回（2026-11-14）：每份有效课程卡报告（含句子卡、not_attempt，不含失败或正在重试的回应；练习题目标不写）生成一条待写的 `[app] Heard:` system 消息，包含绑定卡的英文、result 和 `JSON.stringify(heard.slice(0, 80))`；not_attempt 则说明上句话不是在尝试屏幕卡。固定指令说明 Heard 指上一条作答，回应新作答按老师自己听到的来；在同一卡的下一步，判 correct 就不再要求修正这个词，判 close／wrong／not_attempt 就不把词当作已结束；换卡后不再评价上一张卡，也不读出或解释评估结论。只保留最新待写结果，经 `syncState()` 在 `active.size === 0` 时追加 `conversation.item.create`，老师回应中途就等它完成或取消后补写，不发 `session.update`、不修改固定指令。同一绑定课程卡连续 3 次 not_attempt 再生成一次对齐提醒：练别的词或课程句子前先 `show_card`，否则回到屏幕卡；同一段连续只提醒一次，correct／close／wrong 或绑定目标变化后重新计数，计数只在本通话内存中。另按词卡 id 在本通话内存中累计已成功保存的 correct＋mastered=false 作答，不读取跨次课的 wordPerformance，换卡后回来接着计数；第 1、3、5… 次、该词尚未过关且尚未收尾时，生成跟读提醒（echo），为下一步提前一次提醒，因为评估比老师的回应晚到：下一问只给中文或情境、不带英文词，问完停下来听；想不起来就换一种帮助再给一次机会，仍想不起来就直接出下一张卡、之后回来，不对孩子说“先停一下”“待会儿再练”。只在这张卡仍在屏幕上时提问，已经换卡则先讲完手上的卡，之后用 show_card 回到这张卡再问。只保留最新待写的 echo，写入前若已收尾或词已过关则丢弃；收尾后仍累计跟读次数，不生成或写入提醒；不按次数判过关，也不自动换卡。2026-11-15 起，另按词卡 id 记录本通话已保存作答中连续未判对的次数：close／wrong 加一，correct 清零，not_attempt 不计也不清零，换卡保留，句子卡与练习题不计。第 4、8、12… 次且收尾提示尚未发出时生成 stuck 提醒：自然说一次正确的词，同一轮 show_card 换词，稍后或下次回来；不要对孩子说“先停一下”“待会儿再练”。写入前必须尚未收尾、词未过关且当前连续计数仍不少于提醒次数，否则静默丢弃。mismatch、echo 与 stuck 分别独立待写，同时待写时依次写 verdict、mismatch、echo、stuck。每次实际写入记一行 info `app note`：仅 `sessionId`、`kind`（verdict／mismatch／echo／stuck）和对应的 `result` 或次数 `count`，不记录 heard 或消息文本。
- 评估方式的沿革：2026-10 的做法是老师在回应里先调 `record_assessment`、结果回来后再说话（靠提示词要求工具先行）；2026-11-11 的真人课上 27 次作答有 18 次模型先说了约 5 秒铺垫才调工具。同日先后试了三种“先说后调”的约定（完整反馈后声明 `turn_complete`、一句短反应后调工具、再限定短反应的词数和语言），等待时间能降下来，但调工具前那句话的内容靠提示词管不住（四种措辞四种结果，数据见 voice-benchmarks「Realtime 评估顺序对比」），因此改成上面的评估回应：说话的回应里没有评估工具，铺垫没有出现的位置。
- 沉默提醒（仅自动轮次模式）：`semantic_vad` 只在孩子说话后才创建回应，孩子不出声老师就会一直等。常量 `SILENCE = { nudgeAfterMs: 10 秒, maxNudges: 2 }`（可经构造选项 `silence` 注入测试）。条件：未暂停、本次课已开始且未结束、不在告别、孩子没在说话、没有进行中的回应或待发请求、老师音频已播完（`output_audio_buffer.stopped/cleared`）。满足后开始倒计时，期间任何一项不满足就取消；到点仍满足则排入一条 `nudge` 请求（`tool_choice: none`，一句话把问题变简单或再邀请一次，不算作答），记 `silence nudge` 日志。连续最多 2 次，孩子说话、点选图片或点“再讲一遍”后计数清零；`nudge` 不在 `SURVIVES_SPEECH` 里，孩子开口就丢弃。手动划轮模式不启用。连续三次纯工具续答后，下一次续答禁用工具，防止无进展循环。
- 应用回应串行化：有回应进行中、孩子正在说话或暂停时不发 `response.create`；孩子开口会丢弃排队中的续答／反馈（题目示范和告别保留），VAD 回应自行接话。抢不到会话（`conversation_already_has_active_response`）的应用请求重新排队。课堂达到 done（工具或应用操作）时只排一次告别，排在工具续答之后。
- 打断机制的踩坑结论（2026-11-01，付费实测）：曾尝试应用接管打断（`interrupt_response: false`＋1.5 秒重叠计时＋未答输入补发），已移除。实测发现 WebRTC 下提供方在 `input_audio_buffer.speech_started` 时立即清空未播的老师音频，与 `interrupt_response` 无关（提供方已知行为）；`interrupt_response: false` 只是让回应继续生成、工具照常执行，音频被截断而回应没停，比自动打断更糟。语义 VAD 报告语音结束又晚 1 到 2 秒，计时无法区分回声与真插话。因此回到提供方自动打断，应用不再有打断计时、`interrupt` 推送、`interruptPlayback` 端口方法、`reply` 请求。应用侧只保证：被取消（cancelled）回应中的工具丢弃；应用请求撞上进行中回应时（`conversation_already_has_active_response`，非 followup）重新排队。
- 一次课（sitting）计时（2026-11-01）：一通 Realtime 通话从开场到告别是一次课，课程进度跨次课按断点保存，不改库结构。`NaturalConversation` 只计未暂停的通话时间（暂停时累计并停表，恢复重新计时），常量 `SITTING = { wrapUpMs: 10 分钟, goodbyeMs: 14 分钟 }` 集中定义。收尾点追加一条 `[app]` system 消息（把当前词收尾、带孩子回忆今天练过的词，然后调用 `end_sitting`，不要自己告别，不要说整门课完成），不发 `response.create`、不 `session.update`，下一次回应自然遵循，提示缓存不受影响。结束由模型决定（`end_sitting`）：固定工具，无参数，仅在收尾点之后、本次课与课程都未结束时有效，否则按既有 reject 路径返回 `SITTING_NOT_ENDING`，状态不变。成功时与告别点走同一条路径：立即标记本次课 ended / farewell,停止新教学与 followup;等 `assessing` 清空或 `END_ASSESSMENT_WAIT_MS`(4000 ms,构造时可注入 `assessmentWaitMs`)到期,在最后评估回执发布后排入唯一一条 `goodbye` 请求（与完成告别同属 `SURVIVES_SPEECH`，孩子说话也不丢）、通过 `{type:'sitting-ended'}` 通知浏览器,再泵出告别回应；评估请求被拒也会检查收尾条件,close 会清掉等待定时器；该工具调用不触发常规工具后续回应（告别请求就是它的后续），所以不会重复告别也不会循环。告别点（14 分钟）停止教学,同样最多等 4 秒评估后再告别，两条路径共用 `farewell` 标志，先到者生效且只生效一次；阶段不变（interactive 或 reinforcement），断点本来就在每次提交时落库，下次进入走既有续课。整门课先完成则只出现完成告别（与完成告别也共用 `farewell` 标志，互相排斥）。测试用缩短计时：设置 `REALTIME_TEST_SITTING_MS=<收尾ms>,<告别ms>` 时，该进程的第一次通话使用，后续通话恢复正常（让同一冒烟能在续课后跑完整课）。
- 续课开场（2026-11-01，2026-11-14 补齐首轮提问）：续课的 opening 提示带上之前已过关的词（最多 8 个）；有已过关词时，要求问候一句并在同一轮用 `show_card` 放上第一个要回忆的词卡，工具结果回来后用新情境提问，再一次一张卡回忆其中 2 到 3 个，允许提示，忘记不算失败，然后开始新教学。避免只问候后等待沉默提醒；回忆的作答绑定正确的屏幕卡，已过关的词答不上来不会取消过关。首次开课和无已过关词的续课仍是问候一句、然后教当前卡；学词卡的英文保持可见。
- 课堂状态（阶段、屏幕、整门课剩余未过关的词、已过关、已过题）以 `[app] State:` system 消息追加到对话末尾（措辞：剩余词是整门课范围，本次只学约 4 到 6 个，不要赶进度，也不能静默放弃某个词；已过关指整门课至今），不再用 `session.update` 改指令（2026-10-30）。提示缓存只命中与上一次回应完全相同的前缀，指令和工具位于最前，改一次指令会让其后整段对话失去缓存（音频输入未命中 $32 对命中 $0.4／百万 token）；旧做法每次切卡和每次工具提交都会改指令。状态只在两次回应之间写、内容变化才写；老师说话中途的切屏等该回应结束（含被打断）后再写。评估结果、不一致提醒与跟读提醒同样复用这一写入边界，独立于 State 内容是否变化。指令和工具整通电话固定，指令声明“最近一条 State 为准”。
- 上下文截断：会话配置 `truncation: { type: 'retention_ratio', retention_ratio: 0.8 }`（已对 `gpt-realtime-2.1` 实测接受）。默认 `auto` 在超窗后每轮只删刚好够的旧条目，前缀每轮都变、缓存每轮失效；改为超窗时一次删到 80%，之后较长时间不再截断。未设 `token_limits.post_instructions` 上限：一节课是否会撞窗、缓存命中率多少，要以真人课 `token_usage.realtime` 为准再决定。教学进度由应用持久化，被截掉的早期对话不影响进度。

回执带 `revision`，浏览器按 revision 单调应用（选词结果既在 HTTP 响应也在 SSE 中出现，只生效一次）。每个已提交的作答，浏览器另发一次 `answer-result`（`cardId`、`via`: voice|choice、`result`、`mastered`、可选 `quizId`、`revision`），供表现层（单词大战）消费：学词阶段的课程卡评估按被评估的卡发出（首次跟读正确是 `correct`＋`mastered=false`，孩子不靠提示自己说出才是 `mastered=true`）；跟读题对应其句子卡，选图题对应正确答案卡且 `via=choice`，两者 `mastered` 恒为 false。练习题的流程控制仍只看 `quiz-result`。选词由应用按课程答案判定后，把结果交给模型简短反馈；跟读句子由评估回应判定，结果为 advance／skip 时翻到下一题。题目示范在对应 metadata（`kind=present-quiz`、`quiz_id`）的回应播完（stopped/cleared，或无音频完成）后才解锁选项，最长 30 秒兜底。重讲按钮只在安静时可用；暂停会禁用麦克风轨道、清空未播音频并取消进行中的回应，恢复后继续。课堂完成后禁用麦克风，等告别播完（最长 20 秒）再结束通话，页面停在完成页。一次课结束（课程未完成）复用同一收尾流程（`sitting-ended` 事件触发 `finish`：禁麦、等告别播完、结束通话），`PhasedLessonView` 在非战斗时立即、战斗时等最后一击的 1800 ms 展示期后显示“今天先学到这里 / 进度已保存，下次继续”页，不显示课程完成；“继续上课”重建课堂，再次开课从断点续上。

`realtime/teaching.ts` 经既有 SQL helper 事务写 interaction、word_performance、lesson summary 与 course_progress，提交后才替换内存。correct累计尝试和正确，close/wrong只累计尝试，off_topic/silence不累计；model mastered写实际卡片完成状态，不编造cardCorrectCount或park字段；skip保留未完成。quiz correct写passedQuizIds。词卡评估要求目标是课程卡且阶段为 interactive 或 reinforcement（评估回应可能比老师的 `start_practice` 晚到），目标与输入的对应由 NaturalConversation 保证（可能落后于刚提交的切卡）。老师对该输入的第一句完整回话写回这条交互记录，不重奖。断点沿用旧序列化结构，两模式计数不互相伪造；星级仍基于真实已提交尝试比例。

`SessionStore.save` 同时使同孩子同课程旧会话失效并终止其连接，进程内注册表在 Next 路由间共享。新旧模式旧提交／迟到end均不可覆盖新断点。恢复阶段为 reinforcement/done 且所有题已过而词未完时，回 interactive剩余词；进入reinforcement没有待做题时直接done。phase变更也事务落断点。done为本堂结束，课程completed仍必须全部word已掌握且quiz全过。

v6 additive migration为lesson_logs增加lesson_mode，旧行默认legacy。真实Realtime usage存token_usage.realtime，含模型、音频／文本／缓存明细和完整性标志。自然对话中回应由 VAD 自动创建，因此在 sideband 收到 `response.created` 时持久标记 pending，`response.done`（按 id 首次）写入 usage；通话结束时仍有未完成回应、或提供方异常断开，均标记不完整，不按零价格显示。记录和报告标明模式及模型评估，token价格估算与账户抵扣分开。

生命周期：退出先释放本地资源（关数据通道、`pc.close()`、停麦克风轨道、断开 audio），再发小型 keepalive `end`，最后取消 SSE。服务端 end／SSE 取消／请求 abort 都会关闭 sideband 并调用 `POST /v1/realtime/calls/{id}/hangup`；仅关 sideband 不会结束 WebRTC 媒体。实测浏览器单独关 peer 也会在约 2.6 秒内结束提供方通话，此时 hangup 返回 404（已结束）。提供方断开、sideband 出错或空闲 10 分钟：标记用量不完整、向浏览器发错误、使两个注册表失效；前端释放麦克风并提示从已保存进度重新进入课堂。迟到的提供方事件在失效后不再处理。

收藏与游戏开关（2026-11-10，单词大战的服务端部分）：回执的 `progress.collectedCardIds` 是这个孩子在这门课里自己想起来过（过关过）的全部词卡，按课程顺序；跟读正确只算练过，不收集。开课时由 `seedCollection`（`realtime/teaching.ts`）从历史推出（`interaction_logs` 中 mastered 的目标、`word_performance` 中 rc_cleared=1 的词，后者是原有课堂的过关记录），再并上当前已过关的卡；断点标记为已完成的课程视为全部收集。通话中词卡评估为 mastered 时加入，句子卡不加。历史记录从不删除，所以“从头复习”覆盖断点后收藏不减少，不改库结构，也不写进断点快照。`start` 请求可带 `game: true`（浏览器的单词大战开关）：仅此时把 `GAME_RULES`（`realtime/conversation.ts`）追加到固定指令末尾，告诉老师整节课照常教、战斗只在收尾时出现，并要求老师只为孩子说出的词喝彩、不自己宣布打中或获胜（打中由应用按评估结果演出）；整通电话不变，不影响提示缓存。收尾点的 `[app]` 消息在游戏开着时换成战斗版（`WRAP_UP_BATTLE`）：把当前词收尾，再在宣布捣蛋鬼抢走今天的卡的同一轮 `show_card` 放出第一个回忆词，此刻才切战斗；随后逐个回忆今天练过的词，每个词先 `show_card` 再问、自己不先说出英文、想不起来就给提示或示范后再试一次、约三分钟后 `end_sitting`（每次作答由评估回应判定，不靠提示说出才 `mastered=true`）；收尾点仅在游戏开着且为 interactive 时记下待开战，第一次成功 `show_card` 先发布换卡回执，再经 SSE 发一次 `sitting-wrap-up`，浏览器据此切到战斗画面并以此刻作答历史取 `stolen` / `from` 快照；没放卡就结束则不发开战事件。战斗画面由浏览器根据 `answer-result` 自行演出，服务端不保存战斗演出状态，仅累计战斗开始后成功保存的评估作答、correct 和 mastered 数，供 sitting end settled 日志诊断。mock 在战斗版收尾后把 `attempt` 当作一次回忆作答（评估回应记 mastered，老师换到另一张已过关的卡），`chat` 仍触发 `end_sitting`。

`/api/realtime` 严格校验loopback Origin和孩子／会话归属；请求体限 100KB（SDP ≤ 64KB），同一课堂只允许一次 connect。提供方 calls 请求 15 秒、sideband 握手 10 秒、hangup 10 秒。`VOICE_MOCK=true` 时 `transport='mock'`：不建 WebRTC，`realtime/mock.ts` 以与真实 sideband 相同的事件形状驱动同一 NaturalConversation，并由 `mock-speech` 动作（仅 mock 可用）模拟孩子说话；其固定判对只用于联调，不是模型质量证据。

配置：旧模式isConfigured保留；Realtime只看OPENAI_API_KEY。入门门槛任一模式就绪即可，开课时分别检查实际模式。App配置写入独立openaiApiKey/realtimeModel，空值或打码保留密钥，重启加载；模式偏好localStorage（`eduagent.classroomMode`）不触发重启；课前页工具栏下方用与主导航同款的分段控件（`role=radiogroup`）选择，开课后只显示当前模式。设置连接测试（`connection.ts`）建立真实会话并session.update，不生成回应。日志仅记录动作、标识和安全错误码，不记音频、凭据、转写或完整提供方错误正文。

自动化入口：`realtime-browser-smoke.ts`。`--sitting` 需要服务端以 `REALTIME_TEST_SITTING_MS=<收尾ms>,<告别ms>` 启动（mock 用 `8000,14000`；该变量对调用方自建的真实测试服务器同样生效，打包 App 不设置）：mock 在收尾消息后用作答触发 `show_card` 进入战斗,再一次回忆断言打中,随后用 chat 调用 `end_sitting`（走工具路径；告别点路径由单测覆盖），第一次课结束，断言通话结束、结束页显示“进度已保存，下次继续”、麦克风释放、课程未完成，然后重新进入同一课程从断点续上并跑完整课。`--mock --full` 在真实 Chrome 页面（或 `--electron-dev` 开发壳）跑整课：按请求切卡、逐词作答、选词、跟读、完成、通话结束与单轨道释放。`--live` 用真实 Realtime：麦克风轨道替换为 `MediaStreamTrackGenerator`，按需写入合成语音 PCM，验证老师说话时插话切卡且被打断卡不计尝试、真实作答保存、"慢一点"不计尝试、打断长回复（提供方自动打断，字幕标“…”）；`--live --full --resume-short --db <临时库>` 先用 `realtime-seed-checkpoint.ts` 写入只剩两词和两题的断点，再跑真实短整课到 completed。自动化 Chrome 加 `--disable-audio-output`（部分主机的真实输出设备会让 AudioContext 时钟停走）。合成成人音频与 fake media 不替代儿童真实发音、实体回声或扬声器体验验收。

损坏断点在Realtime start同样返回409 INVALID_COURSE_PROGRESS，创建会话之前退出并保留原记录；前端显示数据读取错误。已有完整usage但没有该模型费率时显示暂无估价，不冒充用量缺失。

Realtime老师字幕以提供方 response id 作为messageId，转写delta在控制器内累计，同一回应在SubtitleLog原气泡更新；被打断的回应在原气泡末尾加“…”。孩子侧只显示评估回执中的模型自述（标“模型听到”），未评估的话不出字幕。没有messageId的旧模式事件行为不变。

### 手动划轮原型开关(实验性，默认关闭，2026-11-01)

问题：WebRTC 下提供方的服务端 VAD 一检测到孩子开口就清空未播的老师音频，孩子轻声跟读示范也会打断老师。原型验证“由应用划轮”：`REALTIME_TURN_MODE=manual` 时会话配置 `turn_detection: null`（关闭服务端 VAD），默认（`auto`）行为不变，仍是上面的 `semantic_vad`。`/api/settings` 返回的 `realtimeTurnMode` 是**生效值**（供测试脚本与设置页确认），`values.realtimeTurnMode` 是已保存的设置。

- 开关来源（2026-11-01 起 App 内可开）：设置 → Realtime 分区的开关「实验：示范时跟读不打断老师」，默认关，随 `settings.json` 的 `realtimeTurnMode`（`auto`|`manual`）保存，走普通保存流程（保存后 server 以退出码 75 重启，下一节课生效）。生效优先级由 `getRealtimeTurnMode()`（`src/lib/settings/store.ts`）决定：env `REALTIME_TURN_MODE`（`manual`|`auto`，开发/测试覆盖）> App 模式下 `settings.json` 保存值 > `auto`。每次开 Realtime 会话（`classroom-session.ts`）与响应 `start` 时现读，不缓存，所以改设置只影响下一节课，不影响正在进行的通话。Web 开发模式设置页只读，开关禁用，开发者用 `.env.local` 的 `REALTIME_TURN_MODE=manual`。env 覆盖保存值时设置页显示一行说明。冒烟 `--manual-turn` 可用 env 启动，也可用 `EDUAGENT_APP=1 EDUAGENT_SETTINGS_PATH=<临时 json>` 启动（dev 模式下 `server.ts` 仅在生产构建才读 standalone 配置）并在 json 写入 `realtimeTurnMode: "manual"`。

- 信号入口：`POST /api/realtime {action:'speech', phase:'start'|'end', sessionId, learnerId}`，与其他动作同样校验孩子归属，转给 `NaturalConversation.childSpeech(phase)`；非 manual 模式返回 404 `NOT_FOUND`。`end` 可带 `voicedMs`（浏览器量到的有声时长，不含检测器收尾等待）。信号由浏览器本地 VAD 发出（见下）。
- 策略（常量集中在 `src/lib/realtime/manual-turn.ts` 的 `MANUAL_TURN`，服务端与浏览器共用）：`start` 时记下此刻呈现的目标（`input_audio_buffer.committed` 的 item 绑定到它，评估回应照常针对它创建），孩子说话中沿用原有排队规则（不发新回应，丢弃排队的续答）。若老师在忙（有回应进行中或音频仍在播，由 sideband 的 `output_audio_buffer.started/stopped/cleared` 判断），开 1500 ms 重叠计时：到时仍在说话才算真打断，先 `response.cancel`（仅回应进行中时），再经 sideband 发 `output_audio_buffer.clear`，记录 1 秒内是否收到 `cleared`；没收到则推送 `clear-output` 事件，让浏览器经数据通道发同一条命令。`end` 后再等 `commitAfterSilenceMs`（700 ms）才算这一轮结束（停顿容忍，见下）；结束时若老师在忙（短跟读），登记待提交的一轮，老师空闲（无进行中回应且音频已 stopped/cleared，15 秒兜底）后再 `input_audio_buffer.commit`，收到 `committed` 后 `response.create`（请求种类 `commit`，经同一请求泵串行；该回应绑定刚提交的输入）；老师空闲则立即提交。待提交的一轮排在其他排队的应用回应之前。
- 停顿容忍：`end` 不立刻提交。窗口内（700 ms）来新的 `start` 取消待提交，视为同一轮继续（一轮只提交一次，目标取第一个 `start` 时呈现的目标）。浏览器 VAD 自己已等 500 ms 才报 `end`，所以孩子停住到老师回应前总静默约 1.2 s（回应延迟另计）；自动划轮使用 semantic VAD eagerness `medium`，由提供方按语义判断结束，最长等待 4 秒。
- 打断阈值按有声时间：重叠计时 1500 ms 只累计有声时长，`end` 到下一个 `start` 之间的静默不算；`end` 暂停计时，窗口内再 `start` 时按剩余时间续上（说话中间有小停顿仍会打断，一个短跟读加一句话不会误打断）。有效数字：`start` 信号在 VAD 检出语音约 200 ms 后发出，所以孩子从开口算起持续说话约 1.7 s 才打断老师；跟读示范的 0.3 到 0.6 s 短词只量到 0.1 到 0.4 s 有声时长，不会打断。
- 浏览器 VAD（`src/lib/voice/manual-turn-vad.ts`，仅 manual 模式，懒加载）：`@ricky0123/vad-web` 0.0.31，Silero v5 在 onnxruntime-web（wasm，单线程，无需跨源隔离）上，直接吃课堂唯一的那路回声消除后的麦克风流（`getStream` 返回现有流，`pauseStream` 不停轨，冒烟断言仍只有一次采集）。参数在 `MANUAL_TURN.vad`：`minSpeechMs` 200（`onSpeechRealStart` 才发 `start`，咳嗽和点击当作 misfire 丢弃）、`redemptionMs` 500（静默满 500 ms 发 `end`，`voicedMs` = 现在 − start − 500）、阈值 0.4/0.25。暂停课堂时 VAD 只停止上报（麦克风轨已静音），结束、`finish`（关麦时）和致命错误销毁 VAD 与音频上下文。`start`/`end` 通过一条串行链发出，保证服务端按序收到。
- VAD 资源：模型、worklet 与 onnxruntime wasm（共约 18 MB）由 `scripts/copy-vad-assets.mjs` 从 node_modules 拷到 `public/vad/`（git 忽略；`predev`/`prebuild`/`prestart` 与 `desktop/scripts/stage.mjs` 都会跑），浏览器按绝对路径 `/vad/…` 取，开发与打包版同源，没有 CDN。直接用 `tsx server.ts` 启动的人需先 `pnpm vad:assets`。
- 浏览器界面状态：manual 模式没有提供方的 `speech_started/stopped`，`listening` 来自本地 VAD（说话中或 `end` 后的 700 ms 窗口内），窗口结束进入 `thinking`，直到回应开始；`start` 响应里的 `turnMode` 决定是否启动 VAD，auto 模式派生不变。
- 缓冲清理：没有孩子说话、也没有待提交时，每 2 秒发一次 `input_audio_buffer.clear`（WebRTC 下麦克风持续写入输入缓冲）；`start` 到提交之间从不清。代价：`start` 信号延迟内的开头几百毫秒语音可能被上一次清理丢掉。
- 其余（工具、一次课计时、`end_sitting`、状态消息、输入绑定规则、cancelled 回应的工具丢弃）不变。mock（`realtime/mock.ts`）在该模式下不自动划轮，只在 `response.create` 时回应。自动化：`realtime-browser-smoke.ts --mock --manual-turn`（服务端需带该环境变量，且已 `pnpm vad:assets`）：脚本把合成语音写进假麦克风轨，由页面 VAD 产生信号，不再由脚本发信号；mock 仍靠 `mock-speech` 告知这一轮是什么话；`results.json` 的 `vadTimings` 记录开始/结束检测延迟。真实 API 的结论待付费实测，见本地 `docs/features/realtime-teaching-interaction/manual-turn-spike.md`。

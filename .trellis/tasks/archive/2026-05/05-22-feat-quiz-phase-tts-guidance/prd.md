# Feat: Quiz phase TTS guidance (题面朗读 + 跟读句子先听 + 答错 hint)

## Goal

修复 2026-05-22 实测课报告 #6 — reinforcement 阶段(pick-word + repeat-after-me 共 8 题)全程无 TTS 引导。本 task 给两类 quiz 加静态 TTS 朗读题面、答错重提示、句子跟读前先朗读句子原文,**不走 LLM**(避免引入 state-sync task 修过的循环 bug)。

参考报告: [`docs/lesson-reports/2026-05-22-427f287b.md`](../../../docs/lesson-reports/2026-05-22-427f287b.md) — n=61-70 全部 `ai=""`,用户复述 #13/#14。

## What I already know

### 现有 quiz 实现状态

- `QuizPickWordFrame.tsx` (61 行) — 渲染 4 张图 + 中文 prompt 气泡。**0 处 TTS 调用**
- `ReinforceFrame.tsx` (99 行) — 渲染英文句子大字 + 中文翻译,按空格 ASR。**0 处 TTS 调用**
- `ReinforcementFlow.tsx` (72 行) — `idx` 推进 + 提交 `/api/chat?action=quiz-answer` 仅作 SQLite 记录,retries < 3 停在原题但**无任何"再听一次"提示**

### LessonController 已有的 TTS

- 私有 `this.tts` 已在 startLesson 长连(`tts.open()`)
- 三步 API:`tts.startSession(sid) → tts.sendText(text) → tts.finishSession()`
- `tts.on('session-finished')` 回调可用于 Promise 包装等播放完成
- 控制器有 state machine,quiz 期间 state 不在 'awaiting' / 'listening' / 'speaking' 主线,需要 speakStatic 内部自处理 state 不冲突

### 数据可用(无须 LLM)

- `quiz.prompt` — pick-word 中文题面写死
- `quiz.targetText` — repeat-after-me 英文句子
- 对应 `course.cards[].english` — pick-word 的目标英文词,通过 `quiz.correctCardId` 查到

### server 端 quiz-answer 路径

`/api/chat?action=quiz-answer` 当前只做记录,不调 LLM 不生成 speech。本 task **保持服务端路径不变**,所有 TTS 触发在 client 端。

## Requirements

### R1 — LessonController 加 `speakStatic`

文件: `src/lib/voice/lesson-controller.ts`

新增 public:

```ts
async speakStatic(text: string): Promise<void>
```

- 内部:用新 sid 调 `tts.startSession + sendText + finishSession`,返回 Promise 在 `tts.on('session-finished')` 解析
- **state 处理:** speakStatic 期间设新 state `'quiz-speaking'`(或复用 'speaking' 但加 flag);结束后回到 'awaiting'
- **错误处理:** TTS error 时 Promise reject,调用方需 catch(主要为 quiz UI 解锁兜底)
- 不与主线 SSE 流的 `tts.startSession` 冲突 — reinforcement 阶段不会有 LLM-driven 的 speaking,所以不会撞 session

### R2 — pick-word 朗读"中文 prompt + 英文目标词" (方案 N)

文件: `src/components/lesson/QuizPickWordFrame.tsx`

- mount(`useEffect`)时,从 `course.cards` 用 `quiz.correctCardId` 查到 `correctEnglish`
- 调 `controller.speakStatic(`${quiz.prompt} ${correctEnglish}. ${quiz.prompt.replace('小狗|小猫|...','...')}`)`
- 简化为模板:`"${quiz.prompt} ${correctEnglish}."`(老师讲完中文 prompt + 英文目标词就够)
- 实现细节:**实施时由 sub-agent 决定**,只要朗读包含 quiz.prompt 中文 + 英文目标词

### R3 — repeat-after-me 朗读 targetText + 锁空格直到播完 (方案 T1)

文件: `src/components/lesson/ReinforceFrame.tsx`

- mount 时调 `controller.speakStatic(quiz.targetText)`
- 添加 `const [hasHeardPrompt, setHasHeardPrompt] = useState(false)`,Promise resolve 时 setTrue
- `canHold` 改成 `(state === 'awaiting' || state === 'listening') && hasHeardPrompt`(在原条件上 AND `hasHeardPrompt`)
- Q5 L1 lock:speakStatic 期间空格 disabled

### R4 — 答错 hint 模板 (方案 H1)

文件: `src/components/lesson/ReinforcementFlow.tsx`

- 当 `retries > 0` 时,在显示题面前调 `controller.speakStatic(`再听一次: ${current.prompt || current.targetText}`)`
- pick-word 用 `quiz.prompt`,repeat-after-me 用 `quiz.targetText`(都从 current 拿)

### R5 — UI lock 期间 Cat speaking 动画 (方案 L1)

文件: `QuizPickWordFrame.tsx` + `ReinforceFrame.tsx`

- 加 state `isPromptPlaying`,speakStatic Promise 期间为 true
- pick-word:`isPromptPlaying` 期间 PictureCard 的 `onClick` 不响应(传 noop 或 disabled)
- repeat-after-me:已通过 hasHeardPrompt gate(R3)
- Cat mood 在 `isPromptPlaying` 时显示 `'speaking'`(若 Cat 组件支持;否则用 happy + 加 CSS 嘴动画 — 待 sub-agent 实施时确认 `src/components/magic/Cat.tsx` 现有 mood enum)

### R6 — 单测

- `lesson-controller.test.ts`(或新建)测 `speakStatic`:mock tts,断言 startSession/sendText/finishSession 顺序 + Promise resolve 时机 + error 时 reject
- pick-word 朗读文本生成的纯函数抽出来单测(给 quiz + correctCardId + course → 返回文本)

## Acceptance Criteria

- [ ] **AC1** `pnpm test` 全绿;`speakStatic` 单测覆盖 happy / error / dedup(若同时调两次)
- [ ] **AC2** `pnpm exec tsc --noEmit` 干净
- [ ] **AC3** 手动跑 animals reinforcement(无法自动化 UI,仅 sanity check):
  - 每题进入听到题面朗读 — pick-word 听到 prompt + 英文,repeat-after-me 听到英文句子
  - repeat-after-me 朗读期间按空格无效,朗读完空格变亮
  - 错答一次后听到 `"再听一次:..."` 重读
  - Cat 在朗读期间显示 speaking 状态(嘴动或别的视觉反馈)
- [ ] **AC4** `docs/architecture.md` 第 65/67 行 QuizPickWordFrame / ReinforceFrame 描述同步补"题面 TTS 朗读 + lock"

## Definition of Done

- 单测全绿 + tsc 干净
- 手动验收 AC3 全部通过
- architecture.md 同步更新

## Out of Scope

- LLM-driven quiz 反馈("说得真好" / "再加油")— 用静态话术替代
- course data 加 `quiz.hint` 字段(用 H1 模板替代)
- pick-word 错答的可视化变化(现有 wrong/correct 状态够用)
- ASR 命中阈值调整
- reinforcement 阶段 `tokenUsage.tts.characters` 统计补全 — quiz-answer endpoint 没 TTS 字段,改服务端 schema 工作量大,P1 处理
- Cat speaking 动画细节(用现有 mood 或最小 CSS 改动;不引入新动画 asset)

## Technical Approach

```
LessonController (new public)
  async speakStatic(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sid = uuidv4();
      const onFinished = () => { cleanup(); resolve(); };
      const onError = (e) => { cleanup(); reject(e); };
      this.tts.once('session-finished', onFinished);
      this.tts.once('error', onError);
      this.tts.startSession(sid);
      this.tts.sendText(text);
      this.tts.finishSession();
    });
  }

QuizPickWordFrame
  useEffect(() => {
    setIsPromptPlaying(true);
    const correctEnglish = course.cards.find(c => c.id === quiz.correctCardId)?.english;
    controller.speakStatic(`${quiz.prompt} ${correctEnglish}.`)
      .finally(() => setIsPromptPlaying(false));
  }, [quiz.id]);

ReinforceFrame
  useEffect(() => {
    setHasHeardPrompt(false);
    controller.speakStatic(quiz.targetText)
      .then(() => setHasHeardPrompt(true))
      .catch(() => setHasHeardPrompt(true));  // 兜底:TTS 失败也别永久锁住
  }, [quiz.id]);

ReinforcementFlow
  // 改成在 retries > 0 时,先 speakStatic('再听一次: ' + ...) 再渲染原题
  // 实现细节由 sub-agent 决定 — 一种方式:在 handleAnswer 的 wrong-but-retry 分支异步触发,setIdx 同 idx 不变以重新触发子组件 useEffect
```

## Decision (ADR-lite)

**Context:** reinforcement 阶段全程无 TTS,小朋友看 4 张图但听不到老师说哪张;句子跟读题不朗读句子原文。

**Decision:**
1. R1 LessonController 暴露 public `speakStatic(text)` Promise — 复用现有 tts 长连
2. R2 pick-word 朗读"中文 prompt + 英文目标词" — 既懂题意又听发音
3. R3 repeat-after-me 自动朗读 + 锁空格直到播完 — 防抢答 + 防 ASR 收 TTS 自播
4. R4 答错时模板 `"再听一次:..."` — 零新数据字段
5. R5 朗读期间 lock UI + Cat speaking 动画 — 统一两类 quiz 体验

**Consequences:**
- 不走 LLM → 不引入 state-sync task 修过的循环 bug
- 增加每题 ~2-3s 等待时间(TTS 播放) — 接受
- Cat speaking 动画用现有 mood 或最小 CSS 改动
- reinforcement 阶段 tokenUsage.tts.characters 统计可能不准(out of scope)
- 后续若要 hint 个性化,course data schema 加 `quiz.hint` 字段即可

## Technical Notes

### 涉及文件
- `src/lib/voice/lesson-controller.ts` — 加 `speakStatic`
- `src/lib/voice/tts-client.ts` — 只读(确认已支持重复 startSession)
- `src/components/lesson/QuizPickWordFrame.tsx` — useEffect 调 + lock
- `src/components/lesson/ReinforceFrame.tsx` — useEffect 调 + hasHeardPrompt gate
- `src/components/lesson/ReinforcementFlow.tsx` — retry 触发 hint
- `src/components/magic/Cat.tsx` — 只读确认 mood enum
- `src/lib/voice/lesson-controller.test.ts` — 新增 speakStatic 测试
- `docs/architecture.md` — §2 模块清单 QuizPickWordFrame / ReinforceFrame 描述更新

### 项目规则约束
- CLAUDE.md "改了状态机 → 同步 architecture.md" — speakStatic 是新公开 API
- CLAUDE.md "测试自动化原则" — speakStatic 纯逻辑必须自动化测;UI 交互手动验收(无可行自动化方案)
- 不能在 commit / docs 出现真实凭据

### 与并行 task 协调
- `feat-asr-course-hot-words-injection` 也改 LessonController(为了在 startLesson + actions flush 调用 setAsrSessionContext)。两个 task 都改 lesson-controller.ts 但改的不是同一段代码 — hot-words 改 startLesson 顶部 + handleSseEvent actions 分支;本 task 加新 method `speakStatic`。**没有冲突,但实施顺序若两个 task 都在 main 上 merge,后一个要 rebase 看一下。**

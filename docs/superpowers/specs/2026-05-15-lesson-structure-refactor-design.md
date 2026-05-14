# 课程结构重构:三阶段(导入 / 互动 / 巩固)

> **设计文档(spec),不是实施计划。** 实施计划由后续 writing-plans skill 在本 spec 通过后生成。
> 本文档与代码同步,以本文为准。后续若 spec 与代码偏离,以代码为事实,回头更新本文档。

## 1. 背景与动机

当前 EduAgent 一节课**只有一种交互模式**:LessonController 7 状态机在 `awaiting ↔ listening ↔ thinking ↔ speaking` 循环,LLM 通过 system prompt 自己决定该讲什么、问什么、检查什么。结果是:

- 孩子还没"看懂"主题,就被问"Can you say X?"
- "孩子开口"和"孩子被检查"两个阶段没有边界,LLM 想到哪问到哪
- 没法判断一节课是否完成了一个完整学习闭环

这个 spec 把心智模型「导入(看懂)→ 互动(开口)→ 巩固(检查)」显式化成代码结构。

最深层原则:**「工具是 Agent 的能力,不是孩子的按钮」**。本次只把三段舞台搭起来,Agent 工具层(放大 / 圈出 / 慢速 / 换问法 / 出新图 / 奖励反馈)是下一个 epic。

## 2. 目标 / 非目标

### 目标(in scope)

- 新增 `Course.phases` schema,表达三阶段结构;本 epic 完成后新标准课程必须带 phases
- 新建 `PhasedLessonController`(包装 LessonController 音频管线,在外面加 phase 状态机)
- 新建 `PhasedLessonView` + 三个 phase 子组件(`IntroPhase` / `InteractivePhase` / `ReinforcePhase`)
- `LessonClient` 进入三阶段实现;不再保留旧课程 v2 fallback
- 实现 `pick-word` 和 `repeat-after-me` 两种 quiz 类型
- 新建 food 示范课走通三阶段,并体现"单词 + 短句"的常规课程目标
- 旧课程 `transportation` / `timeNumbers` 退役并从可见课程列表删除
- 最后 cleanup 删除旧课程数据、旧路由分支、旧 LessonView 入口与相关死引用
- 服务端 LLM prompt 增加 phase context,每个 phase 不同的提示词

### 非目标(out of scope)

- **不重新引入 Agent 工具层**(放大 / 圈出 / 慢速等都不做,下个 epic)
- 不迁移旧课内容到 phases;旧课直接退役,food 是新标准第一课
- 不在本 epic 一开始删除底层 `LessonController` 音频管线;`PhasedLessonController` 仍复用它的 ASR/TTS/SSE 编排
- **不引入 Unit/单元概念**(三阶段是单节课内的)
- 不做 quiz 类型 3-6(拖拽匹配 / 找一找 / 错题回放 / 复述长句),下个 epic
- 不做 phase 之间的进度持久化(同一 session 内三阶段一次跑完;断网/刷新与现有行为一致——session 失效,回首页)

## 3. 三阶段定义

| Phase | 目标 | 孩子的状态 | AI 的角色 | UI 主视觉 | 切换条件 |
|-------|------|----------|----------|---------|---------|
| **introduction**(主题导入) | 让孩子先看懂 | 看、点、听,**不强制开口** | 旁白讲解,逐个点出 cards | 大场景图(餐桌/马路/动物园) | 所有 cards 都被 narrated 过 |
| **interactive**(AI 互动) | 让孩子开口 | 按住空格说,先试目标词,再跟一个短句 | 引导、判定、纠错(v2 完整能力) | 木屋 + WordBook + Bunny + BloomButton | 所有 cards 都 cleared(说对过 ≥ 1 次),或重试 ≥ 3 × cards.length 次兜底 |
| **reinforcement**(强化巩固) | 检查孩子会不会 | 答题(点图 / 短句跟读) | 出题、判定、给反馈 | quiz 关卡(2-4 选 1 题板 / 跟读题) | 所有 quizzes 答完 |

切换由 **PhasedLessonController 规则判定**,LLM 不输出 phase 切换信号。这保证了「孩子不会被 LLM 不可预测地卡在某个阶段」。

## 4. 架构

```
LessonClient.tsx
  └─ PhasedLessonController + PhasedLessonView
  │
PhasedLessonController (src/lib/voice/phased-lesson-controller.ts, 新)
  ├─ 内部持有一个 LessonController 实例(复用 ASR/TTS/SSE 编排)
  ├─ 外层 phase 状态机:idle → intro → interactive → reinforcement → done
  ├─ 监听 controller 的 actions / state 变化判定阶段切换
  └─ phase 切换时调 /api/chat?action=phase-transition,server 切换 prompt

PhasedLessonView (src/components/lesson/PhasedLessonView.tsx, 新)
  ├─ 顶层布局壳 (Bunny / SubtitleBar 跨 phase 共享)
  └─ 按 currentPhase 切子组件:
       ├─ IntroPhase (新)        — 大场景图 + 点图触发发音,BloomButton 灰
       ├─ InteractivePhase (新)  — 复用 WordBook + BloomButton
       └─ ReinforcePhase (新)    — quiz 关卡

src/lib/voice/lesson-controller.ts
  → 暂时作为底层音频/SSE 管线复用,不再作为独立课程路径

src/components/lesson/LessonView.tsx
  → food 全链路验收后在 cleanup 中删除或退役
```

**关键决策:**
- **复用音频管线而非另起炉灶**:PhasedLessonController 内部 own 一个 LessonController,核心 ASR/TTS/SSE 管线只有一份。
- **规则驱动切阶段**:phase 切换由 controller 判定,不靠 LLM。可预测、可测、可回滚。
- **三阶段 UI 独立**:布局差异显著(大图 / 卡片 / 关卡),独立子组件比"if/else 分支"清晰。
- **新标准唯一化**:food 跑通后清理旧课与旧 UI fallback,避免长期维护两套课程路径。

## 5. 数据 Schema

`src/types/course.ts` 新增类型。实现中可先以过渡兼容方式加入,但本 epic 最终状态里 `phases` 是新标准课程的必填字段:

```ts
export type Course = {
  id: string;
  title: string;
  description: string;
  targetAge: [number, number];
  theme: string;
  cards: Card[];
  objectives: { sentences: string[] };
  teachingHints: TeachingHints;
  phases: Phases;
};

export type Phases = {
  introduction: IntroductionPhase;
  interactive: InteractivePhase;
  reinforcement: ReinforcementPhase;
};

export type IntroductionPhase = {
  sceneImage: string;       // 大场景图 URL (如 /images/food/scene.svg)
  sceneCaption?: string;    // 中文说明
  narrationHint?: string;   // 给 LLM 的旁白指南(写入 phase=intro 的 prompt)
};

export type InteractivePhase = {
  // 当前留空,完全使用 cards[] + LLM 自主互动
  // 未来扩展点:对话路径偏好、Agent 工具偏好
};

export type ReinforcementPhase = {
  quizzes: Quiz[];
};

export type Quiz =
  | { id: string; type: 'pick-word';       prompt: string; correctCardId: string; distractorCardIds: string[] }
  | { id: string; type: 'repeat-after-me'; cardId: string; targetText: string };
```

**Quiz 类型(本次只做 2 种):**

| 类型 | 能力轴 | 交互 |
|------|--------|------|
| `pick-word` | 听懂(comprehension) | AI 读 prompt(如 "Where is the apple?"),屏幕展示 1 张目标 + 2-3 张干扰图,孩子 tap 选对的 |
| `repeat-after-me` | 说出来(production) | AI 说 targetText,孩子跟读,沿用现有 ASR + LLM `attempt_assessment` 通路判定 |

常规主题课默认用 `word` cards 承载可视化目标,用 `objectives.sentences` 和 `repeat-after-me.targetText` 承载 1-2 个核心短句。`kind='sentence'` cards 保留给未来时间/数字这类抽象关系课,不作为每节新课的必填项。

## 6. 状态机

### 6.1 顶层 phase 轴

```
idle ─startLesson─▶ intro ─[切1]─▶ interactive ─[切2]─▶ reinforcement ─[切3]─▶ done ─▶ idle
  ▲                                                                                    │
  └────── endLesson(任意 phase 都能立刻退出)─────────────────────────────────────────┘
```

### 6.2 切换条件(规则驱动)

| 切换 | 条件 |
|------|------|
| `idle → intro` | 用户点"开始上课" |
| **[切1]** `intro → interactive` | `introducedCardIds.size === cards.length` **AND** 当前 TTS session-finished |
| **[切2]** `interactive → reinforcement` | (`clearedCardIds.size === cards.length` **OR** `totalAttempts ≥ 3 × cards.length`) **AND** 当前 TTS session-finished |
| **[切3]** `reinforcement → done` | `answeredQuizIds.size === quizzes.length` |
| `任意 → idle` | endLesson |

**如何记录(单一事实源在 server,client 通过 SSE 镜像):**
- `introducedCardIds`:PhasedLessonController 监听 LessonController 的 `actions` 事件(SSE 里的 `show_card`),提取唯一 card_id 累计到客户端 set
- `clearedCardIds` / `totalAttempts`:server `memory.cardProgress` / `clearedCardIds` 是事实源。**server 在每轮 SSE 末尾**(`done` 事件)**追加一个 `progress_snapshot`** 字段(`{ clearedCardIds: string[], totalAttempts: number }`),client controller 读出并更新本地镜像
- `answeredQuizIds`:client 维护(quiz UI 状态),同时通过 `/api/chat?action=quiz-answer` 写回 server(供 lesson-report 用)

### 6.3 各 phase 内部状态

| Phase | 内部状态机 | 实现 |
|-------|----------|------|
| **intro** | greeting → speaking → awaiting → speaking → ...(无 listening) | 复用 LessonController 实例,**禁用 listening**(useSpacebar 在 intro 阶段忽略空格),prompt 切到"逐个介绍 cards"模式 |
| **interactive** | 完整 LessonController 7 状态机 | 复用 LessonController,prompt 切回"互动练习"模式 |
| **reinforcement** | quiz-presenting → quiz-waiting → quiz-checking → (next quiz / done) | 新写 mini 状态机,在 quiz-checking 内 dispatch:`pick-word` 走 tap 判定 / `repeat-after-me` 走 ASR + LLM judge |

### 6.4 切阶段瞬间

1. 当前 phase 的最后一句 TTS `SessionFinished`
2. PhasedLessonController.checkPhaseTransition() 触发
3. POST `/api/chat?action=phase-transition` `{ sessionId, from, to }`
   - server 更新 session.currentPhase
   - server 更新 system prompt(下一轮 LLM 调用基于新 phase 的提示词)
   - 返回 SSE,带 phase 开场白(类似 v2 的 greeting,但 phase-level)
4. UI: currentPhase state 更新 → 旧 phase 子组件 fade-out / 新 phase 子组件 fade-in(约 300ms)
5. 新 phase 开场白 TTS 自动播

## 7. UI 组件

### 7.1 IntroPhase

- 屏幕主体:`<img src={phases.introduction.sceneImage} />`,**占视口 70%**
- Bunny 居左下,姿态 `pose=stand mood=speaking`
- SubtitleBar 底部
- **BloomButton 灰着但保留位置**(避免布局跳变;视觉上明确告诉孩子"现在不用说话")
- **交互**:点 cards 中的某一张(场景图里的 hotspot 区域)→ 触发 LessonController 调 LLM 输出该 card 的 narration(复用现有 SSE/TTS 通路)
- intro 完成后:phase 切换动画

### 7.2 InteractivePhase

- **视觉布局复用现有课堂元素**:SceneFrame cabin + Bunny + WordBook + BloomButton + SubtitleBar
- 直接在 InteractivePhase 内重新组合这些元素,controller 通过 prop 注入。
- `LessonView.tsx` 不再是要长期保护的旧课入口;food 全链路验收后,在 cleanup 阶段删除或退役。
- LessonController 在 PhasedLessonController 里被持有 + 驱动,作为底层 ASR/TTS/SSE 管线。

### 7.3 ReinforcePhase

- 屏幕主体:quiz 题板
- `pick-word` 题:AI 念 prompt → 屏幕展示 2-4 张图 grid(目标 + 干扰)→ 孩子 tap → 检查 → 反馈
- `repeat-after-me` 题:AI 说 targetText → 复用 BloomButton + ASR → LLM 判定 → 反馈
- 底部进度条:`🟢🟢⚪⚪⚪` (2/5 已答)
- 答错处理:正面反馈("不错的尝试,我们再听一次") + AI 重新念 prompt,**不算错题** — 重试不消耗"剩余题数",直到答对或显式跳过

### 7.4 共享元素

| 元素 | 作用范围 |
|------|---------|
| Bunny | 三 phase 全程,姿态/情绪根据 phase + state 调 |
| SubtitleBar | 三 phase 全程,沿用 v2 |
| SceneFrame(cabin variant)| 仅 interactive + reinforce(intro 用全屏场景图替代外框) |
| BloomButton | intro 阶段灰 / interactive 阶段活 / reinforce 阶段仅 repeat-after-me 题活 |

### 7.5 不可见的工具按钮

**三阶段都没有可见的工具按钮**。"放大、圈出、慢速、换问法、出新图"这些是后续 Agent 工具 epic 的能力,本次只确保数据/事件通路留有可扩展空间——`actions` SSE 字段保留,新增 action 类型不会破坏当前实现。

## 8. food 示范课内容

`src/data/courses/food.ts`(新建):

- **cards (6 张 word cards)**:apple / banana / bread / milk / egg / rice;本课不新增 sentence cards
- **目标短句**:`This is a ___.` / `I like ___.`
- **单卡图**:`public/images/food/{apple,banana,bread,milk,egg,rice}.png` — Codex 用 ImageGen 生成儿童友好单体图
- **场景图**:`public/images/food/scene.svg` — 一张餐桌上摆着这 6 样食物;用 SVG `<g id="card-X">` 包裹并嵌入单卡 PNG
- **quizzes (5 道)**:
  - `pick-word × 3`:"Where is the apple?" / "Find the milk." / "Which one is bread?"
  - `repeat-after-me × 2`:"This is an apple." / "I like milk."
- 在 `src/data/courses/index.ts`(或现有 `allCourses` 导出)注册 foodCourse

视觉资源精修不阻塞本 epic,但 food 示范课不再使用字符占位作为最终计划。ImageGen 产出的单体图需要落到 `public/images/food/`,再由 `scene.svg` 结构化组装。

## 9. 服务端改动

### 9.1 Session 模型

- `Session` 增加 `currentPhase: 'intro' | 'interactive' | 'reinforcement' | 'done'`
- 初始化时:`currentPhase = 'intro'`

### 9.2 Prompt 切换

`src/lib/agent/prompt.ts` 根据 `session.currentPhase` 注入不同的 system prompt 段:

- `intro`:"你是 introduction 阶段。逐个指认 cards,每张说一句温和的引入,**不要问孩子能不能说**。每张 card 输出 `show_card` action。讲完最后一张主动停下来。"
- `interactive`:沿用当前 prompt(完整 v2 模式),但要求先练目标词,再自然带一个 `objectives.sentences` 里的核心短句
- `reinforcement`:"你是 reinforcement 阶段。**不再介绍新词**。按 quiz 列表逐题出题,等待客户端答案信号(server 通过 `action=quiz-answer` 传)。"
- 本 epic 最终状态不保留无 phase 课程;若实现过程短暂保留兼容分支,cleanup 阶段必须删除

### 9.3 新 API

- POST `/api/chat?action=phase-transition` `{ sessionId, from, to }` → 切 phase + 返回 phase 开场 SSE
- POST `/api/chat?action=quiz-answer` `{ sessionId, quizId, answer, correct }` → 记录答题 + 返回反馈 SSE

### 9.4 LessonReport 影响

`docs/lesson-reports/` 的报告生成需要扩展:除原有"词汇命中"等指标外,补充"每个 phase 的耗时 / 完成情况"。本次 spec 只确保 session 数据里有 phase 切换时间戳,报告生成的展开放在课后实测之后看。

## 10. 错误处理

| 场景 | 处理 |
|------|------|
| intro 阶段 LLM 漏掉某张 card | 兜底:LLM 停止输出 ≥ 3 秒(TTS session-finished + idle 时长)且 `introducedCardIds.size < cards.length`,controller 主动 POST `/api/chat?action=message` 发送 "请继续介绍下一张" follow-up,最多 follow-up 2 次。仍不行 → 强制切到 interactive(避免死循环) |
| interactive 卡死(孩子说错多次,memory 没推进) | 已有兜底:`totalAttempts ≥ 3 × cards.length` 强制切到 reinforcement |
| reinforcement 答错 | 不算错题,不消耗剩余;正面反馈 + AI 重播 prompt。同一题答错 ≥ 3 次:AI 给出答案("正确答案是 X"),自动推进到下一题(避免卡死) |
| ASR / TTS / LLM 错误 | 沿用 v2 错误处理(SubtitleBar emit error,state 回到 awaiting) |
| phase 切换 API 失败 | 重试 1 次,失败则 toast 提示并停在当前 phase,允许 endLesson |
| 用户中途 endLesson | 任意 phase 立刻 → idle,session 标记 incomplete |

## 11. 测试策略

### 11.1 单测

- **phase 状态机**:`phased-lesson-controller.test.ts` — 抽出纯逻辑(给一组事件,断言 phase 切换正确)
- **quiz 判定**:`pick-word` tap → correct/wrong;`repeat-after-me` ASR 文本 → LLM judge mock 返回 correct/wrong
- **schema 校验**:`food.ts` 满足 Phases 类型(类型测)

### 11.2 集成

- **server prompt 切换**:不同 currentPhase 下 prompt 输出片段匹配预期(snapshot 或 contains 断言)
- **TTS fixture → ASR 模拟孩子说话**:复用 `tests/fixtures/audio/*.pcm`,跑一遍 interactive 全流程 + reinforcement 的 repeat-after-me 判定

### 11.3 E2E

- **Playwright + voice mock**:跑 food 示范课全程 — 模拟点击触发 intro narration 完成 → 模拟孩子说对 N 张 card → 切到 reinforce → tap 答 pick-word → 模拟 repeat-after-me → 课后报告生成
- **关键断言**:三个 phase 都被进入过 / 顺序正确 / 切换条件触发处的状态合法

### 11.4 不在 E2E 范围

- 主观体感(Bunny 动画顺滑度、TTS 音色)
- AI 互动的"教学意图"是否好(LLM 行为质量,留给手测 + lesson-report)

## 12. 完工验收(交给 implementation agent / 自查)

实施完成后,**自动可验证**的清单:

- [ ] `pnpm exec tsc --noEmit` 通过
- [ ] `pnpm test` 全部通过(含新增的 phased-lesson-controller 单测、quiz 判定单测、prompt 切换集成测)
- [ ] `pnpm exec vitest run tests/integration/food-lesson-e2e` 全程跑通(三阶段都被走过 + 最终 phase=done)
- [ ] 跑 `pnpm run dev` + 访问 `/lesson/food` → 三阶段顺序进入 + endLesson 正常退出
- [ ] `/api/courses` 只返回新标准课程(本 epic 完成时至少包含 `food`)
- [ ] 访问 `/lesson/transportation` / `/lesson/timeNumbers` 不再作为验收项;旧课已退役,页面可 404 或不出现在课程列表
- [ ] `/lesson-report` 跑 food session → 报告生成不报错(包含三阶段标记字段)

**手测验收**(不强求 implementation agent 验证,由用户最终决定):
- 三阶段切换的视觉节奏顺不顺
- 食物大场景图清晰度
- pick-word 题板布局合不合理
- 整节课 5-15 分钟跑下来体感

## 13. Codex 课程产出标准

长期课程生产标准已经独立到 `docs/course-authoring-standard.md`。本 spec 只保留与本 epic 直接相关的摘要:

- 常规主题课必须体现 **words + short sentences**,不是只做单词图鉴。
- 默认结构是 `word` cards + `objectives.sentences` + 短句 `repeat-after-me`;不要为了每节常规课强制新增 `kind='sentence'` cards。
- Codex 可以用 ImageGen 生产单卡 PNG,但 `scene.svg` 必须结构化组装,每张 card 保留 `<g id="card-<cardId>">` hotspot。
- 新课必须有课程专属校验:quiz 引用合法、card 图片存在、scene 存在、scene 包含所有 hotspot。
- food 示范课的具体产出以 §8 为准;后续新课以 `docs/course-authoring-standard.md` 为入口。

---

## 14. 后续 epic(本 spec 不做)

- **Agent 工具层**:放大 / 圈出 / 慢速 / 换问法 / 出新图 / 奖励 — 把"工具是 Agent 的能力"原则落地
- **更多 quiz 类型**:拖拽匹配 / 找一找(在大图里点) / 错题回放 / 复述长句
- **跨 session 进度**:phase 完成情况持久化,断网/刷新可 resume
- **场景图精修**:把 ImageGen 单体图进一步统一成正式插画风格

## 15. 相关文档

- `docs/architecture.md`:living doc,本 spec 实施完成后需同步更新 §2 模块清单、§4 状态机、§6 关键决策
- `docs/course-authoring-standard.md`:Codex 产新课的长期标准入口
- `docs/superpowers/specs/2026-05-12-frontend-redesign-design.md`:Bunny 的小院子前端架构(本 spec 在它之上扩 phase 维度)
- `docs/superpowers/specs/2026-05-05-canvas-v2-wordcard-design.md`:v2 cards 数据结构(本 spec 复用)
- `docs/TODO.md`:本 spec 完成后从中划掉相关项,补充后续 epic 链接

# 前端重构：接入 CC 全量新 UI 设计（魔法学院 · 麻吉小猫）

## Goal

把 EduAgent 前端整套替换为设计师 CC 在 `design/2026-05-redesign/` 交付的「手绘绘本风 · 魔法学院」全量设计。**纯前端重写**：不动语音协议、`LessonController` 状态机、课程数据 schema 的核心结构、路由、API、server。

唯一例外是**两处必要的命名级数据改动**（Q3 / Q7），属于"前端术语彻底切换"，不属于"课程内容设计"。

## What I already know

设计资产已复制到仓库 `design/2026-05-redesign/`，包含：

- `HANDOFF.md`（**主交付文档 · 14 节 · 实现 agent 必读**）
- `README.md`
- 8 个 jsx 设计源（`shared.jsx`, `mascot.jsx`, `home.jsx`, `lesson.jsx`, `lesson-flow.jsx`, `journal-parents.jsx`, `app.jsx`, `design-canvas.jsx`, `tweaks-panel.jsx`）
- `EduAGENT.html` 设计画布入口

视觉决策已全部由 HANDOFF.md 定稿，无需在 PRD 重复（见 HANDOFF §1–§3）。

业务流程（不变）：首页 → Intro → 跟读 ×6 → Quiz → Reinforce → Done；独立屏 `/journal`、`/parents`。

## Brainstorm Decisions（7 项已锁定）

| # | 决策 | 说明 |
|---|---|---|
| Q1 | **单任务推进** | 不拆 subtask；按 HANDOFF §11 七步内部 commit。原因：tokens → atoms → PictureCard → 屏幕是强依赖链，拆任务只增调度成本。 |
| Q2 | **rip-and-replace + feature 分支** | 工作分支 `feature/cc-ui-refresh`；允许 commit 中间态半坏；PR 合并前真课跑通。**不**做 `/v2` 并行路由。 |
| Q3 | **`theme` 字段彻底改 `tone`** | `Course.theme: CourseTheme` → `Course.tone: PaletteKey`（`'peach' \| 'butter' \| 'mint' \| 'sky' \| 'lilac'`）；`CourseTheme` 类型删；`progress.courseTheme` → `progress.courseTone`；`food.ts` `theme: 'food'` → `tone: 'peach'`；4 处测试 fixture 同步。 |
| Q4 | **UI-only，food 维持 6 词 0 句卡** | 课程结构调整（扩到 12 词 + 4 句）另开任务。本次用 gpt-img-2 重生成 **6 张**水彩 PNG 覆盖 `public/images/food/{apple,banana,bread,milk,egg,rice}.png`。 |
| Q5 | **设计资产入 repo** | 已复制到 `design/2026-05-redesign/`，commit 进版本；所有 jsonl 引用走仓库内相对路径。 |
| Q6 | **L1 机器 + L2 人工验收，不引入 Playwright** | 自动化端到端留下次。详见下方 **Acceptance Criteria**。 |
| Q7 | **`bunny.*` → `mochi.*` 全 rename** | `bunny.parents.{pin,failcount,lockedUntil}` localStorage key 全部改名；SALT `'bunny-attic-2026'` → `'mochi-loft-2026'`。接受现有 PIN 失效（单用户、重置成本 ≈ 0）。 |

## Requirements

### R1 设计 Tokens（HANDOFF §3）

- `tailwind.config.ts` 注入 HANDOFF §3.1 调色板（paper, ink, rose, butter, mint, sky, lilac, peach, catFur, catGray, catPink, ember 及其 Deep / Shadow 变体）
- `src/app/globals.css` 注入 5 个 Google Web Font（LXGW WenKai TC, ZCOOL KuaiLe, Fredoka, Caveat, JetBrains Mono）+ CSS vars `--font-{zh,display,en,en-script,mono}`
- `src/app/layout.tsx` 全局挂一次 `<SVGDefs />`（HANDOFF §3.4 / `shared.jsx`）
- `tests/design-tokens.test.ts` 同步更新

### R2 六个原子组件（HANDOFF §11 step 2，源在 `mascot.jsx` + `shared.jsx`）

- `<Cat variant="storybook">` —— **只**移植 storybook 风格，其余 3 variants（CatChubbyQ / CatPapercut / CatInkline）不上线；4 mood（idle / happy / cheer / think）
- `<PaperBg>` —— 纸纹背景容器 + paper-grain 噪点
- `<Star>` —— 状态星
- `<Sparkle>` —— 装饰（必须遵循 `prefers-reduced-motion`）
- `<PaperButton>` —— 通用按钮（替换 `BloomButton` + `ui/Button`）
- `<IllustrationSlot>` —— 图片占位插槽

### R3 核心组件 `<PictureCard>`（HANDOFF §5）

- 3 size: `hero` / `tile` / `chip`
- 7 state: `listening` / `recording` / `correct` / `tryAgain` / `wrong` / `selected` / `idle`
- props 表见 HANDOFF §5；状态视觉差异表见 §5.3
- 所有状态切换 `transition: all 200ms`

### R4 六屏 view 替换（HANDOFF §6）

- `src/app/page.tsx` → 嵌入 `<HomeStudy />`（HANDOFF §6.1）
- `src/components/lesson/PhasedLessonView.tsx` 控制器逻辑保留，view 层切到：
  - `<IntroFrame>`（§6.2 替 `IntroPhase.tsx`）
  - `<LessonMandalaV2>`（§6.3 替 `InteractivePhase.tsx` + `WordBook.tsx` + `QuizRepeatAfterMe.tsx`，跟读合并状态机）
  - `<QuizPickWordFrame>`（§6.4 替 `QuizPickWord.tsx`）
  - `<ReinforceFrame>`（§6.5 替 `ReinforcePhase.tsx`）
  - `<DoneCelebrateFrame>`（§6.6 替 `StickerWord.tsx`）
- `SubtitleBar.tsx` 删除（字幕进 CatSpeech 对话框）

### R5 两个独立屏（HANDOFF §6.7 / §6.8）

- `src/app/journal/page.tsx` → `<JournalPage>`（替 `BookShelf.tsx` + `WordEntry.tsx`）
- `src/app/parents/page.tsx` → `<PINGateFrame>` + `<ParentsPage>`（替 `PinGate.tsx` + `PinPad.tsx` + `StatsCard.tsx` + `SessionRow.tsx` + `SettingsAccordion.tsx`）

### R6 数据 / 类型改动（最小集）

- `src/types/course.ts`:
  - 删 `CourseTheme` 类型
  - `Course.theme: CourseTheme` → `Course.tone: PaletteKey`
  - `IntroductionPhase.sceneImage: string` → 删除字段（新 IntroFrame 不用场景图）
- `src/data/courses/food.ts`: `theme: 'food'` → `tone: 'peach'`；删 `phases.introduction.sceneImage`
- `src/types/progress.ts`: `courseTheme: CourseTheme` → `courseTone: PaletteKey`
- `src/lib/progress.ts`: `courseTheme: course.theme` → `courseTone: course.tone`
- `src/lib/pin.ts`: `KEY_PIN` / `KEY_FAIL` / `KEY_LOCK` / `SALT` 全部 `bunny.*` → `mochi.*`，SALT 改 `'mochi-loft-2026'`
- 删 `public/images/food/scene.svg`

### R7 旧组件物理删除（HANDOFF §8 映射表）

PR 合并前必须删除：
- `src/components/bunny/` 整个目录（Bunny.tsx 等）
- `src/components/scene/` 整个目录（YardScene, AtticScene, CabinScene, GrassScene, StorageScene）
- `src/components/home/LetterCard.tsx` + `LetterCard.test.tsx`
- `src/components/lesson/{IntroPhase,InteractivePhase,WordBook,QuizPickWord,QuizRepeatAfterMe,ReinforcePhase,SubtitleBar,BloomButton}.tsx`
- `src/components/done/StickerWord.tsx`
- `src/components/journal/{BookShelf,WordEntry}.tsx`
- `src/components/parents/{PinGate,PinPad,StatsCard,SessionRow,SettingsAccordion}.tsx`
- `src/components/ui/{Button,Stars,Surface,PinPad}.tsx`

### R8 图片资产（gpt-img-2 生成）

**生成 6 张 1024×1024 PNG**，覆盖 `public/images/food/{apple,banana,bread,milk,egg,rice}.png`。

**统一提示词模板**（Codex 必须用此模板，不要自由发挥）：
> "Soft watercolor storybook illustration of a single {WORD}, low-saturation pastel palette (peach / mint / butter / sky / lilac tones), irregular paper-textured edge with subtle bleed, centered subject taking ~70% of frame, off-white paper background (#FBF5E6) or transparent, child-friendly book illustration style. No 3D rendering, no neon, no high-saturation AI gloss, no shiny highlights, no realistic photography, no English or Chinese text in image."

风格自检：每张出图后跟现有 `apple.png`（写实高饱和、HANDOFF 禁止的反面教材）对比，确认走低饱和水彩方向。如不符合上述提示词的视觉约束就重新生成。

### R9 文档同步

- `docs/architecture.md` 前端架构小节同步（HANDOFF §11 第 6 步要求；CLAUDE.md 强制）
- `docs/course-authoring-standard.md` §3 / §4 / §5 / §6 更新：删除关于 `scene.svg` 必需 / hotspot `<g id="card-...">` 的描述，改为说明"`introduction` 阶段仅需 `sceneCaption` + `narrationHint`，由 `<IntroFrame>` 渲染麻吉 + 锁定 chip 网格"

## Acceptance Criteria

### L1 机器自检（Codex 必须全部绿才能交付）

- [ ] `pnpm exec tsc --noEmit` 零错误
- [ ] `pnpm test` 全绿（含已更新的 `tests/design-tokens.test.ts`、`food.test.ts`、`course.test.ts`、`progress.test.ts`、`LetterCard.test.tsx` 删除或迁移）
- [ ] `pnpm run dev`（background）启动后 5 秒内无 Next.js / Tailwind / 字体 / 模块缺失报错
- [ ] `curl -s http://localhost:3000/ -o /dev/null -w "%{http_code}"` 返回 200
- [ ] `curl -s http://localhost:3000/api/courses` 返回包含 `tone: "peach"` 的 food 课程 JSON
- [ ] `git grep -l "bunny" src/` 无业务代码命中（design 文件夹和 docs/superpowers 历史快照可豁免）
- [ ] `git grep -l "CourseTheme\|courseTheme\|sceneImage" src/` 无命中
- [ ] HANDOFF §8 映射表所列旧组件全部物理删除（`git ls-files src/components/{bunny,scene} | wc -l` == 0）

### L2 人工验收（你 / 你儿子，Codex 交付后接手验）

- [ ] HANDOFF §12 视觉清单 12 条全部勾选
- [ ] 一节 food 真课走通：listening / recording / correct / tryAgain 状态视觉清晰可辨
- [ ] Quiz 1 题答对 + 1 题答错路径都有视觉反馈
- [ ] Reinforce 句型空填填入有色彩差异
- [ ] Done 庆祝页 5 颗星 + 数据 + 双 CTA 出现
- [ ] `/journal` 翻开双页书显示 6 张已学词卡（按 progress db 实际状态）
- [ ] `/parents` 输入新 PIN（4 位）首次设置 → 数据面板显示 stats
- [ ] `prefers-reduced-motion` 模拟下 sparkle 不跳动

## Definition of Done

- L1 全绿
- L2 人工验收通过
- `docs/architecture.md` 前端架构小节已同步
- `docs/course-authoring-standard.md` 已更新（删除 scene.svg 强制要求）
- `feature/cc-ui-refresh` 分支合并到 `main`
- 单独 commit 记录"删除旧组件"，方便回溯

## Out of Scope

- 课程内容扩充（food 6 → 12 词 + 4 句卡）—— 独立任务
- 自动化端到端测试（Playwright / fixture audio E2E）—— 独立任务（**用户已确认未来一定要补**）
- 错误态 / 加载态 / 空状态 / 404 视觉重设计
- 移动端 / 平板触屏适配
- sentence kind card 真实 PNG 生成
- 后端 / 语音协议 / 状态机 / API / server 任何改动

## Technical Notes

### 保留不动的部分（绝对不改）

- `src/lib/{agent,voice,audio,db}/*`
- `src/data/courses/*` 的**业务结构**（card ids, drillParts, quizzes, teachingHints, narrationHint）—— 只改 `theme` → `tone` 命名和 `sceneImage` 字段删除
- `src/app/api/*`
- `server.ts`, `next.config.mjs`

### 推荐实施顺序（HANDOFF §11，Codex 按此 commit 颗粒推进）

1. 建立 tokens + SVGDefs（`tailwind.config.ts`, `globals.css`, `layout.tsx`）+ 更新 `tests/design-tokens.test.ts`
2. 复刻 6 个原子组件（Cat / PaperBg / Star / Sparkle / PaperButton / IllustrationSlot），TS + Tailwind 化
3. 实现 `<PictureCard>` 三 size × 7 state
4. 类型 / 数据改名（`theme` → `tone`，`bunny` → `mochi`，删 `sceneImage`），跑通 tsc + test
5. 逐屏拼装：HomeStudy → IntroFrame → LessonMandalaV2 → QuizPickWordFrame → ReinforceFrame → DoneCelebrateFrame
6. 独立屏：JournalPage / PINGateFrame / ParentsPage
7. 删除旧组件 + 文档同步（architecture.md / course-authoring-standard.md）
8. 生成 6 张水彩 PNG（用 R8 提示词模板）
9. 跑通真课，自查 L1 全绿，交付给用户做 L2

### 已知 stats 字段差异

HANDOFF §6.8.2 用 `weekMin / newWords / streak / accuracy`；现有 `src/lib/stats.ts` 返回 `totalMinutes / totalSessions / totalWordsMastered / last7Days[7]`。Codex 在 `<ParentsPage>` 内部适配映射，**不**改 `stats.ts`（避免触及后端）；缺的字段（`streak` / `accuracy`）若无法从现有 db 派生就显示占位"—"，不阻塞验收。

### 已知 design 源文件覆盖

| 设计文件 | 对应实现 |
|---|---|
| `shared.jsx` | tokens / SVGDefs / PaperBg / Star / Sparkle / PaperButton / IllustrationSlot |
| `mascot.jsx` | `<Cat variant="storybook">` 唯一上线 |
| `home.jsx` | `<HomeStudy />`（备选 HomeMap / HomeWall 不实现） |
| `lesson.jsx` | `<PictureCard>` + `<LessonMandalaV2>`（备选 LessonScroll / LessonTower 不实现） |
| `lesson-flow.jsx` | `<IntroFrame>` / `<QuizPickWordFrame>` / `<ReinforceFrame>` / `<DoneCelebrateFrame>` / `<PINGateFrame>` |
| `journal-parents.jsx` | `<JournalPage>` / `<ParentsPage>` |
| `app.jsx` / `design-canvas.jsx` / `tweaks-panel.jsx` | **只参考**，不移植（设计画布工具，不上线） |

## Future Tasks（用户已确认 follow-up，不在本次范围）

- 自动化端到端测试（Playwright + fixture audio）
- food 课程扩充到 12 词 + 4 句卡（含 spec 更新 / 新词图 / 新 quizzes）
- 错误态 / 加载态 / 空状态 / 404 视觉
- 真实 sentence kind card PNG 生成

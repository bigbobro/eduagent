# EduAGENT 前端重构 · Handoff

> 移交对象: 实现 agent (Claude Code / Cursor / 人类工程师)
> 设计源文件: `EduAGENT.html` + 同目录 `.jsx` 文件 (React + 原生 JSX,不依赖框架)
> 目标代码库: `claude-design-frontend` (Next.js 14 App Router, TailwindCSS, framer-motion)

---

## 0. TL;DR

把 `claude-design-frontend` 的整套 UI 替换成**手绘绘本风 · 魔法学院**主题。视觉锚点是**白底灰斑小猫 (麻吉 / Mochi)** 替代原"小兔子",场景隐喻从"院子+阁楼+储物间"换成"**魔法书房 + 魔法书 + 家长阁楼**"。

技术上没有架构动作:不改路由、不改语音/ASR/TTS 协议、不改课程数据格式、不改 `LessonController` 状态机。**纯前端组件 / 样式重写**。

---

## 1. 视觉方向 (Art Direction)

| 维度 | 决策 | 备注 |
|---|---|---|
| 主题隐喻 | 魔法学院 (Magic Academy) | 替换原"院子 / 阁楼 / 储物间" |
| 整体风格 | 手绘绘本 · 水彩 · 纸质感 | 不要扁平 / 不要荧光 / 不要 3D |
| 调色 | 低饱和马卡龙 + 暖底 | 奶油底 + 桃 / 薄荷 / 雾蓝 / 丁香 / 奶黄 5 色 |
| 主角 | 麻吉 · 白底灰斑小猫 (storybook 风格) | 见 §4 |
| 字体 | LXGW WenKai TC + ZCOOL KuaiLe + Fredoka + Caveat | 见 §3.2 |
| 奖励反馈 | 克制 | 一颗星 + 短气泡,不全屏特效 |
| 设备 | 桌面浏览器大屏 (1280×800 设计基准) | 不做触屏 |

---

## 2. 业务流程 (User Flow)

```
[首页 · 魔法书房]
       │ 点击一本咒语书 (course)
       ▼
[② 招呼 + 今日 N 词预告]
       │ 点击 "我们开始吧"
       ▼
┌─ 对每个单词 (× N,通常 12 个):
│  [③ 跟读练习 · 法阵 v2]
│     - listening (默认)
│     - recording (按 Space)
│     - correct (+1⭐)
│     - tryAgain (柔提示,不抖)
└─ N 个词都过完
       ▼
[④ Quiz · 4 选 1 选词题 (随机出题)]
   - idle / selected / correct / wrong
       ▼
[⑤ 复习 · 句型空填 "I like ___."]
   - empty / filled
       ▼
[⑥ 下课庆祝 (5 颗星 + 数据 + 双 CTA)]
```

**独立功能** (与主流程平行,不在课中触达):
- **魔法书** (`/journal`): 已收集的单词翻阅,按章节 (= 课程) 分页
- **家长阁楼** (`/parents`): PIN 解锁 → 数据面板

---

## 3. 设计 Tokens

### 3.1 调色板

> 实现建议: 直接做成 Tailwind theme extension,或 CSS custom properties。值从 `shared.jsx` 的 `PALETTE` 对象直接抄。

| Token | Hex | 用法 |
|---|---|---|
| `paper` | `#FBF5E6` | 主背景,卡片底 |
| `paperDeep` | `#F4EAD0` | 卡片副底 / hover |
| `paperShadow` | `#E8DDC0` | 卡片投影色 |
| `ink` | `#3D3326` | 主文字 / 描边 |
| `inkSoft` | `#6B5D4A` | 副文字 |
| `inkPale` | `#A89A82` | 占位 / 虚线 |
| `rose` / `roseDeep` | `#F2C7C1` / `#D89991` | 桃粉,装饰 |
| `butter` / `butterDeep` | `#F4DFA5` / `#D9B863` | 奶黄,**当前** / CTA 主色 |
| `mint` / `mintDeep` | `#C9DFC8` / `#7FA77E` | 薄荷,**已完成 / 正确** |
| `sky` / `skyDeep` | `#C8D8E4` / `#6E92A8` | 雾蓝,辅助 |
| `lilac` / `lilacDeep` | `#D8CCE0` / `#A187B5` | 丁香,辅助 |
| `peach` / `peachDeep` | `#F4D2B5` / `#D49A6A` | 桃,**柔错 / 重听** |
| `catFur` | `#FAF6EE` | 猫白色身体 |
| `catGray` / `catGrayDeep` | `#9E9586` / `#6E665A` | 猫灰斑 |
| `catPink` | `#E4ADA8` | 猫耳内 / 鼻 |
| `ember` | `#E47B5A` | 极少用的醒目橙,**只**在最高奖励场景出现 |

**颜色语义** (state → palette):

| State | 用色 | 场景 |
|---|---|---|
| `listening` (默认) | `ink` 描边 | 等用户操作 |
| `recording` | `mintDeep` 描边 + `mint` 光晕 | 按住 Space |
| `correct` | `mintDeep` 描边 + `mint` 光晕 | 答对 |
| `tryAgain` (柔) | `peachDeep` 描边 + `peach` 光晕 | 跟读没过 |
| `wrong` (硬) | `peachDeep` 描边 + 圆 × 标 | quiz 选错 |
| `selected` | `skyDeep` 描边 | quiz 已选,待确认 |

### 3.2 字体

```html
<link href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&family=LXGW+WenKai+TC:wght@400;700&family=Fredoka:wght@400;500;600;700&family=Caveat:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

```css
:root {
  --font-zh: 'LXGW WenKai TC', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
  --font-display: 'ZCOOL KuaiLe', 'LXGW WenKai TC', sans-serif;
  --font-en: 'Fredoka', sans-serif;
  --font-en-script: 'Caveat', cursive;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

| 用途 | 字体 |
|---|---|
| 中文正文 | LXGW WenKai TC (绘本楷感) |
| 中文标题 / 装饰 | ZCOOL KuaiLe (圆润手书) |
| 英文单词 / 句子 (大字) | Fredoka (圆润几何) |
| 英文装饰 / 副标题 | Caveat (手写斜体) |
| IPA / 数字 | JetBrains Mono |

**首屏 fallback 必须可读** — `font-display: swap` 已在 link 里;中文 fallback 用 `PingFang SC` / `Hiragino Sans GB` / 系统楷体,英文 fallback 用系统 sans-serif。

LXGW WenKai TC 文件较大,**首屏不阻塞**:用 fallback 先渲染,字体到了再换。**避免** loading spinner 等字体。

### 3.3 间距 / 圆角 / 阴影

| Token | 值 | 用法 |
|---|---|---|
| 圆角 sm | 8–10px | 标签 / 小芯片 |
| 圆角 md | 14–18px | 二级卡片 / 按钮 |
| 圆角 lg | 22–28px | 主卡片 / 弹窗 |
| 圆角 pill | 999px | 胶囊按钮 / 状态药丸 |
| 描边 default | `2px solid ink` | 卡片 / 按钮 |
| 描边 hero | `2.4px solid ink` | 主卡 / Modal |
| 投影 default | `3px 4px 0 paperShadow` | 卡片 |
| 投影 hero | `5–6px 6–7px 0 paperShadow` | 主卡 |
| 状态光晕 | `0 0 0 4–6px <state>88` | recording / correct / tryAgain |

**全部用 box-shadow 实心偏移**,不用模糊阴影。

### 3.4 SVG defs (必须挂一次,根)

需要在 `<body>` 内挂一个 SVG defs 容器,提供 `paperGrain`, `watercolor`, `wobble`, `softShadow`, `bleed`, `hatch`, `dots`, `paperVignette`。代码在 `shared.jsx` 里的 `<SVGDefs />` 组件,**直接拷过去**。

`PaperBg` 容器附带的 `.paper-grain` `::before` 用 inline SVG data-URL 做噪点叠加,**任何全屏背景都必须套**。

---

## 4. 主角 · 麻吉 (Cat Mascot)

| 属性 | 值 |
|---|---|
| 选定风格 | `storybook` (水彩绘本) |
| 形象 | 白底身体 + 头顶 / 脸颊 / 身体侧灰色斑 + 粉鼻粉耳 |
| 体型 | 圆润,坐姿默认 |
| 4 种 mood | `idle` / `happy` / `cheer` / 可扩展 `think` |
| Mood 区别 | `idle` 圆眼;`happy` `cheer` 弯月眼;`cheer` 加 sparkle 装饰 |

**实现**: 直接把 `mascot.jsx` 的 `CatStorybook` 拷成 `<Cat />` 组件。其它三种风格 (`CatChubbyQ` / `CatPapercut` / `CatInkline`) **不要上线**,只是设计阶段的备选。

```tsx
<Cat size={200} mood="happy" />
```

Mood 在不同场景:
- `idle`: 默认 / 听老师讲 / 招呼
- `happy`: 轻度鼓励 / 选词题中
- `cheer`: 答对 / 庆祝页 / 完成里程碑

---

## 5. 核心组件 · PictureCard

> 这是整个 UI 的"原子",**必须先实现这个再开始拼页面**。

```tsx
type CardKind = 'word' | 'sentence';
type CardSize = 'hero' | 'tile' | 'chip';
type CardState =
  | 'listening'    // 默认
  | 'recording'    // 录音中
  | 'correct'      // 答对
  | 'tryAgain'     // 跟读柔提示
  | 'wrong'        // quiz 选错 (硬)
  | 'selected'     // quiz 已选待确认
  | 'idle';        // 备用,同 listening

interface PictureCardData {
  kind: CardKind;
  en: string;          // 英文,词或整句
  zh: string;          // 中文
  ipa?: string;        // 仅 word kind 显示
  imageUrl?: string;   // 真实图片;无则走 emoji 占位
  emoji?: string;      // review 阶段占位
  tone?: 'peach' | 'butter' | 'mint' | 'sky' | 'lilac' | 'rose';
}

interface PictureCardProps {
  card: PictureCardData;
  size?: CardSize;       // 默认 'hero'
  state?: CardState;     // 默认 'listening'
  onClick?: () => void;  // tile 用
  dimmed?: boolean;      // chip 在 intro 锁定态
  badgeKind?: 'locked';  // chip 角标
}
```

### 5.1 视觉规则 (所有 size 通用)

- **图片区永远正方形** (`aspect-ratio: 1 / 1`)
- **图片在上,文字在下** (垂直 stack,**不允许**横向左右分栏)
- 图片区在卡内**居中**;高度撑满 (`height: 100%`),宽度由 aspect 约束
- 卡片有描边 + 实心偏移投影 (见 §3.3)
- 卡片右上角放"请老师再说"按钮 (`hero` 才有,`tile` / `chip` 不放)

### 5.2 三种 size 具体规格

| 项 | hero | tile | chip |
|---|---|---|---|
| 用途 | 主跟读卡 / 词典详情 | quiz 选项 | 预览 / 词条 / 列表 |
| 卡片 padding | 24/28/22 | 12 | 8 |
| 图片相对卡片 | 撑满可用方形 | 撑满 | 撑满 |
| 英文字号 (word) | 96px | 28px | 13px |
| 英文字号 (sentence) | 56px (自动换行) | — | — |
| IPA | 显示 | 不显示 | 不显示 |
| 中文字号 (word) | 32px | 不显示 | 不显示 |
| 中文字号 (sentence) | 26px | — | — |
| 圆角 | 28 | 22 | 14 |
| 描边粗细 | 2.4 | 2.2 | 1.6 |

### 5.3 状态视觉差异 (统一规则)

| State | 描边色 | 光晕 | 额外饰物 |
|---|---|---|---|
| `listening` | ink | 无 | 无 |
| `recording` | mintDeep | `0 0 0 6px mint88` | 卡内 REC 红点药丸 (hero only) |
| `correct` | mintDeep | `0 0 0 6px mintAA` | +1⭐ 飘标 (hero),星角标 (tile/chip) |
| `tryAgain` | peachDeep | `0 0 0 6px peach88` | 喇叭按钮高亮 + "← 再听一遍" 提示 |
| `wrong` | peachDeep | `0 0 0 4px peachAA` | × 圆角标 (tile) |
| `selected` | skyDeep | `0 0 0 4px skyAA` | 无 |

所有状态切换 `transition: all 200ms`。

---

## 6. 屏幕 · 数据形状

### 6.1 首页 · `/`

**组件**: `<HomeStudy />`

数据:
```ts
interface Course {
  id: string;
  title: string;     // 中文,如 "美食魔药"
  en: string;        // 英文,如 "Food"
  total: number;     // 总词数
  learned: number;   // 已学词数
  color: keyof typeof PALETTE;  // 'peach' | 'mint' | 'sky' | 'lilac'
}

interface HomeProps {
  courses: Course[];          // 最多 4 本展示在书架上,溢出可滚或翻页
  stats: { stars: number; streak: number };
}
```

**布局**:
- 顶部 strip: 课程标题 + 星星总数 + 连续天数
- 左 1.4: 2×2 课程"咒语书"(spine + cover,每本随机微旋 ±1°)
- 右 1: 窗子 + 桌面 + 麻吉坐桌上 + 对话框 + 两个传送门 (魔法书 / 家长阁楼)

### 6.2 招呼 · Lesson Intro

**组件**: `<IntroFrame words={course.cards} />`

数据: 12 张 PictureCardData (从 course 拿)

**布局**:
- 顶部 bar + 进度药丸停在"招呼"
- 左 1: 大麻吉 (size=300, mood=happy) + 黄对话框 "嗨!今天一起认识 12 种水果好吗?" + 底部 CTA "我们开始吧"
- 右 1.1: 4×3 chip 网格,全部 `dimmed badgeKind="locked"` (右上角 ? 标)

### 6.3 跟读练习 · 法阵 v2 (每词一帧)

**组件**: `<LessonMandalaV2 word={currentCard} state={...} />`

数据:
```ts
interface PracticeProps {
  course: { title: string; sub: string };  // 顶部 bar
  word: PictureCardData;                    // 当前卡
  phaseIdx: number;                         // 0–4,定位进度药丸
  lessonWords: { card: PictureCardData; done: boolean; star: boolean; current: boolean }[];
  state: 'listening' | 'recording' | 'correct' | 'tryAgain';
  cat: { variant: string; mood: string };   // = { 'storybook', 'happy' }
}
```

**布局**:
- 顶部 bar (左:返回 + 课程标题 + 进度药丸)
- 主 grid: 左 1fr / 右 320px
  - 左: **Hero PictureCard** (整高) + 下方 PushToTalkBar
  - 右: CatSpeech (头+对话框,字幕进入气泡内) + MiniMandala + MiniWordStrip

**状态行为**:
| State | 触发 | 视觉 |
|---|---|---|
| listening | 进入帧 | 默认,猫说当前词的提示 |
| recording | 按下 Space | hero 加 mint 光晕、REC 药丸、波形更高 |
| correct | ASR 通过 | hero 文字变 mint、+1⭐ 飘标、词条变 mint、5/8 → 6/8 |
| tryAgain | ASR 不通过 | hero 加 peach 描边、喇叭按钮高亮指向、猫鼓励 |

### 6.4 选词题 · Quiz Pick

**组件**: `<QuizPickWordFrame options={4} correctIdx={...} state={...} />`

数据:
```ts
interface QuizProps {
  options: PictureCardData[];   // 4 个,其中 1 个 correct
  correctIdx: number;
  state: 'idle' | 'selected' | 'correct' | 'wrong';
  selectedIdx?: number;
}
```

**布局**:
- 顶部 bar + 药丸停在"考考你"
- 主 grid: 左 1fr / 右 320px
  - 左: 2×2 **Tile PictureCard** 网格
  - 右: CatSpeech (题干 "Which one is peach?") + MiniMandala + QuizFooterHint

**状态行为**:
| State | 视觉 |
|---|---|
| idle | 4 tile 全默认 |
| selected (内部态) | 选中的 tile 套 sky 光晕 |
| correct | 正确 tile 套 mint + +1⭐;其它正常 |
| wrong | 选错 tile 套 peach + ×;正确 tile 同时 mint 高亮 (提示) |

### 6.5 复习 · Reinforce

**组件**: `<ReinforceFrame sentencePattern="I like ___." chips={lessonWords} filledWord={...} />`

数据:
```ts
interface ReinforceProps {
  sentencePattern: string;       // 如 "I like ___."
  zhPattern: string;             // 如 "我喜欢___。"
  chips: PictureCardData[];      // 12 个,本课所有词
  filledWord: string | null;     // 当前已填进空位的英文
}
```

**布局**:
- 顶部 bar + 药丸停在"复习"
- 主 grid: 左 1fr / 右 320px
  - 左: 句型大字 "I like ___." (78px,空位 box dashed peach,填入后 mint),下方 "说一个你喜欢的水果" + 6×2 chip 网格
  - 右: CatSpeech + MiniMandala + 紧凑 PushToTalk

填入逻辑: ASR 命中某个词 → 那个 chip 转 `state="correct"` (mint) + 句子空位填入 emoji + 单词。

### 6.6 下课庆祝

**组件**: `<DoneCelebrateFrame stars={5} total={5} stats={...} />`

数据:
```ts
interface DoneProps {
  starsEarned: number;
  totalStars: number;        // 总可得星数
  wordsLearned: number;
  duration: string;          // "14:32"
  accuracy: number;          // 86
  cat: { variant; mood: 'cheer' };
}
```

**布局**: 全屏单页,无侧栏。
- 顶部 banner 横幅 "今天太棒啦!" (旋转 -1°)
- 中央大麻吉 (340px) 头戴小纸帽 (3 颗宝石装饰)
- 5 颗大星横排,每颗微旋
- 数据一行 (词数 · 用时 · 准确率)
- 底部双 CTA:回大厅 / 再来一节
- 角落 10 颗小纸屑装饰

### 6.7 魔法书 (Journal) · `/journal`

**组件**: `<JournalPage chapters={...} activeChapter={...} />`

数据:
```ts
interface Chapter {
  course: Course;            // 关联一门课程
  cards: PictureCardData[];  // 已学的词
}

interface JournalProps {
  chapters: Chapter[];       // 目录
  activeChapterId: string;
}
```

**布局**: 翻开的双页书。
- 左页: 目录 (4 章对应 4 课程,active 高亮) + 星星统计卡
- 右页: 当前章的词卡网格 (3 列 chip,但 size 略放大,带 tape 装饰),未解锁位用虚线 `?` 占位

### 6.8 家长阁楼 · `/parents`

#### 6.8.1 PIN 解锁页

**组件**: `<PINGateFrame entered={n} error={bool} />`

- 半透明纸纹蒙层 + dimmed 背景 (blur 2px)
- 居中 480w 弹窗 (-1° 微旋)
- 麻吉头 110px + 标题"家长阁楼" + 4 圆点 + 3×4 键盘 (✓ mint, ← peach)
- 错 3 次进入 30 秒冷却

#### 6.8.2 数据面板

**组件**: `<ParentsPage stats={...} sessions={...} settings={...} />`

数据:
```ts
interface ParentsProps {
  stats: { weekMin: number; newWords: number; streak: number; accuracy: number };
  sessions: SessionRow[];
  settings: { voice: string; duration: string; difficulty: string };
}
```

- 顶 4 个 StatsCard
- 左主区 (1.4 fr): 最近 5 次课的表格
- 右副区 (1 fr): SettingsPanel + 周报小卡 (带麻吉头像)

---

## 7. 图片素材要求

> **所有上线图片 = 正方形 PNG**

| 用途 | 建议尺寸 | 内容 |
|---|---|---|
| 单词图 (hero 主卡) | **1024×1024** 或 **1200×1200** | 全画幅插画 / 摄影,主体居中,**不要带白底色块** (背景由卡片提供) |
| 句卡图 (sentence 主卡) | 同上 | 表达整句场景,如 "I like peach." 画孩子拿桃子 |
| Tile / Chip | 同上,**渲染时缩放即可** | 不需要单独再切;一张图通用 |

**风格**: 水彩 / 绘本插画风优先;边缘可以是不规则透明,与纸纹背景融合。**禁止** 3D 渲染、立体光影、霓虹色、AI 风的过亮高饱和。

**命名**: `<course-id>/<word-en>.png`,如 `food/peach.png`,`food/sentence-i-like.png`。

**占位回退**: 没图时 `<PictureCard>` 自动用 emoji + 条纹背景占位(已实现)。**这是 dev 期回退,上线必须每张词都有真实图**。

---

## 8. 与现有代码库的映射

| 现有 (`claude-design-frontend`) | 重构后 |
|---|---|
| `src/app/page.tsx` (`SceneFrame variant=yard`) | `<HomeStudy />` 整页替换 |
| `src/components/scene/*` (YardScene, AtticScene, CabinScene, GrassScene, StorageScene) | **全部删除** |
| `src/components/bunny/Bunny.tsx` | 替换为 `<Cat variant="storybook">` |
| `src/components/home/LetterCard.tsx` | 替换为 `<CourseBook />` (in `home.jsx`) |
| `src/components/lesson/PhasedLessonView.tsx` | 保留控制器逻辑;view 层切换到 `<IntroFrame>` / `<LessonMandalaV2>` / `<QuizPickWordFrame>` / `<ReinforceFrame>` / `<DoneCelebrateFrame>` |
| `src/components/lesson/IntroPhase.tsx` | 复用现有数据接口,view 切换到 `<IntroFrame>` |
| `src/components/lesson/InteractivePhase.tsx` + `WordBook.tsx` | view 切换到 `<LessonMandalaV2>` (用单张 `HeroPictureCard` 替代 `<WordBook>`) |
| `src/components/lesson/QuizPickWord.tsx` | view 切换到 `<QuizPickWordFrame>` |
| `src/components/lesson/QuizRepeatAfterMe.tsx` | 跟读已合并进 `<LessonMandalaV2>` 状态机,**不再单独存在** |
| `src/components/lesson/ReinforcePhase.tsx` | view 切换到 `<ReinforceFrame>` |
| `src/components/lesson/SubtitleBar.tsx` | **删除**;字幕进 CatSpeech 对话框 |
| `src/components/lesson/BloomButton.tsx` | 替换为通用 `<PaperButton>` |
| `src/components/lesson/WordBook.tsx` | 替换为 `<HeroPictureCard>` |
| `src/components/done/StickerWord.tsx` | 替换为 `<DoneCelebrateFrame>` (它包含星 + 数据 + CTA) |
| `src/components/journal/BookShelf.tsx` + `WordEntry.tsx` | 替换为 `<JournalPage>` |
| `src/components/parents/PinGate.tsx` + `PinPad.tsx` | 替换为 `<PINGateFrame>` (整合 PIN 输入) |
| `src/components/parents/StatsCard.tsx` + `SessionRow.tsx` + `SettingsAccordion.tsx` | 内嵌进 `<ParentsPage>` |
| `src/components/ui/Button.tsx` | 替换为 `<PaperButton>` |
| `src/components/ui/Stars.tsx` | 替换为新 `<Star>` (`shared.jsx`) |
| `src/components/ui/Surface.tsx` | 替换为 `<PaperBg>` |
| `src/components/ui/PinPad.tsx` | 合并进 `<PINGateFrame>` |
| `tailwind.config.ts` | 把 `bunny-*` token 替换为本文档 §3.1 的调色板 |
| `globals.css` | 加 SVG defs + font-family vars,移除原 bunny 主题样式 |

**保留不动**:
- `src/lib/agent/*` (LessonController / SpeechExtractor / orchestrator / prompt)
- `src/lib/voice/*` (asr / tts proxies & clients)
- `src/lib/audio/*`
- `src/lib/db/*`, `src/lib/progress.ts`, `src/lib/stats.ts`, `src/lib/pin.ts`
- `src/data/courses/*` (课程数据结构兼容)
- `src/types/*` (但要在 `course.ts` 里给 `WordCard` 加一个可选 `tone?: keyof Palette` 字段)
- `src/app/api/*`
- `server.ts`, `next.config.mjs`

---

## 9. 课程数据兼容

现有 `Course` 类型:
```ts
interface WordCard {
  id: string;
  english: string;
  chinese: string;
  imageUrl: string;
  kind: 'word' | 'sentence';
}
```

映射到 `PictureCardData`:
```ts
function toPictureCardData(c: WordCard, tone?: PaletteKey): PictureCardData {
  return {
    kind: c.kind,
    en: c.english,
    zh: c.chinese,
    ipa: (c as any).ipa,           // 如果 course 数据补了 ipa
    imageUrl: c.imageUrl,
    tone: tone ?? 'peach',          // 课程可整体一个色调,词卡跟课程走
  };
}
```

**建议** 给 `Course` 加一个 `tone: PaletteKey`,如 food=peach、animals=mint、colors=sky、family=lilac,所有词共享。

---

## 10. 字体 / 性能 / 兼容

- 五个 web font,**总 ~500KB**。`display=swap` 已在 link 里,首屏 fallback 立即可读。
- LXGW WenKai TC 较大,如果 production 想瘦身,可自托管 + 按字符子集生成 (web font 工具)。
- 所有动效 `transition: 200ms` 以内,无大动画;**用户可选** `prefers-reduced-motion` 应禁用 transitions 和 sparkle。
- 浏览器: Chrome / Safari / Edge 最新。**不**支持 IE。
- CSS `aspect-ratio` 用得多,需要现代浏览器 (Chrome 88+ / Safari 15+)。

---

## 11. 实施顺序建议

> 一个新人 agent 进来,按这个顺序做最不容易翻车。

1. **建立 tokens** — 改 `tailwind.config.ts`,把 5 色 + ink + paper 注入。改 `globals.css`,加 5 个 web font + CSS vars + 一个 `<SVGDefs>` 全局挂载点 (在 `layout.tsx` 里)。
2. **复刻 `<Cat>` + `<PaperBg>` + `<Star>` + `<Sparkle>` + `<PaperButton>` + `<IllustrationSlot>` 6 个原子**。从 `mascot.jsx` + `shared.jsx` 直接抄,转成 TS + Tailwind。
3. **实现 `<PictureCard>`** 三种 size。这是大头。用 §5 的 props 表 + §5.3 状态表。
4. **逐屏拼装**:首页 → 招呼 → 跟读 → quiz → 复习 → 庆祝。**每屏接现有 controller 的事件**,view-only 替换。
5. **独立屏**: 魔法书 / PIN / 家长面板。
6. **删除旧组件** (见 §8 表)。Run `pnpm test` + `pnpm exec tsc --noEmit` 必须通过。
7. **跑一节真实课程**,听 / 录 / 对 / 错 / 完整流程都走一遍。

---

## 12. 验收 Checklist (交付前自检)

- [ ] 选课首页加载 ≤ 1s (字体走 fallback)
- [ ] 麻吉小猫在所有页面显示,白底灰斑,无失真
- [ ] 跟读练习 4 个状态视觉清晰可辨,200ms 过渡
- [ ] Quiz 答对 / 答错有视觉差异,**不**用红色硬错,用桃色柔提示
- [ ] 复习句子卡空位状态 vs 已填状态有色彩差异
- [ ] 下课庆祝 5 颗星按 earned 数填充,克制不炸屏
- [ ] PIN 输错 3 次进入冷却 (后端逻辑保留),前端有"剩 N 次"提示
- [ ] 所有正方形图卡: 真图 / emoji 占位都不溢出
- [ ] 词卡 (word) 英文 ~96px,句卡 (sentence) 英文 ~56px 自动换行
- [ ] 没有任何位置出现红绿激进色 / 荧光 / 默认 system font
- [ ] `prefers-reduced-motion` 下没有 sparkle 跳动
- [ ] PR 同步更新了 `docs/architecture.md` (你们项目 CLAUDE.md 强制要求)

---

## 13. 不在本次重构内 (留到下个迭代)

- 错误态 (网络断 / TTS 失败 / 麦克风权限) — 视觉层不画,看 LessonController 报错事件再加 toast
- 加载态 (TTS 还没说出来时) — 用现有 framer-motion fade-in 兜底即可
- 空状态 (用户 0 进度) — 课程卡空,猫咪 idle 招呼 (复用 IntroFrame 文案)
- 404 — 复用现有 `not-found.tsx`,换个麻吉 + "找不到这一页啦"
- 移动端 / 平板触屏适配 — 本次不做

---

## 14. 联系 / 答疑

设计源全部在 `EduAGENT.html` 同目录,React + JSX,可以直接拖到浏览器看效果。每个组件文件:

| 文件 | 内容 |
|---|---|
| `shared.jsx` | tokens, SVGDefs, PaperBg, Star, Sparkle, PaperButton, IllustrationSlot |
| `mascot.jsx` | Cat (4 variants — 只上线 storybook) |
| `home.jsx` | HomeStudy + 备选 HomeMap / HomeWall |
| `lesson.jsx` | PictureCard 三种 size + LessonMandalaV2 + 备选 LessonScroll / LessonTower |
| `lesson-flow.jsx` | IntroFrame / QuizPickWordFrame / ReinforceFrame / DoneCelebrateFrame / PINGateFrame |
| `journal-parents.jsx` | JournalPage / ParentsPage |
| `app.jsx` | 设计画布编排 |

读源码即可还原全部细节;有歧义优先看源码,文档为辅。

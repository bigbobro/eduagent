# Frontend Redesign — Bunny 的小院子

**作者**:Claude(脑暴 with 用户)
**日期**:2026-05-12
**状态**:Spec(待用户审阅)
**关联代码**:`src/app/**`、`src/components/**`、`src/lib/{progress,pin,stats}.ts`(新建)
**关联 living doc**:`docs/architecture.md`(前端章节,待 L17 同步)

---

## 0. TL;DR

把 EduAgent 前端重构为「Bunny 的小院子」——一个温柔绘本风的桌面 web app,5 个核心页面对应院子里的 5 个空间。

- **目标用户**:3-6 岁孩子(家长在旁起步,孩子可独立用 1 节课)
- **设备**:桌面浏览器(1024×640 起,理想 1280×800+),不做移动响应
- **风格**:温柔绘本风(米黄 / 淑粉 / 淑蓝 / 萄萄绿 / 榆色 / 柔粉),手绘 SVG
- **方案**:Bunny 的小院子(场景叙事,5 空间对应 5 页面)
- **交付节奏**:一次性全部交付(用户决定)
- **不改动**:`src/lib/voice/`、`src/lib/agent/`、`src/lib/db/schema`、`/api/chat`、`/api/courses`、`/api/voice/*`
- **插画策略**:Claude 写 SVG 占位骨架,用户后期可无缝替换为精画

## 1. 目标 & 设计原则

### 目标
重构 EduAgent 前端为沉浸式温柔绘本风,5 个页面对应 Bunny 院子里的 5 个空间。

### 设计原则(优先级排序)

1. **不识字也能用** — 关键操作只用图标 + 颜色,文字仅辅助
2. **温柔不刺眼** — 避免高对比 / 闪烁 / 强动效,长时间使用不疲劳
3. **空间隐喻 = 易懂** — 进木屋 = 上课,出门 = 下课,储物间 = 战利品,阁楼(锁)= 家长禁区
4. **Bunny 即向导** — Bunny 在每个空间都出现,姿态匹配空间语义
5. **桌面优先** — 鼠标点击 + 空格 push-to-talk
6. **代码可演进** — 插画用 SVG 占位先跑通,后期 PNG / 精画无缝替换

### 非目标(明确不做)

- 不动 voice / agent / DB 业务逻辑
- 不做移动响应,不做 touch 优化
- 不引入复杂动画框架(Lottie / GSAP / Three.js)
- 不做多角色 / 多老师切换,只有 Bunny
- 不做完整屏幕阅读器深度优化(仅基础 aria-label)

## 2. 视觉系统(Design Tokens)

### 调色板(写入 `tailwind.config.ts`)

```
背景层
  bunny-bg-cream      #FFF8EE   主背景(院子 / 木屋内壁)
  bunny-bg-warmpaper  #FCEFE0   卡片底
  bunny-bg-sky        #E8F0FA   信件 / 阁楼天窗
  bunny-bg-night      #2B2540   家长后台(夜空)

主调色
  bunny-grass         #B9D7A0   草地(萄萄绿)
  bunny-grass-deep    #95B57E   草地阴影
  bunny-wood          #D4B595   木屋 / 储物间木纹(榆色)
  bunny-wood-deep     #A88468   木纹深色
  bunny-leaf          #7FA86C   叶子

强调色
  bunny-pink          #F4B5B0   Bunny 鼻子 / 心情 / 关键按钮
  bunny-pink-soft     #FCEBE3   按钮悬浮 / Bunny 耳朵内
  bunny-gold          #E8C77A   星星 / 奖励 / 集卡光晕
  bunny-berry         #C97A8A   错误 / 警示(柔和版)

文字(暖棕,不用纯黑)
  bunny-ink           #4B3F35   主文字(对比度 ~10:1 on cream,AAA)
  bunny-ink-soft      #8A7B6D   辅助文字(仅 14px+,对比度 ~4.7:1 压线 AA)
  bunny-ink-faint     #C4B4A3   占位 / disabled
```

### 字体

- **英文 / 数字**:Fredoka(Google Fonts,圆润可读),`next/font/google` 引入,`variable: '--font-fredoka'`
- **中文**:LXGW WenKai TC(霞鹜文楷,开源手写体),通过 `fontsource-lxgw-wenkai-tc` 或 self-host CDN

### 字号阶梯

```
英文 hero word     96px / weight 500    上课页字卡
英文 word card     72px / weight 500    进度页词条
页面标题            32px / weight 600
卡片标题            20px / weight 500
正文                16px / weight 400
辅助 / hint         14px / weight 400
按钮文字            18px / weight 500
```

### 圆角 / 阴影 / 间距

```
圆角  bunny-radius-sm    12px   小图标背景
      bunny-radius-md    20px   按钮 / 小卡
      bunny-radius-lg    28px   主卡片 / surface
      bunny-radius-pill  9999px 状态条 / 角色泡泡

阴影  shadow-soft        0  4px 12px rgba(75, 63, 53, 0.08)
      shadow-medium      0  8px 24px rgba(75, 63, 53, 0.12)
      shadow-bunny       0 12px 32px rgba(244, 181, 176, 0.25)

间距  4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96
```

### 动效语汇

```
时长   微互动      150-200ms
       元素进场    300-500ms
       场景转场    600-800ms
       背景循环    3-10s(慢)

缓动   默认       cubic-bezier(0.4, 0, 0.2, 1)
       柔弹       Framer Motion spring { stiffness: 120, damping: 18 }

禁忌   不用 elastic / strong bounce
       背景动画必须低饱和、慢节奏、可循环、不抢视线
```

### 图标策略

不引入第三方 icon 库——所有图标作为内联 SVG 在 `src/components/ui/icons/`,统一笔触 2px stroke,round cap/join。

## 3. 空间叙事(5 空间 / 5 页面)

### 3.1 院子全景(首页)— `/`

广角视角看整个院子:萄萄绿草地、淡蓝天空、木屋(2 层)、邮箱、储物间门。

**元素**:
- 散落草地上的信件 = 课程(按 `course.theme` 选信封颜色,见下表)

信封颜色映射(在 `LetterCard` 内定义 `themeColorMap`):

```
transport     → bunny-wood (#D4B595)        褐色信封,像快递包裹
time-numbers  → bunny-bg-sky (#E8F0FA)      淡蓝信封,像清晨的信
animals       → bunny-pink-soft (#FCEBE3)   柔粉信封(预留,目前无 course)
food          → bunny-gold (#E8C77A)        金黄信封(预留)
colors        → bunny-grass (#B9D7A0)       淡绿信封(预留)
```

未来加新 theme 时,在该 map 加一项即可。
- hover 信件 → 信件抬起 + 浮标题 + Bunny 看过去
- 点信件 → 信件展开缩放转场 → 进木屋
- 储物间门(右侧)→ `/journal`
- 阁楼小梯子(木屋外墙)→ `/parents`(PIN 拦截)
- Bunny:`pose="sit"`,默认 idle

**背景循环动画**:云 30-60s 飘 / 草地 6s ±2° 微摇 / 烟囱 4s 缓出烟

### 3.2 木屋内(上课页)— `/lesson/[id]`

推近视角进入木屋,大桌 + 桌上"图画书"(字卡) + Bunny 站桌左。

**布局**:
- 顶栏 56px:← 离开(左)| 课程标题(中)
- 主区:Bunny 全身(左) + WordBook 字卡(中右)
- 底栏:字幕条(左大) + BloomButton 花朵造型 push-to-talk(右)

**Bunny mood 与状态映射**(与现有 LessonController 状态 1:1):
```
idle      → 自然站立、看你
listening → 一只手举到耳边、耳朵稍微竖起
thinking  → 手摸下巴、头微歪
speaking  → 嘴一开一合 + 头轻点
```

**关键变化 vs 当前**:
- Bunny 升级为全身,不只是头
- push-to-talk 按钮重设计为花朵造型(默认 closed,按下 open)
- 字卡更大,中央主导画面
- 字幕条用圆角 + 暖色(AI 说话 = cream,孩子识别 = sky)
- "结束课堂"→ 改为左上"← 离开"(更柔和)

**voice / LessonController 逻辑完全不动**——只换 UI 提示与组件外观。

### 3.3 草地总结(总结页)— `/lesson/[id]/done`

回到草地,视角从院子全景拉近到一角。Bunny 举花,掌握的单词以贴纸形式从天上飘下贴到草地。

**元素**:
- Hero 对话泡:"今天你认识了 N 个新朋友!"
- 掌握的单词卡片(从 DB 查 `word_performance` correct/attempts >= 0.6)依次飘下,200ms 延迟,每张贴下时 ⭐ 闪光
- 底部按钮:【再选一封信】回 `/` / 【看看小词典】去 `/journal`
- 未掌握的词在 Bunny 脚边小篮子里(不撒草地,避免负面感)
- Bunny:`pose="hold-flower"`,周期性挥手
- 自动行为:8 秒无操作自动回 `/`

**边界**:DB 查不到掌握词 → 显示鼓励文案 "我们一起又练了一次,下回继续加油!" + 单按钮"回院子"

### 3.4 储物间(进度页)— `/journal`

推开木门进储物间,墙上木架,按 course 分类的"小词典书"。

**元素**:
- 顶部:← 返回院子 + 标题「Bunny 的小词典」
- 每个 course 一个木架,架子上摆词条卡
- 每张词条:emoji/占位图 + 英文 + 中文 + 1-3 颗 ★
- 灰色 = 未学到(锁图标)/ 米色 = ★1-2 / 金色 = ★3
- 点词条 → 小窗:发音 / 例句 / 上次练习时间
- Bunny:`pose="read"`,角落看书,偶尔抬头
- **不显示百分比数字**,只用 ★ 多寡传达

### 3.5 阁楼(家长后台)— `/parents`(PIN)

**PIN 流程**:
- 首次:`PinGate` 显示"设置爸爸妈妈密码"(4 位数字)
- 已设:"请输入密码"
- 错 3 次:锁定 30s,显示 Bunny 摇头 + 倒计时
- 校验通过 → 渲染阁楼场景

**阁楼内容**:
- 背景 `bunny-bg-night` 深蓝紫 + 星光 + 一盏灯
- 3 张木质 dashboard 卡:
  1. 学习时长(总分钟 + 近 7 天小柱状图)
  2. 掌握单词数(总数 + 新增 + 按 course 细分)
  3. 最近 sessions(列表,date / course / duration / mastered)
- 设置区(下方折叠):
  - 修改 PIN
  - TTS 音色(读取 `DOUBAO_TTS_DEFAULT_SPEAKER`,只读展示)
  - 难度档(简单 / 标准 / 进阶)— UI 占位,不实装
- 顶部"← 下楼"返回 `/`

**PIN 实现**:
- 4 位数字,storage 用 `localStorage` + salted SHA-256 hash
- 错 3 次锁定 30s,lockout 时间戳存 localStorage
- UI 是大数字键盘(`PinPad` 组件),不是浏览器原生 input
- 纯客户端实现,无 API

## 4. 路由 + 组件 + 数据流

### 4.1 路由结构

```
/                          首页 = 院子全景
/lesson/[id]               上课页 = 木屋内
/lesson/[id]/done          总结页 = 草地
/journal                   进度页 = 储物间
/parents                   家长后台 = 阁楼(PIN 客户端门控)
```

PIN 门控放页面内部(`PinGate` 包裹 ParentsClient),不用 middleware。

### 4.2 API

**保留**:
- `GET /api/courses`
- `POST /api/chat`(SSE)
- `WS /api/voice/asr` / `WS /api/voice/tts`

**新增**:
- `GET /api/progress` — 聚合所有 lesson 的 word_performance,按 course 分组 → `ProgressSnapshot`
- `GET /api/sessions?limit=N` — 最近 N 次 lesson(默认 10)→ `SessionSummary[]`
- `GET /api/stats` — 总分钟 / 总单词 / 近 7 天柱状图 → `StatsSnapshot`

### 4.3 文件结构

新建标 ⭐,重写标 ✎,删除标 ✗

```
src/
├── app/
│   ├── page.tsx                              ✎ 院子首页
│   ├── layout.tsx                            ✎ 换字体
│   ├── globals.css                           ✎ tokens
│   ├── template.tsx                          ⭐ 路由转场壳
│   ├── lesson/[id]/page.tsx                  ✎
│   ├── lesson/[id]/LessonClient.tsx          ✎
│   ├── lesson/[id]/done/page.tsx             ⭐
│   ├── lesson/[id]/done/LessonDoneClient.tsx ⭐
│   ├── journal/page.tsx                      ⭐
│   ├── journal/JournalClient.tsx             ⭐
│   ├── parents/page.tsx                      ⭐
│   ├── parents/ParentsClient.tsx             ⭐
│   └── api/
│       ├── progress/route.ts                 ⭐
│       ├── sessions/route.ts                 ⭐
│       └── stats/route.ts                    ⭐
├── components/
│   ├── ui/
│   │   ├── Button.tsx                        ✎
│   │   ├── Card.tsx                          ✗
│   │   ├── Surface.tsx                       ⭐
│   │   ├── PinPad.tsx                        ⭐
│   │   ├── Stars.tsx                         ⭐
│   │   └── icons/                            ⭐
│   ├── bunny/
│   │   ├── Bunny.tsx                         ✎(从 lesson/ 移过来 + 重写全身)
│   │   └── BunnyDialog.tsx                   ⭐
│   ├── scene/
│   │   ├── SceneFrame.tsx                    ⭐
│   │   ├── YardScene.tsx                     ⭐
│   │   ├── CabinScene.tsx                    ⭐
│   │   ├── GrassScene.tsx                    ⭐
│   │   ├── StorageScene.tsx                  ⭐
│   │   └── AtticScene.tsx                    ⭐
│   ├── home/
│   │   ├── CourseCard.tsx                    ✗
│   │   └── LetterCard.tsx                    ⭐
│   ├── lesson/
│   │   ├── LessonView.tsx                    ✎
│   │   ├── WordCardCanvas.tsx                ✗(被 WordBook.tsx 取代)
│   │   ├── WordBook.tsx                      ⭐(替代 WordCardCanvas)
│   │   ├── SubtitleBar.tsx                   ✎
│   │   ├── HoldToTalkButton.tsx              ✗(被 BloomButton.tsx 取代)
│   │   ├── BloomButton.tsx                   ⭐(替代 HoldToTalkButton,花朵造型)
│   │   └── Bunny.tsx                         ✗(移到 components/bunny/)
│   ├── done/
│   │   ├── DoneCelebration.tsx               ⭐
│   │   └── StickerWord.tsx                   ⭐
│   ├── journal/
│   │   ├── BookShelf.tsx                     ⭐
│   │   └── WordEntry.tsx                     ⭐
│   └── parents/
│       ├── PinGate.tsx                       ⭐
│       ├── StatsCard.tsx                     ⭐
│       ├── SessionRow.tsx                    ⭐
│       └── SettingsAccordion.tsx             ⭐
├── lib/
│   ├── progress.ts                           ⭐
│   ├── pin.ts                                ⭐
│   ├── stats.ts                              ⭐
│   └── ... (voice/agent/db 不动)
├── types/
│   ├── course.ts                             ✎(加 theme)
│   └── progress.ts                           ⭐
└── data/courses/
    ├── transportation.ts                     ✎(theme: 'transport')
    └── timeNumbers.ts                        ✎(theme: 'time-numbers')
```

**统计**:新建 ~32 个文件,重写 ~8 个,删除 4 个,不动 ~40 个。

### 4.4 共享组件契约

```ts
// components/bunny/Bunny.tsx
type BunnyMood = 'idle' | 'listening' | 'thinking' | 'speaking';
type BunnyPose = 'sit' | 'stand' | 'point' | 'hold-flower' | 'read';

interface BunnyProps {
  mood?: BunnyMood;
  pose: BunnyPose;
  size?: number;
  facing?: 'left' | 'right';
  className?: string;
}

// components/scene/SceneFrame.tsx
type SceneVariant = 'yard' | 'cabin' | 'grass' | 'storage' | 'attic';

interface SceneFrameProps {
  variant: SceneVariant;
  children: React.ReactNode;
  enterFrom?: SceneVariant | null;  // null = 首次进入用默认 fade
}

// components/home/LetterCard.tsx
interface LetterCardProps {
  course: Course;
  position: { x: number; y: number; rotate: number };
  onClick: () => void;
}

// components/ui/Surface.tsx
interface SurfaceProps {
  tone?: 'cream' | 'wood' | 'sky' | 'night';
  children: React.ReactNode;
  className?: string;
}

// components/ui/PinPad.tsx
interface PinPadProps {
  length?: 4;
  onComplete: (pin: string) => void;
  error?: string | null;
  disabled?: boolean;
}
```

### 4.5 状态管理

**不引入** Redux / Zustand / Jotai / SWR / React Query。

- 页面级数据:client component `useEffect + fetch + useState`
- 课堂状态:`LessonController`(已有,不动)
- PIN auth:`PinGate` 内部 `useState`,通过后渲染 ParentsClient
- 课程主题色:从 `Course.theme` 派生

### 4.6 类型新增

```ts
// types/course.ts (✎)
export type CourseTheme = 'transport' | 'time-numbers' | 'animals' | 'food' | 'colors';
export interface Course {
  // 已有字段 ...
  theme: CourseTheme;  // 新增
}

// types/progress.ts (⭐)
export interface WordMastery {
  word: string;
  zh: string;
  emoji?: string;
  attempts: number;
  correct: number;
  masteryStars: 0 | 1 | 2 | 3;
  lastPracticed: string | null;
}

export interface CourseProgress {
  courseId: string;
  courseTitle: string;
  courseTheme: CourseTheme;
  totalWords: number;
  masteredWords: number;
  words: WordMastery[];
}

export interface ProgressSnapshot {
  courses: CourseProgress[];
  totalWordsMastered: number;
  generatedAt: string;
}

export interface SessionSummary {
  lessonId: string;
  courseId: string;
  courseTitle: string;
  startTime: string;
  endTime: string | null;
  durationMs: number;
  interactionCount: number;
  wordsAttempted: number;
  wordsMastered: number;
}

export interface StatsSnapshot {
  totalMinutes: number;
  totalSessions: number;
  totalWordsMastered: number;
  last7Days: Array<{ date: string; minutes: number }>;
}
```

### 4.7 转场动画

用 Next.js App Router `template.tsx` + Framer Motion `motion.div` + `layoutId`:

- 院子 → 信件(layoutId)→ 木屋:信件 zoom in 变成 cabin 入口
- 木屋 → 草地:cabin 缩小 fade out,grass 滑入
- 院子 → 储物间:slide-left
- 院子 → 阁楼:向上 pan + 梯子动画

每个 SceneFrame 接收 `enterFrom` 决定进场动画,无 `enterFrom` 用默认 fade。

## 5. 错误处理、加载态、空态、a11y

### 5.1 错误场景

| 场景 | UI |
|------|----|
| 首页 API 失败 | Bunny 拿空信箱 + "信件还没送到" + 重试 |
| 进度页 API 失败 | Bunny 在储物间挠头 + 重试 |
| 家长后台 API 失败 | 单卡显示"暂时拿不到数据",其他卡正常(各卡独立 fetch) |
| 课程不存在 | Bunny 在信箱旁 + "找不到这封信" + 回院子 |
| PIN 错 3 次 | 锁定 30s,Bunny 摇头 + 倒计时 |
| ASR/TTS WS 异常 | 沿用现有 LessonController error 事件,顶部细横条 3 秒消失 |
| DB 写失败 | console.error,不阻塞 UI |
| 总结页 0 掌握词 | 鼓励文案"下回继续加油!",不显示"0 颗星" |

**原则**:错误用 Bunny 语气,永远不显示技术错误码。任何失败都有"回院子"退路。

### 5.2 加载态

| 场景 | UI |
|------|----|
| 首页 | 院子背景 + Bunny 张望 + 信件 skeleton |
| 进度页 | 木架空 + Bunny 摆书 |
| 家长后台 | 3 张卡 shimmer(暖色,低对比) |
| 路由转场 | SceneFrame 自带进场动画,不显式 loading |
| API 200ms 内 | 不显示 skeleton(避免闪烁) |

### 5.3 空态

| 场景 | UI |
|------|----|
| 新用户进度页 | 空架 + Bunny 抱书 + "去院子选一封信开始第一课" |
| 家长无 session | 3 卡显示 0 + "还没开始第一节课" |
| course 进度 0 | 该 course 木架所有词灰色(锁) |

### 5.4 Accessibility

1. **`prefers-reduced-motion`** — 背景动画 + 路由转场降级为 300ms fade;Bunny mood 动画保留(语义反馈)
2. **色彩对比度** — 正文用 `bunny-ink`(对比度 ~10:1 AAA);`bunny-ink-soft` 仅 14px+
3. **焦点环** — `focus-visible:ring-2 ring-bunny-pink ring-offset-2`,所有可点击元素
4. **aria** — 装饰 SVG `aria-hidden`,Bunny `role="img" aria-label="Bunny 老师"`,信件 `aria-label="开始课程:{title}"`,PIN 键盘 `role="grid"`
5. **键盘** — 空格 push-to-talk(已有);Tab/Enter 全可点元素;Esc 在 lesson = 离开,在 PIN = 回首页
6. **不做** 深度屏幕阅读器(live region 等)— 用户群非视障

### 5.5 Error Boundary

每个页面 client component 包 ErrorBoundary,catch JS 异常 → Bunny 抱头 + "出了一点点问题" + 回院子。不显示堆栈。

## 6. 测试策略

### 6.1 单元测试(vitest)

| 文件 | 关键 case |
|------|----------|
| `src/lib/progress.test.ts` ⭐ | DB rows → ProgressSnapshot:按 course 分组,mastery stars 派生(0.9→★3 / 0.6→★2 / >0→★1 / =0→★0),未练习词为 ★0,lastPracticed = 最新 timestamp |
| `src/lib/pin.test.ts` ⭐ | setPin → verifyPin 正确;错 PIN false;3 次失败 → isLockedOut;30s 过 isLockedOut false;hash 不是明文;fake localStorage + `vi.useFakeTimers` |
| `src/lib/stats.test.ts` ⭐ | 跨日 session 归 startTime 当天;7 项数组连续(空日 = 0);local timezone |

### 6.2 组件测试(RTL + jsdom)

| 文件 | 关键断言 |
|------|---------|
| `bunny/Bunny.test.tsx` | pose × mood 矩阵渲染对应 SVG group;reduced-motion 下 pose 静态 mood 动画保留 |
| `home/LetterCard.test.tsx` | 点击触发 onClick;theme 映射正确背景色;aria-label 存在 |
| `parents/PinGate.test.tsx` | 首次设置流程;已设验证流程;错 3 次锁定 + 倒计时;锁定时正确 PIN 也阻拦 |
| `lesson/BloomButton.test.tsx` | 鼠标按下 / 松开 / leave 触发对应回调;disabled 不响应;沿用 HoldToTalkButton 全部行为契约 |
| `done/StickerWord.test.tsx` | 数量正确;200ms 延迟进场(fake timers verify) |

### 6.3 API 测试(vitest + in-memory sqlite)

| 文件 | 关键 case |
|------|----------|
| `tests/api/progress.test.ts` | 空 DB → 全 0;单 lesson 部分 correct → stars 对;多 lesson 同 word → attempts 累加 |
| `tests/api/sessions.test.ts` | limit 生效;startTime DESC 排序;未结束 session 也返回 |
| `tests/api/stats.test.ts` | 跨日归 startTime 当天;7 天完整;总分钟 ≈ session 时长之和 |

**测试 DB**:`new Database(':memory:')`,每测试前 `initDatabase` + 插 fixture。

### 6.4 路由 smoke(`scripts/smoke-pages.ts`)

不引入 Playwright。改为 dev server smoke 脚本:

```
启动 dev server (run_in_background)
fetch / → 200 + HTML 含"院子"标识
fetch /lesson/course-transportation → 200 + "木屋"标识
fetch /lesson/course-transportation/done → 200
fetch /journal → 200
fetch /parents → 200(渲染 PinGate)
fetch /api/progress / /api/sessions / /api/stats → 200 + JSON shape
关闭 dev server
```

在 `package.json` 加 `"smoke": "tsx scripts/smoke-pages.ts"`。CI 不强制,但**改完前端本地必跑一次**。

### 6.5 视觉回归 / E2E

**不做**。理由:
- 视觉回归只能抓回归 bug,不能抓"丑"——温柔绘本风的"好看"是主观的
- Playwright 引入成本(浏览器下载、CI 复杂度)与 1 用户 alpha 阶段不匹配

### 6.6 手动验收(非自动化)

- [ ] 5 空间切换有"我在哪里"清晰感
- [ ] Bunny 姿态对应空间语义
- [ ] 信件→木屋转场流畅
- [ ] 24"/13"/笔记本不同屏幕排版不溢出
- [ ] 暗光环境眼睛舒适
- [ ] 字号 / 间距 3-6 岁能看清
- [ ] 错误显示 Bunny 语气,无技术错误码
- [ ] PIN 流程顺畅
- [ ] `prefers-reduced-motion` 降级生效
- [ ] (真小朋友试用)能否独立用 1 节课

### 6.7 完工自验证流程(强制)

代码完成后 Claude 必须自己跑完才算交付:

1. `pnpm exec tsc --noEmit && pnpm test` 全过
2. `pnpm run smoke` 所有路由 200 + JSON shape 正确
3. `pnpm run dev` 手动 happy path(院子 → 信件 → 木屋 → 完成 → 总结 → 回院子 → 储物间 → 阁楼设 PIN → 验证 PIN → 阁楼内)
4. 故意触发错误场景(屏蔽 /api/courses;PIN 错 3 次)
5. OS 开启"减少动效"看 reduced-motion 降级

只有 1-5 全过才能交给用户验收。

## 7. 实施顺序

```
L1  Design tokens         tailwind config + globals.css + 字体 + layout.tsx 字体加载
L2  Types + 课程数据       types/course (加 theme) + types/progress
                          data/courses/*.ts (填 theme)
L3  UI 原子               Button / Surface / Stars / PinPad / icons/
L4  Bunny v2              bunny/Bunny.tsx + 测试(pose × mood 矩阵)
L5  Scenes                scene/SceneFrame + 5 个 SceneSVG
L6  Data 层 + 测试         lib/progress.ts + lib/pin.ts + lib/stats.ts(纯函数全测)
L7  新 API + 测试          /api/progress, /api/sessions, /api/stats(内存 sqlite)
L8  Lesson 改造            WordBook + SubtitleBar + BloomButton + LessonView 重写
L9  Home 改造              LetterCard + page.tsx 重写
L10 Done 页                StickerWord + LessonDoneClient
L11 Journal 页             BookShelf + WordEntry + JournalClient
L12 Parents 页             PinGate + StatsCard + SessionRow + ParentsClient
L13 转场                   template.tsx + motion variants(信件→木屋 layoutId)
L14 错误 / 空 / loading   ErrorBoundary + skeleton + 各页面降级
L15 a11y                  reduced-motion / aria / focus-visible / 对比度复核
L16 自验证                pnpm tsc + pnpm test + pnpm smoke + 手动 happy path + 错误场景
L17 文档同步              更新 docs/architecture.md(新增前端章节)+ commit
```

每层完成 = 文件 + 测试都过。L8-L12 各页面互相独立可分批写,但用户决定一次性合并到一个大 commit / PR。

## 8. 完工验收(给执行 agent 自查用)

执行 agent 在交付前必须自查这份清单全过:

### 代码层
- [ ] `pnpm exec tsc --noEmit` 0 错
- [ ] `pnpm test` 全过(含新增 vitest)
- [ ] `pnpm run smoke` 全 200
- [ ] 所有新建 ⭐ 文件存在
- [ ] 所有重写 ✎ 文件改完
- [ ] 删除 ✗ 文件已删 + 无悬挂 import

### 功能层
- [ ] 院子首页:信件可见 + 可点 + theme 颜色正确
- [ ] 上课页:Bunny 全身 + push-to-talk 工作 + 字幕条出现
- [ ] 总结页:贴纸动画播放 + 按钮 work
- [ ] 进度页:架子显示 + ★ 1-3 正确派生
- [ ] 家长后台:首次 PIN 设置 + 二次验证 + 锁定 + dashboard 数据

### 体验层
- [ ] 5 空间切换有沉浸感
- [ ] Bunny 4 个 mood + 5 个 pose 视觉可辨
- [ ] 转场动画流畅(信件→木屋有 layoutId 效果)
- [ ] `prefers-reduced-motion` 设备背景动画关停,Bunny mood 仍动
- [ ] 所有错误显示 Bunny 语气

### 文档层
- [ ] `docs/architecture.md` 新增 / 更新前端章节
- [ ] commit message 列实质改动 + Co-Authored-By: Claude

## 9. 已确认的关键决策(对话原文摘要)

1. 设备:**桌面 only**(不做移动响应)
2. 视觉风格:**温柔绘本风**
3. 范围:**4 项全做**(首页 + 上课页 + 总结页 + 进度页 + 家长后台 = 5 个页面)
4. AI 老师:**保留 Bunny,升级精细手绘全身**
5. 交互:**保留 push-to-talk,仅优化 UI**
6. 整体方案:**Bunny 的小院子**(场景串联)
7. 插画策略:**Claude 写 SVG 占位 + 用户后补精画**(无缝替换)
8. 交付节奏:**一口气全部交付**(用户决定,接受风险)
9. 总结页:**独立 route** `/lesson/[id]/done`
10. PIN:**首次设置**(不写死默认值),hash 存 localStorage
11. 进度页:**只用 ★,不显示百分比 / 数字**
12. 课程加 `theme` 字段:**OK**
13. 不引入状态管理库:**OK**
14. 信件 → 木屋用 `layoutId` 转场:**OK**
15. 清理 `CourseCard.tsx` / `Card.tsx` / 移 `Bunny.tsx`:**OK**
16. 错误完全用 Bunny 语气,无技术错误码:**OK**
17. 总结页 0 词显示鼓励文案不显示 0 ★:**OK**
18. reduced-motion 关背景动画保留 mood 动画:**OK**
19. 不做深度屏幕阅读器:**OK**
20. 不引入 Playwright:**OK**
21. 不做视觉回归:**OK**
22. 6.7 自验证流程强制:**OK**

## 10. 不在本 spec 范围内(后续 phase)

- AI 生成插画接入(用户后期手动 PNG 替换是本 spec 边界)
- 多角色 / 多老师切换
- TTS 音色 UI 切换(仅展示,不允许 UI 修改)
- 难度档实装(UI 占位,逻辑不实装)
- 学习提醒 / 通知
- 多孩子档案
- 数据导出 / 分享
- 移动端适配

---

**实施前置**:用户审阅本 spec 并明确批准后,Claude 调用 `superpowers:writing-plans` 生成实施计划。

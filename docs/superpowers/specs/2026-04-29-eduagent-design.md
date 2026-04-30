# EduAgent - 儿童英语教学 Agent 设计文档

## 1. 产品概述

面向儿童英语启蒙的多模态 AI 教学系统。AI 围绕课程目标主动带课，通过语音对话、图片互动和视觉工具，让小朋友从被动听课变成主动参与学习。

### 1.1 MVP 目标

验证课堂体验是否成立：
1. 小朋友能和 AI 对话（语音输入 → AI 语音回复）
2. AI 能围绕课程目标主动带课
3. 图片配合语音产生上课感
4. focus/annotate 工具能提升注意力
5. 一节课能从开场到结束自然走完
6. 日志能记录交互次数、词汇表现、Token 消耗

### 1.2 MVP 不做

- 复杂用户系统
- 商业化订阅
- 发音评分
- 课后报告页面（但需要后端日志）
- 大规模内容管理
- 完全自动化教学路径

---

## 2. 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 14 (App Router) |
| 语言 | TypeScript |
| 前端 | React + Tailwind CSS |
| 动画 | Framer Motion |
| 视觉工具 | HTML5 Canvas |
| 音频 | Web Audio API + MediaRecorder |
| 后端 | Next.js API Routes |
| 数据库 | SQLite (better-sqlite3) |
| ASR | MiMo-V2.5-ASR |
| LLM | MiMo-V2.5-Pro |
| TTS | MiMo-V2.5-TTS |
| 包管理 | pnpm |

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────┐
│                   Browser (Client)               │
│                                                   │
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ 课堂界面   │  │ 录音组件   │  │ 视觉工具层   │  │
│  │ LessonView │  │ Recorder  │  │ Canvas       │  │
│  └─────┬─────┘  └─────┬─────┘  └──────┬───────┘  │
│        └──────────────┼────────────────┘          │
│                       │                           │
└───────────────────────┼───────────────────────────┘
                        │ HTTP
                        ▼
┌─────────────────────────────────────────────────┐
│              Next.js API Routes                  │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐  │
│  │/api/lesson│  │/api/audio│  │/api/chat        │  │
│  └────┬─────┘  └────┬─────┘  └───────┬─────────┘  │
│         ▼                    ▼                    │
│  ┌─────────────────────────────────────────────┐  │
│  │           Teaching Agent Service             │  │
│  │                                               │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │  │ Prompt   │  │ Tool     │  │ Memory   │  │Session ││
│  │  │ Builder  │  │ Executor │  │ Manager  │  │Manager ││
│  │  └─────────┘  └──────────┘  └──────────┘  └────────┘│
│  └──────────────────┬──────────────────────────┘  │
│                     │                             │
└─────────────────────┼─────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ MiMo ASR │  │ MiMo LLM │  │ MiMo TTS │
  └──────────┘  └──────────┘  └──────────┘
                      │
                      ▼
              ┌──────────────┐
              │    SQLite     │
              └──────────────┘
```

---

## 4. Teaching Agent 核心设计

### 4.1 架构方案

采用 **LLM 驱动 + 结构化输出** 方案。LLM 作为课堂大脑，每一轮对话后自行决定下一步动作。LLM 输出结构化 JSON（包含 speech、actions、state_update），后端解析后分发给前端执行。

### 4.2 System Prompt 结构

System Prompt 由以下部分动态组装：

```
┌─────────────────────────────────────────┐
│            System Prompt                 │
│                                          │
│  1. 角色定义                              │
│     你是一个儿童英语教学助手...            │
│                                          │
│  2. 课程信息（动态注入）                   │
│     主题 / 目标词汇 / 目标句型 / 图片      │
│                                          │
│  3. 教学策略                              │
│     中文讲解 + 英文输入                    │
│     每个词节奏：讲→读→问                   │
│     鼓励为主，不纠正发音                   │
│                                          │
│  4. 工具使用说明                          │
│     show / focus / annotate              │
│                                          │
│  5. 当前课堂状态（每轮动态注入）            │
│     当前词 / 已学 / 学生表现 / 环节        │
└─────────────────────────────────────────┘
```

### 4.3 语言策略

- 讲解以中文为主
- 英文作为目标词和目标句型输入
- 提问时：中文一句 + 英文一句
- 语速稍慢，适合儿童

示例：
> 这是什么？What is this?
> 你能说 train 吗？Can you say train?

### 4.4 LLM 输出格式

每轮 LLM 输出包含三部分：

```json
{
  "speech": "这是火车，英文是 train。你能说 train 吗？",
  "actions": [
    { "tool": "show", "params": { "image_id": "transportation_all" } },
    { "tool": "focus", "params": { "target": "train", "style": "zoom" } },
    { "tool": "annotate", "params": { "type": "circle", "target": "train" } }
  ],
  "state_update": {
    "current_word": "train",
    "phase": "learning",
    "words_learned": ["car", "bus", "train"]
  }
}
```

### 4.5 对话循环

```
小朋友说话
    ↓
ASR 转文字
    ↓
构建 messages 数组:
  [system_prompt, ...history, new_user_message]
    ↓
调用 MiMo LLM (with tool calling)
    ↓
解析响应:
  ├── speech → TTS 播放
  ├── actions → 执行视觉工具
  └── state_update → 更新课堂状态
    ↓
等待下一轮输入
```

### 4.6 记忆系统 (Memory Manager)

在 Agent 和 LLM 之间加一个 Memory Manager，负责维护课堂记忆并注入 prompt。

#### 记忆类型

| 类型 | 内容 | 作用 |
|------|------|------|
| 对话历史 | 最近 20 轮消息 | 理解上下文 |
| 当前状态 | 当前词、环节、已学词汇 | 知道自己在干嘛 |
| 兴趣信号 | 小朋友的提问、偏好、沉默 | 判断要不要拓展 |
| 词汇表现 | 哪些词答对/答错 | 调整教学节奏 |

#### 数据结构

```typescript
interface LessonMemory {
  messages: Message[];                    // 对话历史
  currentWord: string;                   // 当前正在教的词
  phase: 'opening' | 'review' | 'learning' | 'quiz' | 'closing';
  wordsLearned: string[];                // 已学过的词
  wordsToReview: string[];               // 需要复习的词
  interestSignals: InterestSignal[];     // 兴趣信号
  wordPerformance: Map<string, WordPerf>; // 词汇表现
  silentTurns: number;                   // 连续无回应轮数
  totalInteractions: number;             // 总交互次数
}

interface InterestSignal {
  type: 'question' | 'preference' | 'confusion' | 'engagement';
  description: string;
  timestamp: Date;
  relatedWord?: string;
}

interface WordPerf {
  attempts: number;
  correct: number;
  lastAttempt: Date;
}
```

#### 兴趣信号 → 内容生成闭环

```
小朋友说："竹筏是不是船？"
    ↓
Memory Manager 检测到兴趣信号
    ↓
在 system prompt 中注入兴趣上下文
    ↓
LLM 决定生成新内容
    ↓
输出 speech + actions + state_update
    ↓
Memory Manager 记录兴趣和新内容
    ↓
后续 prompt 中持续注入，直到回到主线
```

#### Prompt 注入格式

Memory Manager 将记忆摘要注入 system prompt：

```
## 当前课堂状态
- 当前正在教: train
- 当前环节: learning
- 已学词汇: car, bus
- 需复习: bus

## 学生兴趣信号
- 学生对水上交通工具感兴趣（问了"竹筏是不是船"）
建议：适当拓展，但要拉回教学主线。

## 注意力状态
- 学生已经 3 轮没有回应
建议：换个方式提问，或者切换到新的话题
```

#### MVP 记忆能力

**有：** 对话历史、当前状态、兴趣信号检测、词汇表现追踪
**没有：** 跨课程记忆、长期学习画像、复杂兴趣模型

---

## 5. 原子工具设计

工具设计遵循老师在课堂上的原子动作：**指、换、标**。

### 5.1 show — 展示/切换内容

对应老师的「换」动作。展示新图片、切换画面。

```typescript
{
  tool: "show",
  params: {
    image_id: "transportation_all"  // 要展示的图片 ID
  }
}
```

前端行为：淡入动画切换显示（300ms）。

### 5.2 focus — 聚焦注意力

对应老师的「指」动作。让小朋友注意某个区域。通过 `style` 参数控制视觉效果。

```typescript
{
  tool: "focus",
  params: {
    target: "train",               // 目标区域 ID
    style: "zoom" | "highlight" | "circle" | "pulse"
  }
}
```

| style | 视觉效果 | 教学场景 |
|-------|---------|---------|
| zoom | 放大目标区域 | "仔细看看这个" |
| highlight | 高亮发光 | "这个！注意！" |
| circle | 画圈标注 | "在这里" |
| pulse | 闪烁 | "这个是重点" |

动画时长：500-800ms。

### 5.3 annotate — 画标记

对应老师的「标」动作。在画面上做持久标记。

```typescript
{
  tool: "annotate",
  params: {
    type: "circle" | "checkmark" | "arrow" | "text",
    target: "train",
    content: "✓"  // 可选，文字标注内容
  }
}
```

### 5.4 generate — 生成新内容

生成新的教学内容（例句、问题、对比）。这不是前端工具，而是 LLM 的 prompt 级行为——LLM 在 `speech` 中直接包含生成的内容。

当 LLM 需要生成新内容时，在 `state_update` 中记录：

```typescript
state_update: {
  generated_content: {
    type: "sentence" | "question" | "comparison",
    content: "The bamboo raft is on the water.",
    topic: "bamboo raft"
  }
}
```

前端可选择将生成的内容显示为特殊字幕样式。

### 5.5 工具设计原则

- 前端原子工具 3 个（show/focus/annotate）+ prompt 级行为 1 个（generate），LLM 容易学会
- `focus` 的 style 可以自由组合，比多个独立工具更灵活
- 老师的思维模式是「我要让孩子看这里」，不是「我要调用 circle 工具」
- 后续扩展只需要加新的 style，不需要加新工具

---

## 6. 视觉工具技术实现

### 6.1 Canvas Overlay

在教学图片上方覆盖一个透明 Canvas 层，用于绘制标注。

```
┌─────────────────────────────────┐
│          浏览器视口              │
│  ┌───────────────────────────┐  │
│  │     Canvas Overlay (透明)   │  │  ← annotate 绘制
│  │  ┌─────────────────────┐  │  │
│  │  │                     │  │  │
│  │  │   教学图片           │  │  │  ← 底层图片
│  │  │                     │  │  │
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │   字幕 + 录音按钮          │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### 6.2 坐标系统

每个课程的图片需要预定义目标区域：

```typescript
interface ImageRegion {
  id: string;          // "train"
  label: string;       // "Train 火车"
  bbox: {
    x: number;         // 左上角 x (0-1 归一化)
    y: number;         // 左上角 y (0-1 归一化)
    w: number;         // 宽度 (0-1 归一化)
    h: number;         // 高度 (0-1 归一化)
  };
}
```

### 6.3 focus 工具实现

| style | 实现方式 |
|-------|---------|
| zoom | CSS transform: scale(2) + translate，平滑动画 |
| highlight | Canvas 发光滤镜 (shadowBlur + shadowColor) |
| circle | Canvas 绘制圆形路径，动画绘制 |
| pulse | CSS opacity 循环动画 |

---

## 7. 语音管线 (Voice Pipeline)

### 7.1 流程

```
浏览器麦克风 → MediaRecorder 录音 (webm/opus)
    ↓
POST /api/audio/upload
    ↓
后端转码为 WAV (ffmpeg)
    ↓
MiMo ASR → 文字
    ↓
文字 + 上下文 → MiMo LLM
    ↓
LLM 输出 speech 文本
    ↓
MiMo TTS → 音频 (mp3)
    ↓
返回前端播放
```

### 7.2 录音

- 使用 `MediaRecorder` API
- 格式：webm/opus（浏览器原生支持，体积小）
- MVP：手动点击录音按钮开始/停止
- 不支持 VAD 自动检测、打断/插话

### 7.3 ASR 调用

```
POST {MIMO_BASE_URL}/audio/transcriptions
Content-Type: multipart/form-data

file: audio.wav
model: MiMo-V2.5-ASR
language: zh
```

### 7.4 TTS 调用

```
POST {MIMO_BASE_URL}/audio/speech
Content-Type: application/json

{
  "model": "MiMo-V2.5-TTS",
  "input": "这是火车，英文是 train",
  "voice": "child_friendly"
}
```

### 7.5 前端播放流程

```
收到 TTS 音频 → 创建 Audio 对象
    ↓
播放音频 + 同时显示字幕
    ↓
播放完成 → 显示「说话」按钮
    ↓
小朋友点击 → 开始录音
    ↓
录音完成 → 上传 → 循环
```

---

## 8. 课程数据模型

### 8.1 Course

```typescript
interface Course {
  id: string;                    // "transportation"
  title: string;                 // "交通工具 Transportation"
  description: string;
  targetAge: [number, number];   // [3, 6]
  objectives: {
    words: Word[];
    sentences: string[];
  };
  images: CourseImage[];
  teachingHints: {
    opening: string;
    reviewWords: string[];
    newWords: string[];
    quizQuestions: string[];
    closing: string;
  };
}
```

### 8.2 Word

```typescript
interface Word {
  english: string;       // "train"
  chinese: string;       // "火车"
  phonetic?: string;     // "/treɪn/"
  imageId?: string;
  difficulty: number;    // 1-5
  tags: string[];
}
```

### 8.3 CourseImage

```typescript
interface CourseImage {
  id: string;            // "transportation_all"
  url: string;
  description: string;
  regions: ImageRegion[];
}
```

### 8.4 示例课程（Transportation）

```typescript
const transportationCourse: Course = {
  id: "transportation",
  title: "交通工具 Transportation",
  targetAge: [3, 6],
  objectives: {
    words: [
      { english: "car", chinese: "小汽车", difficulty: 1, tags: ["vehicle"] },
      { english: "bus", chinese: "公交车", difficulty: 1, tags: ["vehicle"] },
      { english: "train", chinese: "火车", difficulty: 2, tags: ["vehicle"] },
      { english: "airplane", chinese: "飞机", difficulty: 2, tags: ["vehicle"] },
      { english: "bicycle", chinese: "自行车", difficulty: 2, tags: ["vehicle"] },
      { english: "boat", chinese: "船", difficulty: 2, tags: ["vehicle"] },
    ],
    sentences: [
      "What is this?",
      "This is a ___.",
      "Can you say ___?",
      "I like ___."
    ]
  },
  images: [{
    id: "transportation_all",
    url: "/images/transportation/all.png",
    description: "一张包含多种交通工具的图片",
    regions: [
      { id: "car", label: "Car 小汽车", bbox: { x: 0.1, y: 0.2, w: 0.2, h: 0.3 } },
      { id: "bus", label: "Bus 公交车", bbox: { x: 0.4, y: 0.2, w: 0.2, h: 0.3 } },
      { id: "train", label: "Train 火车", bbox: { x: 0.7, y: 0.2, w: 0.2, h: 0.3 } },
    ]
  }],
  teachingHints: {
    opening: "今天我们学习交通工具！看看这些是什么？",
    reviewWords: ["car", "bus"],
    newWords: ["train", "airplane", "bicycle", "boat"],
    quizQuestions: [
      "哪个是 airplane？",
      "你能说 train 吗？",
      "What is this? (指向 car)"
    ],
    closing: "今天我们学了 train, airplane, bicycle, boat，下次继续！"
  }
};
```

---

## 9. 页面设计

### 9.1 页面流程

```
┌─────────┐     ┌─────────┐
│  课程选择 │ ──→ │  课堂    │
│  Home    │     │  Lesson  │
└─────────┘     └─────────┘
```

### 9.2 课程选择页 (Home)

- 展示可用课程卡片
- 每个卡片：主题图、标题、目标词汇数、年龄段
- 点击进入课堂

### 9.3 课堂页 (Lesson) — 核心页面

布局：中心大图 + 底部对话

```
┌─────────────────────────────────┐
│  课程标题  │  进度指示           │  ← 顶部栏
├─────────────────────────────────┤
│                                 │
│                                 │
│        教学图片 + Canvas         │  ← 主区域 (70%)
│                                 │
│                                 │
├─────────────────────────────────┤
│  AI 字幕文本          [🎤 录音]  │  ← 底部栏
└─────────────────────────────────┘
```

---

## 10. 日志系统

### 10.1 LessonLog

```typescript
interface LessonLog {
  sessionId: string;
  courseId: string;
  startTime: Date;
  endTime: Date;
  interactionCount: number;
  interactions: InteractionLog[];
  wordPerformance: WordPerformance[];
  tokenUsage: TokenUsage;
}
```

### 10.2 InteractionLog

```typescript
interface InteractionLog {
  timestamp: Date;
  userInput: string;
  aiResponse: string;
  actions: ToolAction[];
  modelCalls: {
    asr?: { latency: number; tokens: number; };
    llm: { latency: number; inputTokens: number; outputTokens: number; };
    tts?: { latency: number; characters: number; };
  };
}
```

### 10.3 WordPerformance

```typescript
interface WordPerformance {
  word: string;
  attempts: number;
  correct: boolean;
  needsReview: boolean;
}
```

### 10.4 TokenUsage

```typescript
interface TokenUsage {
  asr: { requests: number; tokens: number; };
  llm: { requests: number; inputTokens: number; outputTokens: number; };
  tts: { requests: number; characters: number; };
}
```

### 10.5 日志输出

- 开发阶段：输出到控制台
- 持久化：写入 SQLite
- 后续可做成可视化面板

---

## 11. 课堂标准流程

每节课由 LLM 自主引导，参考以下流程：

### Step 1：开场

AI 主动开始：
> 今天我们学习交通工具。Today we learn transportation.

### Step 2：复习已知词

AI 提问已知词（car, bus）：
> 这是什么？What is this?

### Step 3：学习新词

每个词的节奏：
1. AI 讲中文意思
2. AI 说英文单词
3. 系统 focus + annotate 图片
4. 小朋友跟读
5. AI 简单提问

### Step 4：互动问答

小朋友可以随时提问，AI 回答并尽量拉回教学目标。

### Step 5：生成拓展内容

如果小朋友感兴趣，AI 临时生成新内容（例句、对比、问题）。

### Step 6：复习小测

AI 主动问：
> 哪个是 airplane？Which one is airplane?

### Step 7：结束

AI 总结本节课学过的词。

---

## 12. 项目结构

```
eduagent/
├── src/
│   ├── app/
│   │   ├── page.tsx                      # 课程选择页
│   │   ├── lesson/[id]/page.tsx          # 课堂页
│   │   ├── layout.tsx                    # 全局布局
│   │   ├── globals.css
│   │   └── api/
│   │       ├── lesson/route.ts           # 课程 API
│   │       ├── audio/route.ts            # 音频处理 API
│   │       └── chat/route.ts             # 对话 API
│   │
│   ├── components/
│   │   ├── lesson/
│   │   │   ├── LessonView.tsx            # 课堂主组件
│   │   │   ├── ImageCanvas.tsx           # 图片+Canvas 标注层
│   │   │   ├── SubtitleBar.tsx           # 字幕栏
│   │   │   └── RecordButton.tsx          # 录音按钮
│   │   ├── tools/
│   │   │   ├── FocusTool.tsx             # focus 工具渲染
│   │   │   ├── AnnotateTool.tsx          # annotate 工具渲染
│   │   │   └── ShowTool.tsx              # show 工具渲染
│   │   ├── home/
│   │   │   └── CourseCard.tsx            # 课程卡片
│   │   └── ui/
│   │       ├── Button.tsx
│   │       └── Card.tsx
│   │
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── prompt.ts                 # System Prompt 构建
│   │   │   ├── tools.ts                  # Tool 定义
│   │   │   ├── memory.ts                 # 记忆管理
│   │   │   └── session.ts                # 会话管理
│   │   ├── mimo/
│   │   │   ├── asr.ts                    # MiMo ASR
│   │   │   ├── llm.ts                    # MiMo LLM
│   │   │   └── tts.ts                    # MiMo TTS
│   │   ├── db/
│   │   │   ├── schema.ts                 # 数据库 Schema
│   │   │   └── queries.ts                # 数据库查询
│   │   └── logger.ts                     # 日志系统
│   │
│   ├── data/
│   │   └── courses/
│   │       └── transportation.ts         # 示例课程
│   │
│   └── types/
│       ├── course.ts
│       ├── session.ts
│       └── tools.ts
│
├── public/
│   └── images/
│       └── transportation/
│           └── all.png
│
├── db/                                   # SQLite 文件
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .env.local
```

---

## 13. 环境变量

```env
MIMO_BASE_URL=https://api.mimo.com/v1
MIMO_API_KEY=your_api_key_here
DATABASE_PATH=./db/eduagent.db
```

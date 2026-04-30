# EduAgent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a children's English teaching Agent application with voice interaction, visual tools, and LLM-driven lesson flow.

**Architecture:** Next.js full-stack app with MiMo AI models (ASR/LLM/TTS). LLM drives lesson flow via structured JSON output. Frontend renders visual tools (Canvas overlay) and handles audio recording/playback. SQLite stores lesson logs.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Framer Motion, HTML5 Canvas, better-sqlite3, MiMo API (ASR + LLM + TTS)

---

## File Structure

```
eduagent/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Home: course selection
│   │   ├── lesson/[id]/page.tsx              # Lesson: classroom page
│   │   ├── lesson/[id]/LessonClient.tsx      # Lesson client component
│   │   ├── layout.tsx                        # Root layout
│   │   ├── globals.css                       # Global styles
│   │   └── api/
│   │       ├── courses/route.ts              # GET courses
│   │       ├── chat/route.ts                 # POST chat (LLM)
│   │       └── audio/route.ts                # POST audio (ASR + TTS)
│   │
│   ├── components/
│   │   ├── home/
│   │   │   └── CourseCard.tsx                # Course card component
│   │   ├── lesson/
│   │   │   ├── LessonView.tsx                # Main lesson container
│   │   │   ├── ImageCanvas.tsx               # Image + Canvas overlay
│   │   │   ├── SubtitleBar.tsx               # AI speech subtitle
│   │   │   └── RecordButton.tsx              # Microphone button
│   │   ├── tools/
│   │   │   ├── ShowTool.tsx                  # Image switch animation
│   │   │   ├── FocusTool.tsx                 # Zoom/highlight/circle/pulse
│   │   │   └── AnnotateTool.tsx              # Persistent marks
│   │   └── ui/
│   │       ├── Button.tsx                    # Reusable button
│   │       └── Card.tsx                      # Reusable card
│   │
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── prompt.ts                     # System prompt builder
│   │   │   ├── memory.ts                     # Lesson memory manager
│   │   │   ├── session.ts                    # Session lifecycle
│   │   │   └── tools.ts                      # Tool definitions + parser
│   │   ├── mimo/
│   │   │   ├── asr.ts                        # MiMo ASR client
│   │   │   ├── llm.ts                        # MiMo LLM client
│   │   │   └── tts.ts                        # MiMo TTS client
│   │   ├── db/
│   │   │   ├── index.ts                      # DB connection
│   │   │   ├── schema.ts                     # Table definitions
│   │   │   └── queries.ts                    # CRUD operations
│   │   └── logger.ts                         # Lesson logger
│   │
│   ├── data/
│   │   └── courses/
│   │       └── transportation.ts             # Example course
│   │
│   └── types/
│       ├── course.ts                         # Course, Word, CourseImage
│       ├── session.ts                        # LessonSession, Message
│       └── tools.ts                          # ToolAction, ToolParams
│
├── public/
│   └── images/
│       └── transportation/
│           └── all.png                       # Placeholder image
│
├── db/                                       # SQLite database file
├── .env.local                                # Environment variables
└── vitest.config.ts                          # Test config
```

---

### Task 1: Project Setup & Type Definitions

**Files:**
- Create: `src/types/course.ts`
- Create: `src/types/session.ts`
- Create: `src/types/tools.ts`
- Create: `.env.local`
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install additional dependencies**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
pnpm add uuid
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create `.env.local`**

```env
MIMO_BASE_URL=https://api.mimo.com/v1
MIMO_API_KEY=your_api_key_here
DATABASE_PATH=./db/eduagent.db
```

- [ ] **Step 3: Create `src/types/course.ts`**

```typescript
export interface Word {
  english: string;
  chinese: string;
  phonetic?: string;
  imageId?: string;
  difficulty: number;
  tags: string[];
}

export interface ImageRegion {
  id: string;
  label: string;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface CourseImage {
  id: string;
  url: string;
  description: string;
  regions: ImageRegion[];
}

export interface TeachingHints {
  opening: string;
  reviewWords: string[];
  newWords: string[];
  quizQuestions: string[];
  closing: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  targetAge: [number, number];
  objectives: {
    words: Word[];
    sentences: string[];
  };
  images: CourseImage[];
  teachingHints: TeachingHints;
}
```

- [ ] **Step 4: Create `src/types/tools.ts`**

```typescript
export type FocusStyle = 'zoom' | 'highlight' | 'circle' | 'pulse';
export type AnnotateType = 'circle' | 'checkmark' | 'arrow' | 'text';

export interface ShowParams {
  image_id: string;
}

export interface FocusParams {
  target: string;
  style: FocusStyle;
}

export interface AnnotateParams {
  type: AnnotateType;
  target: string;
  content?: string;
}

export interface GenerateState {
  type: 'sentence' | 'question' | 'comparison';
  content: string;
  topic: string;
}

export type ToolName = 'show' | 'focus' | 'annotate';

export interface ToolAction {
  tool: ToolName;
  params: ShowParams | FocusParams | AnnotateParams;
}

export interface AgentResponse {
  speech: string;
  actions: ToolAction[];
  state_update: {
    current_word?: string;
    phase?: 'opening' | 'review' | 'learning' | 'quiz' | 'closing';
    words_learned?: string[];
    generated_content?: GenerateState;
  };
}
```

- [ ] **Step 5: Create `src/types/session.ts`**

```typescript
import { ToolAction } from './tools';

export type LessonPhase = 'opening' | 'review' | 'learning' | 'quiz' | 'closing';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ToolAction[];
}

export interface InterestSignal {
  type: 'question' | 'preference' | 'confusion' | 'engagement';
  description: string;
  timestamp: Date;
  relatedWord?: string;
}

export interface WordPerf {
  attempts: number;
  correct: number;
  lastAttempt: Date;
}

export interface LessonMemory {
  messages: Message[];
  currentWord: string;
  phase: LessonPhase;
  wordsLearned: string[];
  wordsToReview: string[];
  interestSignals: InterestSignal[];
  wordPerformance: Map<string, WordPerf>;
  silentTurns: number;
  totalInteractions: number;
}

export interface InteractionLog {
  timestamp: Date;
  userInput: string;
  aiResponse: string;
  actions: ToolAction[];
  modelCalls: {
    asr?: { latency: number; tokens: number };
    llm: { latency: number; inputTokens: number; outputTokens: number };
    tts?: { latency: number; characters: number };
  };
}

export interface TokenUsage {
  asr: { requests: number; tokens: number };
  llm: { requests: number; inputTokens: number; outputTokens: number };
  tts: { requests: number; characters: number };
}

export interface LessonLog {
  sessionId: string;
  courseId: string;
  startTime: Date;
  endTime: Date;
  interactionCount: number;
  interactions: InteractionLog[];
  tokenUsage: TokenUsage;
}
```

- [ ] **Step 6: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 7: Verify types compile**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "feat: project setup with type definitions"
```

---

### Task 2: Database Schema & Queries

**Files:**
- Create: `src/lib/db/index.ts`
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/queries.ts`

- [ ] **Step 1: Create `src/lib/db/index.ts`**

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './db/eduagent.db';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.resolve(process.cwd(), DB_PATH);
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}
```

- [ ] **Step 2: Create `src/lib/db/schema.ts`**

```typescript
import { getDb } from './index';

export function initDatabase(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS lesson_logs (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      interaction_count INTEGER DEFAULT 0,
      token_usage TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS interaction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      user_input TEXT DEFAULT '',
      ai_response TEXT DEFAULT '',
      actions TEXT DEFAULT '[]',
      model_calls TEXT DEFAULT '{}',
      FOREIGN KEY (lesson_id) REFERENCES lesson_logs(id)
    );

    CREATE TABLE IF NOT EXISTS word_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL,
      word TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      needs_review INTEGER DEFAULT 0,
      FOREIGN KEY (lesson_id) REFERENCES lesson_logs(id)
    );
  `);
}
```

- [ ] **Step 3: Create `src/lib/db/queries.ts`**

```typescript
import { getDb } from './index';
import { TokenUsage, InteractionLog } from '@/types/session';

export function createLessonLog(id: string, courseId: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO lesson_logs (id, course_id, start_time) VALUES (?, ?, ?)'
  ).run(id, courseId, new Date().toISOString());
}

export function finishLessonLog(id: string, interactionCount: number, tokenUsage: TokenUsage): void {
  const db = getDb();
  db.prepare(
    'UPDATE lesson_logs SET end_time = ?, interaction_count = ?, token_usage = ? WHERE id = ?'
  ).run(new Date().toISOString(), interactionCount, JSON.stringify(tokenUsage), id);
}

export function insertInteraction(lessonId: string, log: InteractionLog): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO interaction_logs (lesson_id, timestamp, user_input, ai_response, actions, model_calls) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    lessonId,
    log.timestamp.toISOString(),
    log.userInput,
    log.aiResponse,
    JSON.stringify(log.actions),
    JSON.stringify(log.modelCalls)
  );
}

export function upsertWordPerformance(lessonId: string, word: string, correct: boolean): void {
  const db = getDb();
  const existing = db.prepare(
    'SELECT * FROM word_performance WHERE lesson_id = ? AND word = ?'
  ).get(lessonId, word) as { attempts: number; correct: number } | undefined;

  if (existing) {
    db.prepare(
      'UPDATE word_performance SET attempts = ?, correct = ?, needs_review = ? WHERE lesson_id = ? AND word = ?'
    ).run(
      existing.attempts + 1,
      existing.correct + (correct ? 1 : 0),
      existing.correct + (correct ? 1 : 0) < existing.attempts + 1 ? 1 : 0,
      lessonId,
      word
    );
  } else {
    db.prepare(
      'INSERT INTO word_performance (lesson_id, word, attempts, correct, needs_review) VALUES (?, ?, ?, ?, ?)'
    ).run(lessonId, word, 1, correct ? 1 : 0, correct ? 0 : 1);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/
git commit -m "feat: database schema and queries for lesson logging"
```

---

### Task 3: Course Data

**Files:**
- Create: `src/data/courses/transportation.ts`

- [ ] **Step 1: Create `src/data/courses/transportation.ts`**

```typescript
import { Course } from '@/types/course';

export const transportationCourse: Course = {
  id: 'transportation',
  title: '交通工具 Transportation',
  description: '学习常见的交通工具英文名称',
  targetAge: [3, 6],
  objectives: {
    words: [
      { english: 'car', chinese: '小汽车', difficulty: 1, tags: ['vehicle'] },
      { english: 'bus', chinese: '公交车', difficulty: 1, tags: ['vehicle'] },
      { english: 'train', chinese: '火车', difficulty: 2, tags: ['vehicle'] },
      { english: 'airplane', chinese: '飞机', difficulty: 2, tags: ['vehicle'] },
      { english: 'bicycle', chinese: '自行车', difficulty: 2, tags: ['vehicle'] },
      { english: 'boat', chinese: '船', difficulty: 2, tags: ['vehicle'] },
    ],
    sentences: [
      'What is this?',
      'This is a ___.',
      'Can you say ___?',
      'I like ___.',
    ],
  },
  images: [
    {
      id: 'transportation_all',
      url: '/images/transportation/all.png',
      description: '一张包含多种交通工具的图片',
      regions: [
        { id: 'car', label: 'Car 小汽车', bbox: { x: 0.05, y: 0.1, w: 0.25, h: 0.35 } },
        { id: 'bus', label: 'Bus 公交车', bbox: { x: 0.35, y: 0.1, w: 0.25, h: 0.35 } },
        { id: 'train', label: 'Train 火车', bbox: { x: 0.65, y: 0.1, w: 0.25, h: 0.35 } },
        { id: 'airplane', label: 'Airplane 飞机', bbox: { x: 0.05, y: 0.55, w: 0.25, h: 0.35 } },
        { id: 'bicycle', label: 'Bicycle 自行车', bbox: { x: 0.35, y: 0.55, w: 0.25, h: 0.35 } },
        { id: 'boat', label: 'Boat 船', bbox: { x: 0.65, y: 0.55, w: 0.25, h: 0.35 } },
      ],
    },
  ],
  teachingHints: {
    opening: '今天我们学习交通工具！看看这些是什么？',
    reviewWords: ['car', 'bus'],
    newWords: ['train', 'airplane', 'bicycle', 'boat'],
    quizQuestions: [
      '哪个是 airplane？',
      '你能说 train 吗？',
      'What is this? (指向 car)',
    ],
    closing: '今天我们学了 train, airplane, bicycle, boat，下次继续！',
  },
};

export const allCourses: Course[] = [transportationCourse];

export function getCourseById(id: string): Course | undefined {
  return allCourses.find((c) => c.id === id);
}
```

- [ ] **Step 2: Create a placeholder image**

```bash
mkdir -p "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent/public/images/transportation"
```

Create a simple SVG placeholder at `public/images/transportation/all.png` — for now, use a 1x1 pixel placeholder. The real image will be AI-generated later.

- [ ] **Step 3: Commit**

```bash
git add src/data/ public/images/
git commit -m "feat: add transportation course data with placeholder image"
```

---

### Task 4: MiMo API Wrappers

**Files:**
- Create: `src/lib/mimo/asr.ts`
- Create: `src/lib/mimo/llm.ts`
- Create: `src/lib/mimo/tts.ts`

- [ ] **Step 1: Create `src/lib/mimo/llm.ts`**

```typescript
import { AgentResponse } from '@/types/tools';

const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.mimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';

interface LLMResult {
  response: AgentResponse;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  latency: number;
}

export async function callLLM(
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<LLMResult> {
  const start = Date.now();

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'MiMo-V2.5-Pro',
      messages: apiMessages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    throw new Error(`MiMo LLM error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const latency = Date.now() - start;

  const content = data.choices[0].message.content;
  const parsed: AgentResponse = JSON.parse(content);

  return {
    response: parsed,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
    latency,
  };
}
```

- [ ] **Step 2: Create `src/lib/mimo/asr.ts`**

```typescript
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.mimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';

interface ASRResult {
  text: string;
  usage: { tokens: number };
  latency: number;
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<ASRResult> {
  const start = Date.now();

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', blob, 'audio.webm');
  formData.append('model', 'MiMo-V2.5-ASR');
  formData.append('language', 'zh');

  const res = await fetch(`${MIMO_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`MiMo ASR error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const latency = Date.now() - start;

  return {
    text: data.text || '',
    usage: { tokens: data.usage?.total_tokens || 0 },
    latency,
  };
}
```

- [ ] **Step 3: Create `src/lib/mimo/tts.ts`**

```typescript
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.mimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';

interface TTSResult {
  audioBuffer: Buffer;
  usage: { characters: number };
  latency: number;
}

export async function synthesizeSpeech(text: string): Promise<TTSResult> {
  const start = Date.now();

  const res = await fetch(`${MIMO_BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'MiMo-V2.5-TTS',
      input: text,
      voice: 'child_friendly',
    }),
  });

  if (!res.ok) {
    throw new Error(`MiMo TTS error: ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const latency = Date.now() - start;

  return {
    audioBuffer: Buffer.from(arrayBuffer),
    usage: { characters: text.length },
    latency,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/mimo/
git commit -m "feat: MiMo API wrappers for ASR, LLM, and TTS"
```

---

### Task 5: Agent Core — Prompt Builder

**Files:**
- Create: `src/lib/agent/prompt.ts`

- [ ] **Step 1: Create `src/lib/agent/prompt.ts`**

```typescript
import { Course } from '@/types/course';
import { LessonMemory } from '@/types/session';

const ROLE_PROMPT = `你是一个儿童英语教学助手。你的任务是围绕课程目标，主动带着小朋友完成一节课。

## 语言策略
- 讲解以中文为主
- 英文作为目标词和目标句型输入
- 提问时：中文一句 + 英文一句
- 语速稍慢，适合儿童
- 鼓励为主，不纠正发音

## 教学节奏
每个新词的教学节奏：
1. AI 讲中文意思
2. AI 说英文单词
3. 使用 focus 工具让小朋友注意图片
4. 小朋友跟读
5. AI 简单提问

## 输出格式
你必须严格输出以下 JSON 格式，不要输出其他内容：
{
  "speech": "你要说的话（中文+英文混合）",
  "actions": [
    { "tool": "show", "params": { "image_id": "图片ID" } },
    { "tool": "focus", "params": { "target": "目标ID", "style": "zoom|highlight|circle|pulse" } },
    { "tool": "annotate", "params": { "type": "circle|checkmark|arrow|text", "target": "目标ID", "content": "可选文字" } }
  ],
  "state_update": {
    "current_word": "当前正在教的词",
    "phase": "opening|review|learning|quiz|closing",
    "words_learned": ["已学过的词列表"]
  }
}

## 工具说明
- show: 展示/切换图片。params: { image_id: string }
- focus: 聚焦注意力。params: { target: string, style: "zoom"|"highlight"|"circle"|"pulse" }
- annotate: 画标记。params: { type: "circle"|"checkmark"|"arrow"|"text", target: string, content?: string }

actions 数组可以为空 []，如果不需要视觉操作的话。`;

function buildCourseInfo(course: Course): string {
  const wordList = course.objectives.words
    .map((w) => `  - ${w.english} (${w.chinese}) 难度:${w.difficulty}`)
    .join('\n');

  const sentenceList = course.objectives.sentences.map((s) => `  - ${s}`).join('\n');

  const imageList = course.images
    .map((img) => {
      const regionList = img.regions.map((r) => `    - ${r.id}: ${r.label}`).join('\n');
      return `  - ${img.id}: ${img.description}\n  可交互区域:\n${regionList}`;
    })
    .join('\n');

  return `## 课程信息
- 主题: ${course.title}
- 年龄段: ${course.targetAge[0]}-${course.targetAge[1]}岁

### 目标词汇
${wordList}

### 目标句型
${sentenceList}

### 教学图片
${imageList}

### 教学提示
- 开场: ${course.teachingHints.opening}
- 建议先复习: ${course.teachingHints.reviewWords.join(', ')}
- 新词顺序: ${course.teachingHints.newWords.join(', ')}
- 小测问题: ${course.teachingHints.quizQuestions.join(' | ')}
- 结束语: ${course.teachingHints.closing}`;
}

function buildMemoryContext(memory: LessonMemory): string {
  let context = `## 当前课堂状态
- 当前正在教: ${memory.currentWord || '(未开始)'}
- 当前环节: ${memory.phase}
- 已学词汇: ${memory.wordsLearned.join(', ') || '(无)'}
- 需复习: ${memory.wordsToReview.join(', ') || '(无)'}
- 总交互次数: ${memory.totalInteractions}`;

  if (memory.interestSignals.length > 0) {
    context += `\n\n## 学生兴趣信号`;
    for (const signal of memory.interestSignals.slice(-5)) {
      context += `\n- ${signal.description}`;
    }
    context += `\n建议：如果学生对某个话题感兴趣，可以适当拓展，但要拉回教学主线。`;
  }

  if (memory.silentTurns > 2) {
    context += `\n\n## 注意力警告
- 学生已经 ${memory.silentTurns} 轮没有回应
- 建议：换个方式提问，或者切换到新的话题`;
  }

  if (memory.wordPerformance.size > 0) {
    context += `\n\n## 词汇表现`;
    memory.wordPerformance.forEach((perf, word) => {
      const rate = perf.attempts > 0 ? Math.round((perf.correct / perf.attempts) * 100) : 0;
      context += `\n- ${word}: ${perf.correct}/${perf.attempts} (${rate}%)`;
    });
  }

  return context;
}

export function buildSystemPrompt(course: Course, memory: LessonMemory): string {
  return [ROLE_PROMPT, buildCourseInfo(course), buildMemoryContext(memory)].join('\n\n---\n\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/prompt.ts
git commit -m "feat: system prompt builder with course and memory context"
```

---

### Task 6: Agent Core — Memory Manager

**Files:**
- Create: `src/lib/agent/memory.ts`

- [ ] **Step 1: Create `src/lib/agent/memory.ts`**

```typescript
import { LessonMemory, Message, InterestSignal, WordPerf, LessonPhase } from '@/types/session';
import { AgentResponse } from '@/types/tools';

const MAX_HISTORY = 20;

export function createMemory(): LessonMemory {
  return {
    messages: [],
    currentWord: '',
    phase: 'opening',
    wordsLearned: [],
    wordsToReview: [],
    interestSignals: [],
    wordPerformance: new Map(),
    silentTurns: 0,
    totalInteractions: 0,
  };
}

export function addUserMessage(memory: LessonMemory, content: string): LessonMemory {
  const message: Message = {
    role: 'user',
    content,
    timestamp: new Date(),
  };

  const messages = [...memory.messages, message].slice(-MAX_HISTORY);

  // Detect interest signals
  const signals = [...memory.interestSignals];
  if (content.includes('？') || content.includes('?')) {
    signals.push({
      type: 'question',
      description: `学生提问: "${content}"`,
      timestamp: new Date(),
    });
  }
  if (content.includes('喜欢') || content.includes('想')) {
    signals.push({
      type: 'preference',
      description: `学生表达偏好: "${content}"`,
      timestamp: new Date(),
    });
  }

  return {
    ...memory,
    messages,
    interestSignals: signals.slice(-10),
    silentTurns: 0,
    totalInteractions: memory.totalInteractions + 1,
  };
}

export function addAssistantMessage(
  memory: LessonMemory,
  response: AgentResponse
): LessonMemory {
  const message: Message = {
    role: 'assistant',
    content: response.speech,
    timestamp: new Date(),
    actions: response.actions,
  };

  const messages = [...memory.messages, message].slice(-MAX_HISTORY);

  const update = response.state_update;
  const wordPerf = new Map(memory.wordPerformance);

  // Update word performance if we can detect a correct/incorrect response
  if (memory.currentWord && memory.phase === 'learning') {
    const existing = wordPerf.get(memory.currentWord) || {
      attempts: 0,
      correct: 0,
      lastAttempt: new Date(),
    };
    wordPerf.set(memory.currentWord, {
      ...existing,
      attempts: existing.attempts + 1,
      lastAttempt: new Date(),
    });
  }

  return {
    ...memory,
    messages,
    currentWord: update.current_word || memory.currentWord,
    phase: (update.phase as LessonPhase) || memory.phase,
    wordsLearned: update.words_learned || memory.wordsLearned,
    wordPerformance: wordPerf,
  };
}

export function markWordCorrect(memory: LessonMemory, word: string): LessonMemory {
  const wordPerf = new Map(memory.wordPerformance);
  const existing = wordPerf.get(word) || {
    attempts: 0,
    correct: 0,
    lastAttempt: new Date(),
  };
  wordPerf.set(word, {
    attempts: existing.attempts + 1,
    correct: existing.correct + 1,
    lastAttempt: new Date(),
  });

  const wordsLearned = memory.wordsLearned.includes(word)
    ? memory.wordsLearned
    : [...memory.wordsLearned, word];

  return {
    ...memory,
    wordPerformance: wordPerf,
    wordsLearned,
  };
}

export function markWordIncorrect(memory: LessonMemory, word: string): LessonMemory {
  const wordPerf = new Map(memory.wordPerformance);
  const existing = wordPerf.get(word) || {
    attempts: 0,
    correct: 0,
    lastAttempt: new Date(),
  };
  wordPerf.set(word, {
    attempts: existing.attempts + 1,
    correct: existing.correct,
    lastAttempt: new Date(),
  });

  const wordsToReview = memory.wordsToReview.includes(word)
    ? memory.wordsToReview
    : [...memory.wordsToReview, word];

  return {
    ...memory,
    wordPerformance: wordPerf,
    wordsToReview,
  };
}

export function incrementSilentTurns(memory: LessonMemory): LessonMemory {
  return {
    ...memory,
    silentTurns: memory.silentTurns + 1,
  };
}

export function getMessagesForLLM(memory: LessonMemory): { role: string; content: string }[] {
  return memory.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/memory.ts
git commit -m "feat: lesson memory manager with interest detection"
```

---

### Task 7: Agent Core — Session Manager

**Files:**
- Create: `src/lib/agent/session.ts`

- [ ] **Step 1: Create `src/lib/agent/session.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Course } from '@/types/course';
import { LessonMemory, TokenUsage, InteractionLog } from '@/types/session';
import { AgentResponse } from '@/types/tools';
import { createMemory, addUserMessage, addAssistantMessage, getMessagesForLLM } from './memory';
import { buildSystemPrompt } from './prompt';
import { callLLM } from '@/lib/mimo/llm';
import { createLessonLog, finishLessonLog, insertInteraction } from '@/lib/db/queries';

export interface Session {
  id: string;
  courseId: string;
  course: Course;
  memory: LessonMemory;
  tokenUsage: TokenUsage;
  startTime: Date;
}

const sessions = new Map<string, Session>();

export function createSession(course: Course): Session {
  const id = uuidv4();
  const session: Session = {
    id,
    courseId: course.id,
    course,
    memory: createMemory(),
    tokenUsage: {
      asr: { requests: 0, tokens: 0 },
      llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
      tts: { requests: 0, characters: 0 },
    },
    startTime: new Date(),
  };

  sessions.set(id, session);
  createLessonLog(id, course.id);

  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export async function processUserInput(
  sessionId: string,
  userText: string,
  asrResult?: { latency: number; tokens: number }
): Promise<{ response: AgentResponse; session: Session }> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Add user message to memory
  session.memory = addUserMessage(session.memory, userText);

  // Build system prompt with current memory
  const systemPrompt = buildSystemPrompt(session.course, session.memory);

  // Get messages for LLM
  const messages = getMessagesForLLM(session.memory);

  // Call LLM
  const llmResult = await callLLM(systemPrompt, messages);

  // Update token usage
  session.tokenUsage.llm.requests += 1;
  session.tokenUsage.llm.inputTokens += llmResult.usage.inputTokens;
  session.tokenUsage.llm.outputTokens += llmResult.usage.outputTokens;

  if (asrResult) {
    session.tokenUsage.asr.requests += 1;
    session.tokenUsage.asr.tokens += asrResult.tokens;
  }

  // Add assistant message to memory
  session.memory = addAssistantMessage(session.memory, llmResult.response);

  // Log interaction
  const interactionLog: InteractionLog = {
    timestamp: new Date(),
    userInput: userText,
    aiResponse: llmResult.response.speech,
    actions: llmResult.response.actions,
    modelCalls: {
      asr: asrResult,
      llm: {
        latency: llmResult.latency,
        inputTokens: llmResult.usage.inputTokens,
        outputTokens: llmResult.usage.outputTokens,
      },
    },
  };
  insertInteraction(session.id, interactionLog);

  return { response: llmResult.response, session };
}

export function endSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  finishLessonLog(session.id, session.memory.totalInteractions, session.tokenUsage);
  sessions.delete(sessionId);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/session.ts
git commit -m "feat: session manager with LLM integration and logging"
```

---

### Task 8: API Routes

**Files:**
- Create: `src/app/api/courses/route.ts`
- Create: `src/app/api/chat/route.ts`
- Create: `src/app/api/audio/route.ts`

- [ ] **Step 1: Create `src/app/api/courses/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { allCourses } from '@/data/courses/transportation';

export async function GET() {
  return NextResponse.json(allCourses);
}
```

- [ ] **Step 2: Create `src/app/api/chat/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession, processUserInput, endSession } from '@/lib/agent/session';
import { getCourseById } from '@/data/courses/transportation';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Start new session
  if (body.action === 'start') {
    const course = getCourseById(body.courseId);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const session = createSession(course);

    // Generate opening message
    const { response } = await processUserInput(session.id, '(课堂开始)');
    return NextResponse.json({
      sessionId: session.id,
      response,
    });
  }

  // Continue session
  if (body.action === 'message') {
    const session = getSession(body.sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { response } = await processUserInput(body.sessionId, body.text, body.asrResult);
    return NextResponse.json({ response });
  }

  // End session
  if (body.action === 'end') {
    endSession(body.sessionId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
```

- [ ] **Step 3: Create `src/app/api/audio/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/mimo/asr';
import { synthesizeSpeech } from '@/lib/mimo/tts';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const action = formData.get('action') as string;

  if (action === 'transcribe') {
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await transcribeAudio(buffer, file.type);

    return NextResponse.json({
      text: result.text,
      usage: result.usage,
      latency: result.latency,
    });
  }

  if (action === 'synthesize') {
    const text = formData.get('text') as string;
    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const result = await synthesizeSpeech(text);

    return new NextResponse(result.audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-Characters': result.usage.characters.toString(),
        'X-Latency': result.latency.toString(),
      },
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/
git commit -m "feat: API routes for courses, chat, and audio"
```

---

### Task 9: Logger

**Files:**
- Create: `src/lib/logger.ts`

- [ ] **Step 1: Create `src/lib/logger.ts`**

```typescript
import { TokenUsage, InteractionLog } from '@/types/session';

export function logInteraction(sessionId: string, log: InteractionLog): void {
  console.log(`[Lesson ${sessionId}] User: ${log.userInput}`);
  console.log(`[Lesson ${sessionId}] AI: ${log.aiResponse}`);
  if (log.actions.length > 0) {
    console.log(`[Lesson ${sessionId}] Actions:`, JSON.stringify(log.actions));
  }
  console.log(`[Lesson ${sessionId}] LLM: ${log.modelCalls.llm.inputTokens}in/${log.modelCalls.llm.outputTokens}out (${log.modelCalls.llm.latency}ms)`);
}

export function logTokenUsage(sessionId: string, usage: TokenUsage): void {
  console.log(`\n[Lesson ${sessionId}] === Token Usage Summary ===`);
  console.log(`  ASR: ${usage.asr.requests} requests, ${usage.asr.tokens} tokens`);
  console.log(`  LLM: ${usage.llm.requests} requests, ${usage.llm.inputTokens} input / ${usage.llm.outputTokens} output tokens`);
  console.log(`  TTS: ${usage.tts.requests} requests, ${usage.tts.characters} characters`);
}

export function logSessionStart(sessionId: string, courseId: string): void {
  console.log(`\n[Lesson ${sessionId}] === Session Started ===`);
  console.log(`  Course: ${courseId}`);
  console.log(`  Time: ${new Date().toISOString()}`);
}

export function logSessionEnd(sessionId: string, interactionCount: number): void {
  console.log(`\n[Lesson ${sessionId}] === Session Ended ===`);
  console.log(`  Interactions: ${interactionCount}`);
  console.log(`  Time: ${new Date().toISOString()}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/logger.ts
git commit -m "feat: lesson logger for development debugging"
```

---

### Task 10: Frontend — UI Components

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Card.tsx`

- [ ] **Step 1: Create `src/components/ui/Button.tsx`**

```tsx
'use client';

import { motion } from 'framer-motion';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

const variants = {
  primary: 'bg-blue-500 hover:bg-blue-600 text-white',
  secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
  danger: 'bg-red-500 hover:bg-red-600 text-white',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg font-medium transition-colors ${variants[variant]} ${sizes[size]} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {children}
    </motion.button>
  );
}
```

- [ ] **Step 2: Create `src/components/ui/Card.tsx`**

```tsx
'use client';

import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function Card({ children, onClick, className = '' }: CardProps) {
  return (
    <motion.div
      whileHover={onClick ? { scale: 1.02, y: -4 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      className={`bg-white rounded-xl shadow-lg overflow-hidden ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/
git commit -m "feat: reusable Button and Card UI components"
```

---

### Task 11: Frontend — Home Page

**Files:**
- Create: `src/components/home/CourseCard.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create `src/components/home/CourseCard.tsx`**

```tsx
'use client';

import { Card } from '@/components/ui/Card';
import { Course } from '@/types/course';

interface CourseCardProps {
  course: Course;
  onClick: () => void;
}

export function CourseCard({ course, onClick }: CourseCardProps) {
  return (
    <Card onClick={onClick} className="w-full max-w-sm">
      <div className="h-48 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
        <span className="text-6xl">
          {course.objectives.words.slice(0, 4).map((w) => {
            const emoji: Record<string, string> = {
              car: '🚗', bus: '🚌', train: '🚂', airplane: '✈️',
              bicycle: '🚲', boat: '⛵', dog: '🐕', cat: '🐱',
            };
            return emoji[w.english] || '📚';
          }).join(' ')}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-800">{course.title}</h3>
        <p className="text-sm text-gray-500 mt-1">{course.description}</p>
        <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
          <span>🎯 {course.objectives.words.length} 个词汇</span>
          <span>👶 {course.targetAge[0]}-{course.targetAge[1]}岁</span>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Update `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'EduAgent - 儿童英语教学',
  description: 'AI 驱动的儿童英语启蒙教学系统',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} font-sans antialiased bg-gray-50`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Update `src/app/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourseCard } from '@/components/home/CourseCard';
import { Course } from '@/types/course';

export default function HomePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    fetch('/api/courses')
      .then((res) => res.json())
      .then(setCourses);
  }, []);

  const handleCourseClick = (courseId: string) => {
    router.push(`/lesson/${courseId}`);
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">EduAgent</h1>
        <p className="text-gray-500 mb-8">选择一个课程开始学习</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onClick={() => handleCourseClick(course.id)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/home/ src/app/page.tsx src/app/layout.tsx
git commit -m "feat: home page with course selection cards"
```

---

### Task 12: Frontend — Visual Tools

**Files:**
- Create: `src/components/tools/ShowTool.tsx`
- Create: `src/components/tools/FocusTool.tsx`
- Create: `src/components/tools/AnnotateTool.tsx`

- [ ] **Step 1: Create `src/components/tools/ShowTool.tsx`**

```tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ShowParams } from '@/types/tools';

interface ShowToolProps {
  params: ShowParams;
  imageUrl: string;
}

export function ShowTool({ params, imageUrl }: ShowToolProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={params.image_id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full h-full"
      >
        <img
          src={imageUrl}
          alt={params.image_id}
          className="w-full h-full object-contain"
        />
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Create `src/components/tools/FocusTool.tsx`**

```tsx
'use client';

import { motion } from 'framer-motion';
import { FocusParams } from '@/types/tools';
import { ImageRegion } from '@/types/course';

interface FocusToolProps {
  params: FocusParams;
  region: ImageRegion;
}

export function FocusTool({ params, region }: FocusToolProps) {
  const { bbox } = region;
  const left = `${bbox.x * 100}%`;
  const top = `${bbox.y * 100}%`;
  const width = `${bbox.w * 100}%`;
  const height = `${bbox.h * 100}%`;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
      {params.style === 'zoom' && <ZoomOverlay left={left} top={top} width={width} height={height} />}
      {params.style === 'highlight' && <HighlightOverlay left={left} top={top} width={width} height={height} />}
      {params.style === 'circle' && <CircleOverlay bbox={bbox} />}
      {params.style === 'pulse' && <PulseOverlay left={left} top={top} width={width} height={height} />}
    </div>
  );
}

function ZoomOverlay({ left, top, width, height }: { left: string; top: string; width: string; height: string }) {
  return (
    <motion.div
      initial={{ scale: 1, opacity: 0 }}
      animate={{ scale: 1.8, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="absolute border-4 border-yellow-400 rounded-lg bg-yellow-400/10"
      style={{ left, top, width, height, transformOrigin: 'center center' }}
    />
  );
}

function HighlightOverlay({ left, top, width, height }: { left: string; top: string; width: string; height: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="absolute rounded-lg"
      style={{
        left, top, width, height,
        boxShadow: '0 0 30px 10px rgba(250, 204, 21, 0.5)',
        border: '3px solid rgba(250, 204, 21, 0.8)',
      }}
    />
  );
}

function CircleOverlay({ bbox }: { bbox: { x: number; y: number; w: number; h: number } }) {
  const cx = (bbox.x + bbox.w / 2) * 100;
  const cy = (bbox.y + bbox.h / 2) * 100;
  const rx = (bbox.w / 2 + 0.02) * 100;
  const ry = (bbox.h / 2 + 0.02) * 100;

  return (
    <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 10 }}>
      <motion.ellipse
        cx={`${cx}%`}
        cy={`${cy}%`}
        rx={`${rx}%`}
        ry={`${ry}%`}
        fill="none"
        stroke="#ef4444"
        strokeWidth="4"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
      />
    </svg>
  );
}

function PulseOverlay({ left, top, width, height }: { left: string; top: string; width: string; height: string }) {
  return (
    <motion.div
      className="absolute rounded-lg border-4 border-blue-400"
      style={{ left, top, width, height }}
      animate={{
        opacity: [0.3, 1, 0.3],
        scale: [0.98, 1.02, 0.98],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}
```

- [ ] **Step 3: Create `src/components/tools/AnnotateTool.tsx`**

```tsx
'use client';

import { motion } from 'framer-motion';
import { AnnotateParams } from '@/types/tools';
import { ImageRegion } from '@/types/course';

interface AnnotateToolProps {
  params: AnnotateParams;
  region: ImageRegion;
}

export function AnnotateTool({ params, region }: AnnotateToolProps) {
  const { bbox } = region;
  const centerX = (bbox.x + bbox.w / 2) * 100;
  const centerY = (bbox.y + bbox.h / 2) * 100;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {params.type === 'circle' && (
        <motion.div
          className="absolute border-4 border-red-500 rounded-full"
          style={{
            left: `${bbox.x * 100}%`,
            top: `${bbox.y * 100}%`,
            width: `${bbox.w * 100}%`,
            height: `${bbox.h * 100}%`,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.8 }}
          transition={{ duration: 0.5 }}
        />
      )}
      {params.type === 'checkmark' && (
        <motion.div
          className="absolute text-green-500 font-bold"
          style={{
            left: `${centerX}%`,
            top: `${centerY}%`,
            transform: 'translate(-50%, -50%)',
            fontSize: '3rem',
          }}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          ✓
        </motion.div>
      )}
      {params.type === 'arrow' && (
        <motion.div
          className="absolute text-yellow-500"
          style={{
            left: `${centerX}%`,
            top: `${(bbox.y - 0.05) * 100}%`,
            transform: 'translate(-50%, -100%)',
            fontSize: '2rem',
          }}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, repeat: Infinity, repeatType: 'reverse' }}
        >
          ↓
        </motion.div>
      )}
      {params.type === 'text' && params.content && (
        <motion.div
          className="absolute bg-white/90 px-2 py-1 rounded text-sm font-bold text-gray-800 shadow"
          style={{
            left: `${centerX}%`,
            top: `${(bbox.y + bbox.h) * 100 + 2}%`,
            transform: 'translateX(-50%)',
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {params.content}
        </motion.div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/
git commit -m "feat: visual tools - Show, Focus, Annotate components"
```

---

### Task 13: Frontend — Image Canvas

**Files:**
- Create: `src/components/lesson/ImageCanvas.tsx`

- [ ] **Step 1: Create `src/components/lesson/ImageCanvas.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { ShowTool } from '@/components/tools/ShowTool';
import { FocusTool } from '@/components/tools/FocusTool';
import { AnnotateTool } from '@/components/tools/AnnotateTool';
import { ToolAction, FocusParams, AnnotateParams, ShowParams } from '@/types/tools';
import { CourseImage, ImageRegion } from '@/types/course';

interface ImageCanvasProps {
  images: CourseImage[];
  currentImageId: string;
  actions: ToolAction[];
}

export function ImageCanvas({ images, currentImageId, actions }: ImageCanvasProps) {
  const [activeFocus, setActiveFocus] = useState<{ params: FocusParams; region: ImageRegion } | null>(null);
  const [activeAnnotates, setActiveAnnotates] = useState<{ params: AnnotateParams; region: ImageRegion }[]>([]);
  const [currentShow, setCurrentShow] = useState<ShowParams>({ image_id: currentImageId });

  const currentImage = images.find((img) => img.id === currentShow.image_id) || images[0];

  useEffect(() => {
    const focuses: { params: FocusParams; region: ImageRegion }[] = [];
    const annotates: { params: AnnotateParams; region: ImageRegion }[] = [];

    for (const action of actions) {
      if (action.tool === 'show') {
        setCurrentShow(action.params as ShowParams);
      }
      if (action.tool === 'focus') {
        const params = action.params as FocusParams;
        const region = currentImage.regions.find((r) => r.id === params.target);
        if (region) {
          focuses.push({ params, region });
        }
      }
      if (action.tool === 'annotate') {
        const params = action.params as AnnotateParams;
        const region = currentImage.regions.find((r) => r.id === params.target);
        if (region) {
          annotates.push({ params, region });
        }
      }
    }

    setActiveFocus(focuses[0] || null);
    setActiveAnnotates(annotates);
  }, [actions, currentImage]);

  // Clear focus after animation
  useEffect(() => {
    if (activeFocus) {
      const timer = setTimeout(() => setActiveFocus(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [activeFocus]);

  return (
    <div className="relative w-full h-full bg-gray-100 rounded-lg overflow-hidden">
      <ShowTool params={currentShow} imageUrl={currentImage.url} />

      {activeFocus && (
        <FocusTool
          params={activeFocus.params}
          region={activeFocus.region}
        />
      )}

      {activeAnnotates.map((annotate, i) => (
        <AnnotateTool
          key={`${annotate.params.type}-${annotate.params.target}-${i}`}
          params={annotate.params}
          region={annotate.region}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lesson/ImageCanvas.tsx
git commit -m "feat: ImageCanvas component with tool orchestration"
```

---

### Task 14: Frontend — Record Button & Subtitle Bar

**Files:**
- Create: `src/components/lesson/RecordButton.tsx`
- Create: `src/components/lesson/SubtitleBar.tsx`

- [ ] **Step 1: Create `src/components/lesson/RecordButton.tsx`**

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

interface RecordButtonProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
}

export function RecordButton({ onRecordingComplete, disabled = false }: RecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        onRecordingComplete(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.1 }}
      whileTap={{ scale: disabled ? 1 : 0.9 }}
      onClick={isRecording ? stopRecording : startRecording}
      disabled={disabled}
      className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl shadow-lg transition-colors ${
        isRecording
          ? 'bg-red-500 animate-pulse'
          : disabled
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-blue-500 hover:bg-blue-600'
      }`}
    >
      {isRecording ? '⏹' : '🎤'}
    </motion.button>
  );
}
```

- [ ] **Step 2: Create `src/components/lesson/SubtitleBar.tsx`**

```tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface SubtitleBarProps {
  text: string;
  isPlaying: boolean;
}

export function SubtitleBar({ text, isPlaying }: SubtitleBarProps) {
  return (
    <div className="w-full bg-white/90 backdrop-blur-sm rounded-lg px-6 py-4 shadow-md min-h-[60px] flex items-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={text}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-lg text-gray-800 leading-relaxed"
        >
          {text || '等待开始...'}
          {isPlaying && (
            <span className="inline-block ml-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/lesson/RecordButton.tsx src/components/lesson/SubtitleBar.tsx
git commit -m "feat: RecordButton and SubtitleBar components"
```

---

### Task 15: Frontend — Lesson View (Main Container)

**Files:**
- Create: `src/components/lesson/LessonView.tsx`

- [ ] **Step 1: Create `src/components/lesson/LessonView.tsx`**

```tsx
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ImageCanvas } from './ImageCanvas';
import { SubtitleBar } from './SubtitleBar';
import { RecordButton } from './RecordButton';
import { Button } from '@/components/ui/Button';
import { Course } from '@/types/course';
import { AgentResponse, ToolAction } from '@/types/tools';

interface LessonViewProps {
  course: Course;
}

type LessonState = 'idle' | 'loading' | 'listening' | 'processing' | 'speaking';

export function LessonView({ course }: LessonViewProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<LessonState>('idle');
  const [subtitle, setSubtitle] = useState('');
  const [actions, setActions] = useState<ToolAction[]>([]);
  const [currentImageId, setCurrentImageId] = useState(course.images[0]?.id || '');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Start lesson
  const startLesson = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', courseId: course.id }),
      });
      const data = await res.json();
      setSessionId(data.sessionId);
      setSubtitle(data.response.speech);
      setActions(data.response.actions);
      setState('speaking');

      // Play TTS
      await playTTS(data.response.speech);
      setState('listening');
    } catch (err) {
      console.error('Failed to start lesson:', err);
      setState('idle');
    }
  }, [course.id]);

  // Play TTS audio
  const playTTS = async (text: string): Promise<void> => {
    try {
      const formData = new FormData();
      formData.append('action', 'synthesize');
      formData.append('text', text);

      const res = await fetch('/api/audio', { method: 'POST', body: formData });
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      return new Promise((resolve) => {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.play();
      });
    } catch (err) {
      console.error('TTS failed:', err);
    }
  };

  // Handle user recording
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    if (!sessionId) return;

    setState('processing');

    try {
      // Transcribe audio
      const formData = new FormData();
      formData.append('action', 'transcribe');
      formData.append('file', audioBlob, 'audio.webm');

      const asrRes = await fetch('/api/audio', { method: 'POST', body: formData });
      const asrData = await asrRes.json();
      const userText = asrData.text;

      if (!userText) {
        setState('listening');
        return;
      }

      // Send to chat
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          sessionId,
          text: userText,
          asrResult: {
            latency: asrData.latency,
            tokens: asrData.usage.tokens,
          },
        }),
      });
      const chatData = await chatRes.json();
      const response: AgentResponse = chatData.response;

      setSubtitle(response.speech);
      setActions(response.actions);
      setState('speaking');

      // Play TTS
      await playTTS(response.speech);
      setState('listening');
    } catch (err) {
      console.error('Processing failed:', err);
      setState('listening');
    }
  }, [sessionId]);

  // End lesson
  const endLesson = useCallback(async () => {
    if (!sessionId) return;
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end', sessionId }),
    });
    setSessionId(null);
    setState('idle');
    setSubtitle('');
    setActions([]);
  }, [sessionId]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white shadow-sm">
        <h1 className="text-xl font-bold text-gray-800">{course.title}</h1>
        {sessionId && (
          <Button variant="danger" size="sm" onClick={endLesson}>
            结束课堂
          </Button>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {/* Image area */}
        <div className="flex-1 min-h-0">
          <ImageCanvas
            images={course.images}
            currentImageId={currentImageId}
            actions={actions}
          />
        </div>

        {/* Bottom area */}
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <SubtitleBar text={subtitle} isPlaying={state === 'speaking'} />
          </div>
          <div className="flex-shrink-0">
            {state === 'idle' ? (
              <Button size="lg" onClick={startLesson}>
                开始上课
              </Button>
            ) : (
              <RecordButton
                onRecordingComplete={handleRecordingComplete}
                disabled={state !== 'listening'}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lesson/LessonView.tsx
git commit -m "feat: LessonView main container with full lesson flow"
```

---

### Task 16: Frontend — Lesson Page

**Files:**
- Create: `src/app/lesson/[id]/LessonClient.tsx`
- Create: `src/app/lesson/[id]/page.tsx`

- [ ] **Step 1: Create `src/app/lesson/[id]/LessonClient.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { LessonView } from '@/components/lesson/LessonView';
import { Course } from '@/types/course';

interface LessonClientProps {
  courseId: string;
}

export function LessonClient({ courseId }: LessonClientProps) {
  const [course, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    fetch('/api/courses')
      .then((res) => res.json())
      .then((courses: Course[]) => {
        const found = courses.find((c) => c.id === courseId);
        if (found) setCourse(found);
      });
  }, [courseId]);

  if (!course) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return <LessonView course={course} />;
}
```

- [ ] **Step 2: Create `src/app/lesson/[id]/page.tsx`**

```tsx
import { LessonClient } from './LessonClient';

interface LessonPageProps {
  params: { id: string };
}

export default function LessonPage({ params }: LessonPageProps) {
  return <LessonClient courseId={params.id} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/lesson/
git commit -m "feat: lesson page with client-side course loading"
```

---

### Task 17: Integration — Database Init & Globals

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/lib/init.ts`

- [ ] **Step 1: Create `src/lib/init.ts`**

```typescript
import { initDatabase } from './db/schema';

let initialized = false;

export function ensureInitialized(): void {
  if (initialized) return;
  initDatabase();
  initialized = true;
}
```

- [ ] **Step 2: Update API routes to init DB**

Update `src/app/api/chat/route.ts` to call `ensureInitialized()` at the start:

```typescript
import { ensureInitialized } from '@/lib/init';

export async function POST(req: NextRequest) {
  ensureInitialized();
  // ... rest of the handler
}
```

- [ ] **Step 3: Update globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  overflow: hidden;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/init.ts src/app/api/chat/route.ts src/app/globals.css
git commit -m "feat: database initialization and global styles"
```

---

### Task 18: Verification — Build & Manual Test

- [ ] **Step 1: Run TypeScript check**

```bash
cd "/Users/hushaobo/ROOTCLOUD/new solulu/eduagent"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Start dev server**

```bash
pnpm dev
```

Expected: Server starts on localhost:3000.

- [ ] **Step 4: Manual test checklist**

1. Open http://localhost:3000 — should see course selection page
2. Click a course card — should navigate to lesson page
3. Click "开始上课" — should show loading state
4. (Without MiMo API key, will fail at API call — that's expected)
5. Verify the UI renders correctly: image area, subtitle bar, record button

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: EduAgent MVP complete - children's English teaching agent"
```

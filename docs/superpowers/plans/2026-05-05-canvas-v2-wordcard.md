# Canvas v2 词卡画布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前"切图器" `ImageCanvas` 整体升级为词卡画布 `WordCardCanvas`,删除 `focus`/`annotate`/`show` action 协议,新增 `show_card`,把 `transportation` 与 `timeNumbers` 两节课的数据迁到新 schema(timeNumbers 含 4 张句卡)。

**Architecture:** 单一画布组件 `WordCardCanvas`,显示一张卡(图 + 中文 + 英文),`kind: 'word' | 'sentence'` 切换排版。LLM 通过 `show_card` action 切卡。`Course` schema 重写为扁平 `cards[]` 列表,删除 `images` / `regions` / `Word` 结构。Prompt 同步精简到只讲 `show_card` 协议。

**Tech Stack:** Next.js 14 + React 18 + TypeScript + Tailwind + framer-motion(已有)+ Vitest + @testing-library/react(已有)。

**Spec:** `docs/superpowers/specs/2026-05-05-canvas-v2-wordcard-design.md`

---

## Handoff 须知(给执行者:Sonnet / MiMo)

> **必读:执行前先打开 `CLAUDE.md` 与 spec 文件,理解项目测试自动化原则与 v2 设计意图。**

### 项目背景速记

- **运行:** `pnpm dev` 起自定义 server(`tsx watch server.ts`,**不是** `next dev`,因为有 WS upgrade)
- **测试:** `pnpm test`(vitest run)+ `pnpm exec tsc --noEmit`(typecheck)
- **现有测试套数:** 27 个,改完任何 voice / agent 相关代码必跑;改完代码也必跑 typecheck。**两者都过才能 commit。**
- **commit 风格:** `fix(voice): ...` / `feat(...)` / `docs(...)` 单行 subject,body 用 `-` 列实质改动,末尾加 `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`,用 HEREDOC 防 shell 转义。**每个 Task 末尾必 commit。**
- **测试自动化原则(CLAUDE.md 强制):** 改完代码先自己跑通 + 自己加日志才交付用户;不能把"用户跑一下看看"当 fallback。本 plan 中 Task 内自验证步骤 = "vitest 红→绿 + tsc 干净"。需要浏览器目视的(画布动画)放在最后 Task 9 的"E2E 手动验收"步骤,且只验真主观项,逻辑/类型/数据一致性 vitest+tsc 已经打掉。

### 关键不变量(改了会崩的事)

1. **`AgentResponse` 结构整体不变** — 只是 `actions[].tool` 字符串值从 `'show'/'focus'/'annotate'` 改成 `'show_card'`,`actions` 数组本身、`speech` 字段、`state_update` 字段都不动
2. **`session.ts` / `orchestrator.ts` / `voice/*` 不动** — actions 经 SSE 透传给前端,后端不解析 tool 名字
3. **`StreamingSpeechExtractor` 不区分 tool 名字** — 直接把 actions 数组透传(第 56 行 finalize),v2 的 `show_card` 自动透传
4. **`memory.wordsLearned` 内是英文词字符串(小写或原大小写)** — 用 `WordCard.english` 时和它对得上;**句卡 id 是 `sentence_*`,绝不能进 wordsLearned**
5. **`/api/courses` / `/api/chat` 路由不动** — `getCourseById(id)` 拿到的就是新 `Course` 类型
6. **图片素材不动** — SVG / PNG 路径已存在(`/public/images/transportation/*.svg` 与 `/public/images/time-numbers/*.png`),只改 `imageUrl` 引用

### 课程产物(执行完拿到的)

- 6 张词卡:transportation(car/bus/train/airplane/bicycle/boat,SVG)
- 7 张词卡 + 4 张句卡:timeNumbers(hour/minute/second/hundred/thousand/million/billion + 4 张句子图,PNG)
- 老素材文件不删(`all.svg` / `overview.png`),只是不再被引用

### 必删清单(执行后 grep 应 0 命中)

```
ImageCanvas | FocusTool | AnnotateTool | ShowTool
FocusStyle | AnnotateType | ShowParams | FocusParams | AnnotateParams
CourseImage | ImageRegion
course.images | course.objectives.words
'focus' | 'annotate' | "可交互区域" | "总览图"
```

### 风险点

- LLM 可能仍然吐旧 `tool: 'show'`(尚未被新 prompt 调教)。**对策:** `WordCardCanvas` 用 `find()` 找 `show_card`,找不到就保持当前卡 + 一次 console.warn。**不要让未知 tool 把课程崩了。**
- 句卡 id 形如 `sentence_hour_minute`,不能被 `markWordCorrect/Incorrect` 当 word 处理。`detectCurrentWordAttempt` 已经只看 `currentWord`,而句卡不会被 LLM 设为 `current_word`(prompt 里只让 word 卡作为 currentWord)。

---

## File Structure

**Create:**
- `src/components/lesson/WordCardCanvas.tsx` — 词卡画布组件
- `src/components/lesson/WordCardCanvas.test.tsx` — 组件测试

**Modify:**
- `src/types/course.ts` — 新 `Course` + `WordCard` schema
- `src/types/tools.ts` — 仅 `show_card`
- `src/lib/agent/prompt.ts` — 精简 ROLE_PROMPT + buildCourseInfo
- `src/lib/agent/prompt.test.ts` — 改测试断言
- `src/lib/agent/memory.ts:94` — `course.objectives.words` → `course.cards.filter(kind=='word')`
- `src/lib/agent/speech-extractor.test.ts` — fixture 中 tool 名改为 `show_card`
- `src/data/courses/transportation.ts` — 迁到 cards 结构
- `src/data/courses/timeNumbers.ts` — 迁到 cards 结构(11 张卡)
- `src/components/lesson/LessonView.tsx` — 替换为 WordCardCanvas + currentCardId state
- `src/components/home/CourseCard.tsx` — emoji 预览适配 cards

**Delete:**
- `src/components/lesson/ImageCanvas.tsx`
- `src/components/tools/ShowTool.tsx`
- `src/components/tools/FocusTool.tsx`
- `src/components/tools/AnnotateTool.tsx`
- `src/components/tools/`(空目录删)

---

## Task 顺序设计

按"叶子 → 根"顺序,先改类型(底层),再改使用类型的代码(prompt / memory / 课程数据),最后画布层。每个 Task 内部 TDD:先红再绿。

---

### Task 1: 重写类型层 — `Course` / `WordCard` / `ToolAction`

**Files:**
- Modify: `src/types/course.ts`(整体替换)
- Modify: `src/types/tools.ts`(整体替换)

**目的:** 锁定新 schema,所有下游代码以此为准。本 task 完成后 typecheck 必崩(后续 task 修复),这是预期。

- [ ] **Step 1: 重写 `src/types/course.ts`**

完整内容(整体替换文件):

```ts
export interface WordCard {
  id: string;
  english: string;
  chinese: string;
  imageUrl: string;
  kind: 'word' | 'sentence';
  difficulty?: number;
  tags?: string[];
}

export interface TeachingHints {
  opening: string;
  reviewCardIds: string[];
  newCardIds: string[];
  quizQuestions: string[];
  closing: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  targetAge: [number, number];
  cards: WordCard[];
  objectives: {
    sentences: string[];
  };
  teachingHints: TeachingHints;
}
```

- [ ] **Step 2: 重写 `src/types/tools.ts`**

完整内容(整体替换文件):

```ts
export interface ShowCardParams {
  card_id: string;
}

export type ToolName = 'show_card';

export interface ToolAction {
  tool: 'show_card';
  params: ShowCardParams;
}

export interface GenerateState {
  type: 'sentence' | 'question' | 'comparison';
  content: string;
  topic: string;
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

- [ ] **Step 3: 跑 typecheck 验证"预期红"**

```bash
pnpm exec tsc --noEmit
```

Expected: 多处 type error,集中在 `src/data/courses/*` / `src/lib/agent/*` / `src/components/**`,因为后续 task 还没改。**这是预期红**,不要 commit。继续 Task 2。

> 注:本 plan 唯一在 task 中段不 commit 的位置;其他 task 末尾都必 commit。

---

### Task 2: 迁移 `transportation.ts` 到新 schema

**Files:**
- Modify: `src/data/courses/transportation.ts`(整体替换)

- [ ] **Step 1: 整体替换文件内容**

```ts
import { Course } from '@/types/course';
import { timeNumbersCourse } from './timeNumbers';

export const transportationCourse: Course = {
  id: 'transportation',
  title: '交通工具 Transportation',
  description: '学习常见的交通工具英文名称',
  targetAge: [3, 6],
  cards: [
    { id: 'car',      english: 'car',      chinese: '小汽车', imageUrl: '/images/transportation/car.svg',      kind: 'word', difficulty: 1, tags: ['vehicle'] },
    { id: 'bus',      english: 'bus',      chinese: '公交车', imageUrl: '/images/transportation/bus.svg',      kind: 'word', difficulty: 1, tags: ['vehicle'] },
    { id: 'train',    english: 'train',    chinese: '火车',   imageUrl: '/images/transportation/train.svg',    kind: 'word', difficulty: 2, tags: ['vehicle'] },
    { id: 'airplane', english: 'airplane', chinese: '飞机',   imageUrl: '/images/transportation/airplane.svg', kind: 'word', difficulty: 2, tags: ['vehicle'] },
    { id: 'bicycle',  english: 'bicycle',  chinese: '自行车', imageUrl: '/images/transportation/bicycle.svg',  kind: 'word', difficulty: 2, tags: ['vehicle'] },
    { id: 'boat',     english: 'boat',     chinese: '船',     imageUrl: '/images/transportation/boat.svg',     kind: 'word', difficulty: 2, tags: ['vehicle'] },
  ],
  objectives: {
    sentences: ['What is this?', 'This is a ___.', 'Can you say ___?', 'I like ___.'],
  },
  teachingHints: {
    opening: '今天我们学习交通工具!看看这些是什么?',
    reviewCardIds: ['car', 'bus'],
    newCardIds: ['train', 'airplane', 'bicycle', 'boat'],
    quizQuestions: ['哪个是 airplane?', '你能说 train 吗?', 'What is this? (指向 car)'],
    closing: '今天我们学了 train, airplane, bicycle, boat,下次继续!',
  },
};

export const allCourses: Course[] = [transportationCourse, timeNumbersCourse];

export function getCourseById(id: string): Course | undefined {
  return allCourses.find((c) => c.id === id);
}
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: transportation.ts 自身已干净;`timeNumbers.ts` / `prompt.ts` / `memory.ts` / `CourseCard.tsx` / `ImageCanvas.tsx` 还红 — 预期。**仍不 commit。**

继续 Task 3。

---

### Task 3: 迁移 `timeNumbers.ts` 到新 schema(含 4 句卡)

**Files:**
- Modify: `src/data/courses/timeNumbers.ts`(整体替换)

- [ ] **Step 1: 整体替换文件内容**

```ts
import { Course } from '@/types/course';

export const timeNumbersCourse: Course = {
  id: 'timeNumbers',
  title: '时间和大数字 Time & Big Numbers',
  description: '学习 hour, minute, second 以及 hundred, thousand, million, billion',
  targetAge: [3, 6],
  cards: [
    { id: 'hour',     english: 'hour',     chinese: '小时',  imageUrl: '/images/time-numbers/hour.png',     kind: 'word', difficulty: 1, tags: ['time'] },
    { id: 'minute',   english: 'minute',   chinese: '分钟',  imageUrl: '/images/time-numbers/minute.png',   kind: 'word', difficulty: 1, tags: ['time'] },
    { id: 'second',   english: 'second',   chinese: '秒',    imageUrl: '/images/time-numbers/second.png',   kind: 'word', difficulty: 1, tags: ['time'] },
    { id: 'hundred',  english: 'hundred',  chinese: '百',    imageUrl: '/images/time-numbers/hundred.png',  kind: 'word', difficulty: 2, tags: ['number'] },
    { id: 'thousand', english: 'thousand', chinese: '千',    imageUrl: '/images/time-numbers/thousand.png', kind: 'word', difficulty: 2, tags: ['number'] },
    { id: 'million',  english: 'million',  chinese: '百万',  imageUrl: '/images/time-numbers/million.png',  kind: 'word', difficulty: 3, tags: ['number'] },
    { id: 'billion',  english: 'billion',  chinese: '十亿',  imageUrl: '/images/time-numbers/billion.png',  kind: 'word', difficulty: 3, tags: ['number'] },
    {
      id: 'sentence_hour_minute',
      english: 'One hour has sixty minutes.',
      chinese: '一小时有 60 分钟。',
      imageUrl: '/images/time-numbers/sentence-hour-minute.png',
      kind: 'sentence',
    },
    {
      id: 'sentence_minute_second',
      english: 'One minute has sixty seconds.',
      chinese: '一分钟有 60 秒。',
      imageUrl: '/images/time-numbers/sentence-minute-second.png',
      kind: 'sentence',
    },
    {
      id: 'sentence_thousand_hundred',
      english: 'One thousand is ten hundreds.',
      chinese: '一千是 10 个百。',
      imageUrl: '/images/time-numbers/sentence-thousand-hundred.png',
      kind: 'sentence',
    },
    {
      id: 'sentence_billion_million',
      english: 'One billion is one thousand million.',
      chinese: '十亿是 1000 个百万。',
      imageUrl: '/images/time-numbers/sentence-billion-million.png',
      kind: 'sentence',
    },
  ],
  objectives: {
    sentences: [
      'One hour has sixty minutes.',
      'One minute has sixty seconds.',
      'One thousand is ten hundreds.',
      'One billion is one thousand million.',
    ],
  },
  teachingHints: {
    opening: '今天我们学习时间和大数字!Time and big numbers!',
    reviewCardIds: ['hour', 'minute', 'second'],
    newCardIds: [
      'hundred', 'thousand', 'million', 'billion',
      'sentence_hour_minute', 'sentence_minute_second',
      'sentence_thousand_hundred', 'sentence_billion_million',
    ],
    quizQuestions: [
      '一小时有多少分钟?',
      '一分钟有多少秒?',
      'Which is bigger, thousand or hundred?',
      '十亿和百万有什么关系?',
    ],
    closing: '今天我们学了 hour, minute, second, hundred, thousand, million, billion。',
  },
};
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: 课程数据层全干净。剩下 `prompt.ts` / `memory.ts:94` / `CourseCard.tsx` / `ImageCanvas.tsx` / `prompt.test.ts` 等还红 — 预期。**仍不 commit。**

继续 Task 4。

---

### Task 4: 改 `memory.ts` `detectCurrentWordAttempt`(只看 word 卡)

**Files:**
- Modify: `src/lib/agent/memory.ts:94`

- [ ] **Step 1: 改第 94 行**

将:

```ts
const targetWords = new Set(course.objectives.words.map((w) => w.english.toLowerCase()));
```

改为:

```ts
const targetWords = new Set(
  course.cards
    .filter((c) => c.kind === 'word')
    .map((c) => c.english.toLowerCase())
);
```

- [ ] **Step 2: 跑现有 memory 测试**

```bash
pnpm test src/lib/agent/memory.test.ts
```

Expected: 3 个测试全 PASS(测试用 `transportationCourse` 的 `train`,新数据里仍是 word 卡)。

- [ ] **Step 3: typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: memory.ts 已干净。剩下 prompt / 视图层 / 测试还红。

- [ ] **Step 4: 不 commit,继续 Task 5**

理由:本 plan 设计为"类型革新一气呵成",中途代码无法编译。Task 5 改 prompt 后整个 agent 层就齐了,届时跑 prompt.test.ts 一起验证再统一 commit Tasks 1-5。

---

### Task 5: 重写 prompt 层 — ROLE_PROMPT + buildCourseInfo + 测试

**Files:**
- Modify: `src/lib/agent/prompt.ts`(改 ROLE_PROMPT 与 buildCourseInfo)
- Modify: `src/lib/agent/prompt.test.ts`(加 v2 断言)

- [ ] **Step 1: 先写失败测试 — 在 `src/lib/agent/prompt.test.ts` 末尾追加**

```ts
import { timeNumbersCourse } from '@/data/courses/timeNumbers';

describe('buildSystemPrompt v2 wordcard protocol', () => {
  it('only declares show_card, not the legacy show/focus/annotate tools', () => {
    const memory = createMemory();
    const prompt = buildSystemPrompt(transportationCourse, memory);

    expect(prompt).toContain('show_card');
    expect(prompt).not.toMatch(/\btool":\s*"show"/);
    expect(prompt).not.toContain('focus');
    expect(prompt).not.toContain('annotate');
    expect(prompt).not.toContain('可交互区域');
    expect(prompt).not.toContain('总览图');
  });

  it('lists every card with id / english / chinese / kind', () => {
    const memory = createMemory();
    const prompt = buildSystemPrompt(timeNumbersCourse, memory);

    expect(prompt).toContain('## 可用卡片');
    expect(prompt).toContain('hour: hour / 小时 (word)');
    expect(prompt).toContain('sentence_hour_minute: One hour has sixty minutes. / 一小时有 60 分钟。 (sentence)');
  });

  it('exposes review/new card id lists', () => {
    const memory = createMemory();
    const prompt = buildSystemPrompt(transportationCourse, memory);

    expect(prompt).toContain('建议先复习: car, bus');
    expect(prompt).toContain('新教卡顺序: train, airplane, bicycle, boat');
  });
});
```

- [ ] **Step 2: 跑测试看红**

```bash
pnpm test src/lib/agent/prompt.test.ts
```

Expected: 旧测试可能跑不起来(typecheck 红)。先看到错误信息即可,继续。

- [ ] **Step 3: 整体替换 `src/lib/agent/prompt.ts`**

```ts
import { Course, WordCard } from '@/types/course';
import { LessonMemory } from '@/types/session';

const ROLE_PROMPT = `你是一个儿童英语教学助手。你的任务是围绕课程目标，主动带着小朋友完成一节课。

## 语言策略
- 讲解以中文为主
- 英文作为目标词和目标句型输入
- 提问时：中文一句 + 英文一句
- 语速稍慢，适合儿童
- 鼓励为主，不纠正发音

## 教学节奏
每张词卡的教学节奏：
1. 简短的中文引入（这是什么）
2. 用 show_card 切到对应卡片
3. 读出英文（单词或句子）
4. 让小朋友跟读
5. 简短鼓励 + 简单提问

## P0 教学硬约束
- 复习和结尾只能总结已学词汇，也就是"当前课堂状态"里的 wordsLearned / 已学词汇；不能把课程目标词汇全集当成已经学过。
- 如果当前词连续 3 次错误，必须切换策略：分音节、换中文类比、换示范句，或明确跳过留到下次；不能继续机械重复"跟老师一起说"。
- 当词汇表现显示某词 0/3、1/4 这类连续失败时，下一句必须体现切换策略。

## 输出格式
你必须严格输出以下 JSON 格式，不要输出其他内容：
{
  "speech": "你要说的话（中文+英文混合）",
  "actions": [
    { "tool": "show_card", "params": { "card_id": "卡片ID" } }
  ],
  "state_update": {
    "current_word": "当前正在教的词（仅 word 卡时设置；句卡阶段可留空或保持上一个）",
    "phase": "opening|review|learning|quiz|closing",
    "words_learned": ["已学过的词列表（仅记录 word 卡英文，不含 sentence_*）"]
  }
}

## 工具说明
- show_card: 展示一张词卡。params: { card_id: string }
  - card_id 必须是下面"可用卡片"列出的 id 之一
  - 教新词 / 切换话题 / 复习时，先 show_card 再讲解
  - actions 数组可以为空 []，如果不需要切卡

不要使用任何其它 tool 名（如 show / focus / annotate），系统将忽略未知 tool。`;

function buildCourseInfo(course: Course): string {
  const cardList = course.cards
    .map((c: WordCard) => `  - ${c.id}: ${c.english} / ${c.chinese} (${c.kind})`)
    .join('\n');

  const sentenceList = course.objectives.sentences.map((s) => `  - ${s}`).join('\n');

  return `## 课程信息
- 主题: ${course.title}
- 年龄段: ${course.targetAge[0]}-${course.targetAge[1]}岁

### 可用卡片
${cardList}

### 目标句型
${sentenceList}

### 教学提示
- 开场: ${course.teachingHints.opening}
- 建议先复习: ${course.teachingHints.reviewCardIds.join(', ')}
- 新教卡顺序: ${course.teachingHints.newCardIds.join(', ')}
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
      if (perf.attempts >= 3 && perf.correct === 0) {
        context += ` — 连续 3 次错误，必须切换策略`;
      }
    });
  }

  if (memory.phase === 'review' || memory.phase === 'closing') {
    context += `\n\n## 总结约束
- 只能总结已学词汇: ${memory.wordsLearned.join(', ') || '(无)'}
- 如果已学词汇为空，不要声称小朋友已经学会了任何目标词。`;
  }

  return context;
}

export function buildSystemPrompt(course: Course, memory: LessonMemory): string {
  return [ROLE_PROMPT, buildCourseInfo(course), buildMemoryContext(memory)].join('\n\n---\n\n');
}
```

- [ ] **Step 4: 跑 prompt.test.ts**

```bash
pnpm test src/lib/agent/prompt.test.ts
```

Expected: 全 PASS(包括原 P0 + 新 v2 断言共 5 个)。

- [ ] **Step 5: 跑 typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: agent 层全干净。剩下 `LessonView.tsx` / `ImageCanvas.tsx` / `CourseCard.tsx` / `speech-extractor.test.ts` 视图与测试 fixture 还红。

- [ ] **Step 6: Commit Tasks 1-5(类型革新 + 数据迁移 + agent 层一起)**

```bash
git add src/types/course.ts src/types/tools.ts \
        src/data/courses/transportation.ts src/data/courses/timeNumbers.ts \
        src/lib/agent/memory.ts src/lib/agent/prompt.ts src/lib/agent/prompt.test.ts
git commit -m "$(cat <<'EOF'
refactor(canvas): v2 schema + show_card protocol(types/data/agent 层)

- Course 重写为 cards[] 扁平结构,删除 images/regions/Word
- ToolAction 仅保留 show_card,删除 show/focus/annotate
- transportation/timeNumbers 课程数据迁到新 schema(timeNumbers
  含 4 张句卡,kind=sentence)
- prompt 精简到 show_card 协议,buildCourseInfo 输出"可用卡片"
- memory.detectCurrentWordAttempt 改为只看 word 卡
- prompt.test.ts 新增 v2 断言:不含 focus/annotate/总览图,
  含可用卡片列表 + reviewCardIds/newCardIds

视图层(LessonView/ImageCanvas/CourseCard)与 speech-extractor
fixture 在后续 task 一起改。

Spec: docs/superpowers/specs/2026-05-05-canvas-v2-wordcard-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 修 `speech-extractor.test.ts` fixture(tool 名改 show_card)

**Files:**
- Modify: `src/lib/agent/speech-extractor.test.ts`

`speech-extractor.ts` 本身不解析 tool 名,只透传。但测试 fixture 里写了 `tool: "show"`,会触发 `ToolAction` 类型不兼容。

- [ ] **Step 1: 修两处 fixture**

第 40 行:

```ts
'{"actions": [{"tool":"show","params":{"image_id":"car"}}], ',
```

改为:

```ts
'{"actions": [{"tool":"show_card","params":{"card_id":"car"}}], ',
```

第 54-57 行:

```ts
const full = '{"speech":"hi","actions":[{"tool":"show","params":{"image_id":"car"}}],"state_update":{"current_word":"car"}}';
feedAll(ex, [full]);
const result = ex.finalize();
expect(result.actions).toEqual([{ tool: 'show', params: { image_id: 'car' } }]);
```

改为:

```ts
const full = '{"speech":"hi","actions":[{"tool":"show_card","params":{"card_id":"car"}}],"state_update":{"current_word":"car"}}';
feedAll(ex, [full]);
const result = ex.finalize();
expect(result.actions).toEqual([{ tool: 'show_card', params: { card_id: 'car' } }]);
```

- [ ] **Step 2: 跑测试**

```bash
pnpm test src/lib/agent/speech-extractor.test.ts
```

Expected: 9 个测试全 PASS。

- [ ] **Step 3: typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: speech-extractor 干净。剩下视图层(LessonView/ImageCanvas/CourseCard)。

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/speech-extractor.test.ts
git commit -m "$(cat <<'EOF'
test(agent): speech-extractor fixture 改 show_card 协议

- "show" → "show_card", image_id → card_id
- 透传逻辑本身未改

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 新建 `WordCardCanvas` 组件 + 测试

**Files:**
- Create: `src/components/lesson/WordCardCanvas.tsx`
- Create: `src/components/lesson/WordCardCanvas.test.tsx`

- [ ] **Step 1: 先写失败测试 `src/components/lesson/WordCardCanvas.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordCardCanvas } from './WordCardCanvas';
import type { WordCard } from '@/types/course';

const wordCard: WordCard = {
  id: 'airplane',
  english: 'airplane',
  chinese: '飞机',
  imageUrl: '/images/transportation/airplane.svg',
  kind: 'word',
};

const sentenceCard: WordCard = {
  id: 'sentence_hour_minute',
  english: 'One hour has sixty minutes.',
  chinese: '一小时有 60 分钟。',
  imageUrl: '/images/time-numbers/sentence-hour-minute.png',
  kind: 'sentence',
};

const cards: WordCard[] = [wordCard, sentenceCard];

describe('WordCardCanvas', () => {
  it('renders the english + chinese for the current word card', () => {
    render(<WordCardCanvas cards={cards} currentCardId="airplane" />);

    expect(screen.getByText('airplane')).toBeInTheDocument();
    expect(screen.getByText('飞机')).toBeInTheDocument();
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toContain('airplane.svg');
  });

  it('renders the english + chinese for a sentence card', () => {
    render(<WordCardCanvas cards={cards} currentCardId="sentence_hour_minute" />);

    expect(screen.getByText('One hour has sixty minutes.')).toBeInTheDocument();
    expect(screen.getByText('一小时有 60 分钟。')).toBeInTheDocument();
  });

  it('marks sentence card with data-kind for css differentiation', () => {
    const { container } = render(
      <WordCardCanvas cards={cards} currentCardId="sentence_hour_minute" />
    );

    const card = container.querySelector('[data-kind="sentence"]');
    expect(card).not.toBeNull();
  });

  it('renders empty placeholder + warns when card_id is unknown (does not throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      render(<WordCardCanvas cards={cards} currentCardId="bogus" />)
    ).not.toThrow();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown card_id'));
    warn.mockRestore();
  });

  it('renders empty placeholder when cards is empty', () => {
    const { container } = render(<WordCardCanvas cards={[]} currentCardId="" />);
    expect(container.querySelector('[data-kind]')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试看红**

```bash
pnpm test src/components/lesson/WordCardCanvas.test.tsx
```

Expected: FAIL — 模块不存在。

- [ ] **Step 3: 创建 `src/components/lesson/WordCardCanvas.tsx`**

```tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { WordCard } from '@/types/course';

interface WordCardCanvasProps {
  cards: WordCard[];
  currentCardId: string;
}

export function WordCardCanvas({ cards, currentCardId }: WordCardCanvasProps) {
  const card = cards.find((c) => c.id === currentCardId);

  if (!card) {
    if (currentCardId) {
      // eslint-disable-next-line no-console
      console.warn(`[WordCardCanvas] unknown card_id: ${currentCardId}`);
    }
    return (
      <div
        className="w-full h-full bg-gray-100 rounded-lg"
        aria-label="no card"
      />
    );
  }

  const isSentence = card.kind === 'sentence';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={card.id}
        data-kind={card.kind}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full h-full bg-white rounded-lg shadow-sm flex flex-col overflow-hidden"
      >
        <div
          className="flex items-center justify-center bg-white p-4"
          style={{ flexBasis: isSentence ? '55%' : '70%', flexShrink: 0 }}
        >
          <img
            src={card.imageUrl}
            alt={card.english}
            className="max-w-full max-h-full object-contain"
          />
        </div>
        <div
          className="flex flex-col items-center justify-center text-center px-6 py-4 border-t bg-gray-50"
          style={{ flex: 1, minHeight: 0 }}
        >
          <div
            className={
              isSentence
                ? 'text-2xl font-bold text-gray-800 leading-snug'
                : 'text-4xl font-bold text-gray-800'
            }
          >
            {card.english}
          </div>
          <div
            className={
              isSentence
                ? 'text-lg text-gray-600 mt-2'
                : 'text-2xl text-gray-600 mt-2'
            }
          >
            {card.chinese}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test src/components/lesson/WordCardCanvas.test.tsx
```

Expected: 5 个测试全 PASS。如果 `data-kind` 在 motion.div 上没透传 — 改用普通 div 再裹 motion 即可。

- [ ] **Step 5: typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: WordCardCanvas 干净。剩下 `LessonView.tsx`(还引用 ImageCanvas)和 `CourseCard.tsx`(还引用 objectives.words)。

- [ ] **Step 6: Commit**

```bash
git add src/components/lesson/WordCardCanvas.tsx src/components/lesson/WordCardCanvas.test.tsx
git commit -m "$(cat <<'EOF'
feat(canvas): 新增 WordCardCanvas v2 词卡画布

- 单卡居中:图(70% 高,sentence 55%)+ 英文主标 + 中文副标
- framer-motion AnimatePresence 切卡淡入 + 轻微缩放,300ms
- 未知 card_id 渲染空容器 + console.warn,不抛错
- data-kind="word|sentence" 用于排版差异
- 测试:词卡/句卡渲染、未知 id 容错、空 cards、data-kind

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 替换 `LessonView` 与 `CourseCard`

**Files:**
- Modify: `src/components/lesson/LessonView.tsx`
- Modify: `src/components/home/CourseCard.tsx`

- [ ] **Step 1: 修改 `src/components/lesson/LessonView.tsx`**

把 `ImageCanvas` 整段换成 `WordCardCanvas`。完整替换文件:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WordCardCanvas } from './WordCardCanvas';
import { SubtitleBar } from './SubtitleBar';
import { HoldToTalkButton } from './HoldToTalkButton';
import { Bunny, BunnyMood } from './Bunny';
import { Button } from '@/components/ui/Button';
import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController, LessonStateName } from '@/lib/voice/lesson-controller';
import { useSpacebar } from '@/hooks/useSpacebar';

interface LessonViewProps {
  course: Course;
}

const STATE_TO_MOOD: Record<LessonStateName, BunnyMood> = {
  idle: 'idle',
  greeting: 'speaking',
  awaiting: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  ending: 'idle',
};

function pickLatestCardId(actions: ToolAction[]): string | null {
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (a.tool === 'show_card') return a.params.card_id;
  }
  return null;
}

export function LessonView({ course }: LessonViewProps) {
  const controllerRef = useRef<LessonController | null>(null);
  const [state, setState] = useState<LessonStateName>('idle');
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({ text: '', source: 'idle' });
  const [currentCardId, setCurrentCardId] = useState<string>(() => course.cards[0]?.id || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = new LessonController();
    controllerRef.current = c;
    c.on('state', setState);
    c.on('subtitle', (s: { text: string; source: 'user' | 'ai' }) => setSubtitle(s));
    c.on('subtitle-clear', () => setSubtitle({ text: '', source: 'idle' }));
    c.on('actions', (a: ToolAction[]) => {
      const next = pickLatestCardId(a);
      if (next) setCurrentCardId(next);
    });
    c.on('error', (err: { message: string }) => {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    });
    return () => {
      c.endLesson().catch(() => {});
    };
  }, []);

  const canHold = state === 'awaiting' || state === 'listening';

  useSpacebar({
    enabled: canHold,
    onDown: () => controllerRef.current?.startListening(),
    onUp: () => controllerRef.current?.stopListening(),
  });

  const handleStart = () => controllerRef.current?.startLesson(course.id);
  const handleEnd = () => controllerRef.current?.endLesson();
  const onPressStart = () => controllerRef.current?.startListening();
  const onPressEnd = () => controllerRef.current?.stopListening();

  const isPlaying = state === 'speaking' || state === 'greeting';
  const mood: BunnyMood = STATE_TO_MOOD[state];

  const helpText = useMemo(() => {
    switch (state) {
      case 'greeting': return '等老师讲完哦~';
      case 'awaiting': return '按住空格 / 按住按钮说话';
      case 'listening': return '我在听...';
      case 'thinking': return '让我想想...';
      case 'speaking': return '等老师说完~';
      default: return '';
    }
  }, [state]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }} className="bg-gray-50">
      <div className="flex items-center justify-between px-6 py-3 bg-white shadow-sm">
        <h1 className="text-xl font-bold text-gray-800">{course.title}</h1>
        {state !== 'idle' && (
          <Button variant="danger" size="sm" onClick={handleEnd}>结束课堂</Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <WordCardCanvas cards={course.cards} currentCardId={currentCardId} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <SubtitleBar
              text={subtitle.text}
              source={subtitle.source}
              isPlaying={isPlaying}
            />
            <div className="mt-1 text-xs text-gray-500 text-center">{helpText}</div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Bunny mood={mood} size={80} />
            {state === 'idle' ? (
              <Button size="lg" onClick={handleStart}>开始上课</Button>
            ) : (
              <HoldToTalkButton
                disabled={!canHold}
                active={state === 'listening'}
                onPressStart={onPressStart}
                onPressEnd={onPressEnd}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 修改 `src/components/home/CourseCard.tsx`**

```tsx
'use client';

import { Card } from '@/components/ui/Card';
import { Course } from '@/types/course';

interface CourseCardProps {
  course: Course;
  onClick: () => void;
}

const EMOJI: Record<string, string> = {
  car: '🚗', bus: '🚌', train: '🚂', airplane: '✈️',
  bicycle: '🚲', boat: '⛵', dog: '🐕', cat: '🐱',
  hour: '⏰', minute: '🕐', second: '⏱️',
  hundred: '💯', thousand: '🔢', million: '🧮', billion: '🌐',
};

export function CourseCard({ course, onClick }: CourseCardProps) {
  const wordCards = course.cards.filter((c) => c.kind === 'word');

  return (
    <Card onClick={onClick} className="w-full max-w-sm">
      <div className="h-48 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
        <span className="text-6xl">
          {wordCards.slice(0, 4).map((c) => EMOJI[c.english] || '📚').join(' ')}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-800">{course.title}</h3>
        <p className="text-sm text-gray-500 mt-1">{course.description}</p>
        <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
          <span>🎯 {wordCards.length} 个词汇</span>
          <span>👶 {course.targetAge[0]}-{course.targetAge[1]}岁</span>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: 全干净 — `LessonView.tsx` / `CourseCard.tsx` 都用新 schema。**只剩 `ImageCanvas.tsx` 与 `tools/*` 是 dead code,但因还存在文件,引用类型已删故 ts 会报错。**

- [ ] **Step 4: 不 commit,继续 Task 9 删除老代码,一起 commit**

理由:Task 9 删除老代码后 typecheck 才会真正干净。两个 task 形成一个原子操作。

---

### Task 9: 删除老画布代码 + 全量验证 + Commit

**Files:**
- Delete: `src/components/lesson/ImageCanvas.tsx`
- Delete: `src/components/tools/ShowTool.tsx`
- Delete: `src/components/tools/FocusTool.tsx`
- Delete: `src/components/tools/AnnotateTool.tsx`
- Delete: 目录 `src/components/tools/`(空目录)

- [ ] **Step 1: 删除老文件 + 空目录**

```bash
rm src/components/lesson/ImageCanvas.tsx
rm src/components/tools/ShowTool.tsx
rm src/components/tools/FocusTool.tsx
rm src/components/tools/AnnotateTool.tsx
rmdir src/components/tools
```

- [ ] **Step 2: 残留引用 grep 扫描**

```bash
grep -rn "ImageCanvas\|FocusTool\|AnnotateTool\|ShowTool" src/
grep -rn "FocusStyle\|AnnotateType\|ShowParams\|FocusParams\|AnnotateParams" src/
grep -rn "CourseImage\|ImageRegion" src/
grep -rn "course\.images\|course\.objectives\.words" src/
grep -rn '"focus"\|"annotate"\|可交互区域\|总览图' src/
```

Expected: 全部 0 命中。如有命中,定位并清理。

- [ ] **Step 3: 跑全量测试**

```bash
pnpm test
```

Expected: 全绿。原 27 个 + 新增 5 个 WordCardCanvas + 3 个 prompt v2 ≈ 35 个全 PASS。

- [ ] **Step 4: typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: 0 error。

- [ ] **Step 5: 启 dev server smoke 验证**

```bash
pnpm run dev
```

(后台启动,作为 coding agent 应该用 `run_in_background: true`)

打另一个 shell:

```bash
curl -s http://localhost:3000/api/courses | head -c 800
```

Expected: 返回 JSON,包含 `transportation` 与 `timeNumbers` 两节课,字段含 `cards: [...]`,无 `images` 字段,无 500 error。

- [ ] **Step 6: E2E 手动验收(主观项,真不能自动化的部分)**

(把以下交给用户)

- 浏览器开 `http://localhost:3000`
- 首页两节课都能看到 emoji 预览
- 点 transportation:开始上课 → 6 张词卡逐个切换正常,中英文清晰
- 点 timeNumbers:跑到句卡时文本字号合适、读得出"One hour has sixty minutes"
- DevTools Console 无 React warning、无 `unknown card_id` 报警(LLM 实际只发新协议)
- 关闭课程后 `/lesson-report` 命令能生成报告

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(canvas): v2 词卡画布替换老 ImageCanvas + 删除 focus/annotate

- LessonView 改用 WordCardCanvas,actions 流过滤 show_card 取最新
  card_id 驱动 currentCardId state
- CourseCard 首页预览改用 cards.filter(kind=='word'),emoji 表
  扩展支持 timeNumbers
- 删除 ImageCanvas / ShowTool / FocusTool / AnnotateTool 与
  src/components/tools/ 目录
- grep 扫描 ImageCanvas / focus / annotate / 可交互区域 / 总览图
  / course.images / objectives.words 全 0 命中

测试:全量 pnpm test 绿,tsc --noEmit 干净,/api/courses smoke OK

Spec: docs/superpowers/specs/2026-05-05-canvas-v2-wordcard-design.md
Plan: docs/superpowers/plans/2026-05-05-canvas-v2-wordcard.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 收尾

- [ ] **更新 `docs/architecture.md`** —— 第 2 节模块清单(画布层组件名)、第 6 节关键设计决策(可加一行"画布从切图器升级为词卡画布,action 协议精简到 show_card")。本步骤可以由 user 复核后另起一个 commit。
- [ ] **更新 `docs/TODO.md` §0** —— 把"P0 画布与教学策略重新设计"勾掉(`[x]`),加注完成日期。

```bash
git add docs/architecture.md docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: 同步 v2 词卡画布(architecture + TODO §0 完成)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 验收(整体)

| # | 项 | 验证方法 |
|---|----|---------|
| 1 | `pnpm test` 全绿(35 个左右) | Task 9 Step 3 |
| 2 | `tsc --noEmit` 0 error | Task 9 Step 4 |
| 3 | `/api/courses` 返回新 cards 结构 | Task 9 Step 5 curl |
| 4 | 首页两课都列出且 emoji 预览正常 | Task 9 Step 6 浏览器 |
| 5 | transportation 6 张词卡跑通 | Task 9 Step 6 浏览器 |
| 6 | timeNumbers 7 词卡 + 4 句卡跑通 | Task 9 Step 6 浏览器 |
| 7 | grep 老 API/类型 0 命中 | Task 9 Step 2 |
| 8 | `/lesson-report` 可生成 | Task 9 Step 6 |

---

## 失败应急

- **`pnpm test` 红:** 不要绕过测试。看错误信息定位:
  - prompt 测试红 → 检查 `buildSystemPrompt` 输出格式是否含 v2 关键字串
  - WordCardCanvas 测试红 → `data-kind` 是不是落到了 motion.div 上(可能要包一层)
  - speech-extractor 测试红 → fixture 字符串里 tool 名字 / params key 是不是改全了
- **`tsc --noEmit` 红:** 大概率 grep 还有漏改,按 Task 9 Step 2 命令逐条扫
- **dev server 启不来:** 看 stderr,通常是 import 路径不对或缺类型。**别交给用户排查 — CLAUDE.md 有规定,coding agent 自己加日志、自己复现。**
- **浏览器卡课程不切卡:** 打开 DevTools Console,看 `LessonView` 是否真收到 `actions` 事件,`pickLatestCardId` 是否返回非 null。LLM 还在发旧协议时 `WordCardCanvas` 会一直停在第一张卡 + 出 warn。

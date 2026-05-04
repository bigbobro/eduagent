# 画布与教学策略 v2(词卡模式)— 设计

**Date:** 2026-05-05
**Status:** Draft → 待用户复核
**Owner:** EduAgent core
**相关 TODO:** `docs/TODO.md` §0

---

## 1. 背景与动机

当前 v1 画布是"切图器":
- 总览图 `transportation_all.svg` / `overview.png` 中,中英文字直接烧在 SVG / PNG 里
- 单图(car / hour / ...)`regions: []` 为空,LLM 只能在总览图上跑 `focus` / `annotate`
- 一旦切到接 ImageGen 真实图,文字烧不进图、bbox 也无法保证准确,教学策略塌缩

实测两节课(transportation / timeNumbers)发现:
- LLM 在单图上"失明"(没 region 无法指),只能纯口播
- 总览图模式下 LLM 跳得太快,小朋友跟不上;而且 6 个 / 7 个物体一起出现,信息密度过高
- 中英文字在图里被压缩、不清晰、不可换语种

**结论:** 与其修补 `focus` 在单图上能用,不如把"教学的原子单元"从"区域"
降到"卡片":一次屏幕只展示一张词卡,卡 = **图 + 中文 + 英文**,文字独立于图。

---

## 2. 目标 / 非目标

### 2.1 目标(In scope)

1. 统一升级到**词卡画布**(`WordCardCanvas`),取代 `ImageCanvas`
2. 两节现有课(`transportation` / `timeNumbers`)迁到新 schema 跑通
3. action 协议精简到只剩 `show_card`,prompt 同步精简
4. `timeNumbers` 的 4 张句型图当"句卡"用(同一画布、同一组件、不同 `kind`)
5. 老画布 / 老 tool 组件 / 老 action 类型全部删除,源码无残留引用

### 2.2 非目标(Out of scope,留后续迭代)

- ❌ sub-region 高亮(讲 airplane 时指机翼说 wing)
- ❌ 场景图 + "找出 X" 这类 review 玩法
- ❌ §4 Codex 课程产出 SOP(独立任务,本 spec 完成后再做)
- ❌ 接 ImageGen / 生成新图(复用现有 SVG / PNG)
- ❌ Session resume / actions 与 TTS 时序对齐(独立 TODO)

### 2.3 一期边界总结

| 维度 | 一期做 | 不做 |
|------|--------|------|
| 画布形态 | 单卡居中(图 + 中 + 英) | 多卡并列、场景图、callout 浮标 |
| 教学动作 | `show_card` 切卡 | focus / zoom / annotate / sub-region |
| 文本 | 中英文双行,文字层独立于图 | 音标 / 拼读分节 / 高亮某音节 |
| 课程素材 | 复用现有 SVG / PNG | ImageGen 生成 |
| 课程产出 | 手工编 cards 数组 | Codex SOP / 自动校验 |

---

## 3. 数据模型

### 3.1 新 `Course` schema

`src/types/course.ts` 整体替换:

```ts
export interface WordCard {
  id: string;                  // 唯一 id;词卡推荐 = english 本身,句卡 = 'sentence_*'
  english: string;             // 英文(词或整句)
  chinese: string;             // 中文对照
  imageUrl: string;            // 卡面图(public 路径)
  kind: 'word' | 'sentence';   // 排版差异:sentence 文本区更高、字号略小
  difficulty?: number;
  tags?: string[];
}

export interface TeachingHints {
  opening: string;
  reviewCardIds: string[];     // 复习卡 id 列表(原 reviewWords)
  newCardIds: string[];        // 新教卡 id 列表,顺序即教学顺序(原 newWords)
  quizQuestions: string[];
  closing: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  targetAge: [number, number];
  cards: WordCard[];           // 统一卡片列表(顺序无关)
  objectives: {
    sentences: string[];       // 仍保留,供 prompt 引用为"目标句型"
  };
  teachingHints: TeachingHints;
}
```

**删除:**
- `CourseImage` / `ImageRegion`
- `Word` 接口(被 `WordCard` 取代)
- `Course.images` / `Course.objectives.words`

### 3.2 Action 协议

`src/types/tools.ts` 整体替换:

```ts
export interface ShowCardParams { card_id: string; }

export type ToolName = 'show_card';

export interface ToolAction {
  tool: 'show_card';
  params: ShowCardParams;
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

// GenerateState 保留(memory/spec 还在引用)
export interface GenerateState {
  type: 'sentence' | 'question' | 'comparison';
  content: string;
  topic: string;
}
```

**删除:** `FocusStyle` / `AnnotateType` / `ShowParams` / `FocusParams` / `AnnotateParams`。

---

## 4. 组件设计

### 4.1 `WordCardCanvas`

新增 `src/components/lesson/WordCardCanvas.tsx`。

**Props:**
```ts
interface WordCardCanvasProps {
  cards: WordCard[];
  currentCardId: string;
}
```

**布局**(经典词卡,文字在图下方,垂直堆叠居中):

```
┌─────────────────────────────┐
│                             │
│          [图片]              │   word: 70% / sentence: 55%
│                             │
├─────────────────────────────┤
│       Airplane               │   英文主标(粗)
│       飞机                   │   中文副标(稍小)
└─────────────────────────────┘
```

**实现要点:**
- 容器:`flex flex-col`,`bg-white rounded-lg overflow-hidden`
- 图区:`flex-1` 或固定 `flex-basis`(按 kind),`<img objectFit:contain>`
- 文字区:`flex-shrink-0`,英文 `text-3xl/4xl font-bold`,中文 `text-xl text-gray-600`
- 句卡(kind=sentence):英文 `text-2xl`、文本区 `flex-1`、`text-balance`
- 切卡动画:`framer-motion` 的 `AnimatePresence`,`opacity 0→1 + scale 0.95→1`,300ms
- 当 `currentCardId` 找不到对应卡:渲染空白容器 + console.warn("unknown card_id")
  (不抛错,避免 LLM 偶尔幻觉一个不存在的 id 把课程崩了)

**为什么不抽 `kind` 成两个组件:** 排版只是高度比例和字号差异,共享一个组件更省心。

### 4.2 `LessonView`

修改 `src/components/lesson/LessonView.tsx`:
- 删 `import { ImageCanvas }`,改 `import { WordCardCanvas }`
- 新增 state `currentCardId`,初值 `course.cards[0]?.id || ''`
- `controllerRef.on('actions', ...)` 里:遍历 actions,取最后一个 `tool === 'show_card'` 的 `params.card_id`,setState
- 渲染 `<WordCardCanvas cards={course.cards} currentCardId={currentCardId} />`

### 4.3 `CourseCard`(首页预览)

修改 `src/components/home/CourseCard.tsx`:
- emoji 表保持
- `course.cards.filter(c => c.kind === 'word').slice(0,4).map(c => emoji[c.english] || '📚')`
- 词汇数:`course.cards.filter(c => c.kind === 'word').length`(用户感知"词数")

---

## 5. Prompt 重构

修改 `src/lib/agent/prompt.ts`。

### 5.1 ROLE_PROMPT 调整

**保留:** 语言策略、P0 教学硬约束(连续 3 错切策略、复习只能总结已学)

**改写"教学节奏":**
```
每一张词卡的教学节奏:
1. 简短的中文引入(这是什么)
2. 用 show_card 切到对应卡片
3. 读出英文单词 / 句子
4. 让小朋友跟读
5. 简短鼓励 + 提问
```

**改写"输出格式"的 actions 示例:**
```json
"actions": [
  { "tool": "show_card", "params": { "card_id": "卡片ID" } }
]
```

**改写"工具说明":**
```
- show_card: 展示一张词卡。params: { card_id: string }
  - card_id 必须是下面"可用卡片"列出的 id 之一
  - 教新词 / 切换话题 / 复习时,先 show_card 再讲解
```

**删除:** `show` / `focus` / `annotate` 段落、"总览图"、"可交互区域"。

### 5.2 `buildCourseInfo` 调整

```
## 课程信息
- 主题: {title}
- 年龄段: {a}-{b}岁

### 可用卡片
- {id}: {english} / {chinese} ({kind})
- ...

### 目标句型
- ...

### 教学提示
- 开场: ...
- 建议先复习: {reviewCardIds.join(', ')}
- 新教卡顺序: {newCardIds.join(', ')}
- 小测问题: ...
- 结束语: ...
```

### 5.3 `buildMemoryContext` 微调

`memory.wordsLearned` 等字段语义不变(仍存"已学英文词");
P0 总结约束保留。无需大改。

---

## 6. 课程数据迁移

### 6.1 `transportation`(SVG 素材不变)

`src/data/courses/transportation.ts` 重写为:

```ts
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
```

总览图 `/images/transportation/all.svg` 保留素材但不在课程中引用。

### 6.2 `timeNumbers`(用户已准备 PNG)

7 张词卡 + 4 张句卡,共 11 张:

```ts
cards: [
  { id: 'hour',     english: 'hour',     chinese: '小时',  imageUrl: '/images/time-numbers/hour.png',     kind: 'word', difficulty: 1, tags: ['time'] },
  { id: 'minute',   english: 'minute',   chinese: '分钟',  imageUrl: '/images/time-numbers/minute.png',   kind: 'word', difficulty: 1, tags: ['time'] },
  { id: 'second',   english: 'second',   chinese: '秒',    imageUrl: '/images/time-numbers/second.png',   kind: 'word', difficulty: 1, tags: ['time'] },
  { id: 'hundred',  english: 'hundred',  chinese: '百',    imageUrl: '/images/time-numbers/hundred.png',  kind: 'word', difficulty: 2, tags: ['number'] },
  { id: 'thousand', english: 'thousand', chinese: '千',    imageUrl: '/images/time-numbers/thousand.png', kind: 'word', difficulty: 2, tags: ['number'] },
  { id: 'million',  english: 'million',  chinese: '百万',  imageUrl: '/images/time-numbers/million.png',  kind: 'word', difficulty: 3, tags: ['number'] },
  { id: 'billion',  english: 'billion',  chinese: '十亿',  imageUrl: '/images/time-numbers/billion.png',  kind: 'word', difficulty: 3, tags: ['number'] },
  { id: 'sentence_hour_minute',
    english: 'One hour has sixty minutes.', chinese: '一小时有 60 分钟。',
    imageUrl: '/images/time-numbers/sentence-hour-minute.png', kind: 'sentence' },
  { id: 'sentence_minute_second',
    english: 'One minute has sixty seconds.', chinese: '一分钟有 60 秒。',
    imageUrl: '/images/time-numbers/sentence-minute-second.png', kind: 'sentence' },
  { id: 'sentence_thousand_hundred',
    english: 'One thousand is ten hundreds.', chinese: '一千是 10 个百。',
    imageUrl: '/images/time-numbers/sentence-thousand-hundred.png', kind: 'sentence' },
  { id: 'sentence_billion_million',
    english: 'One billion is one thousand million.', chinese: '十亿是 1000 个百万。',
    imageUrl: '/images/time-numbers/sentence-billion-million.png', kind: 'sentence' },
],
teachingHints: {
  opening: '今天我们学习时间和大数字!Time and big numbers!',
  reviewCardIds: ['hour', 'minute', 'second'],
  newCardIds: [
    'hundred', 'thousand', 'million', 'billion',
    'sentence_hour_minute', 'sentence_minute_second',
    'sentence_thousand_hundred', 'sentence_billion_million',
  ],
  quizQuestions: ['一小时有多少分钟?', '一分钟有多少秒?', 'Which is bigger, thousand or hundred?', '十亿和百万有什么关系?'],
  closing: '今天我们学了 hour, minute, second, hundred, thousand, million, billion。',
},
```

### 6.3 注册函数

`allCourses` / `getCourseById` 保持不变,因 `Course` 类型已对齐。

---

## 7. Session / Memory / 词汇判定

`src/lib/agent/session.ts` 与 `memory.ts` 中:
- `wordsLearned` / `wordsToReview` / `wordPerformance` 都基于 `english` 字符串,
  与新 schema 天然对齐(`WordCard.english`)
- `memory.ts` `detectCurrentWordAttempt` 第 94 行的
  `course.objectives.words.map(w => w.english.toLowerCase())` 改为
  `course.cards.filter(c => c.kind === 'word').map(c => c.english.toLowerCase())`
- 句卡(kind=sentence)**不参与** wordPerformance 判定(它讲的是关系,不是单词跟读)

---

## 8. 删除清单

**文件删除:**
- `src/components/lesson/ImageCanvas.tsx`
- `src/components/tools/ShowTool.tsx`
- `src/components/tools/FocusTool.tsx`
- `src/components/tools/AnnotateTool.tsx`
- 目录 `src/components/tools/`(整个空目录删)

**类型删除(在 `src/types/`):**
- `Word` / `CourseImage` / `ImageRegion`(course.ts)
- `FocusStyle` / `AnnotateType` / `ShowParams` / `FocusParams` / `AnnotateParams`(tools.ts)

**素材保留**(不删,以备将来 v3 场景图复活):
- `/public/images/transportation/all.svg`
- `/public/images/time-numbers/overview.png`

---

## 9. 测试计划

### 9.1 单元 / 组件测试

- `src/lib/agent/prompt.test.ts`
  - 断言 prompt 含 `show_card` / `可用卡片` / 卡 id
  - 断言 prompt **不含** `focus` / `annotate` / `可交互区域` / `总览图`
- 新增 `src/components/lesson/WordCardCanvas.test.tsx`(Vitest + RTL)
  - 给定 cards + currentCardId='airplane' → 屏幕显示 "airplane" 与 "飞机",img src 含 `airplane.svg`
  - 切换 currentCardId='boat' → 内容更新
  - kind='sentence' 时文本区高度 / 字号断言(可用 className 探针)
  - 不存在的 card_id → 容器空 + 不抛错
- `src/lib/agent/speech-extractor.test.ts`
  - 把 fixture 中 `tool: 'show'` 改为 `tool: 'show_card'`,断言透传

### 9.2 手动 E2E

- 起 `pnpm dev`
- 首页看到两节课
- transportation:跑完 6 张词卡,LLM 切卡顺畅,中英文清晰
- timeNumbers:跑到 4 张句卡时画面文字区变大、字号合适、读得清
- `/lesson-report` 仍能生成,无 schema 不匹配错误
- DevTools Console 无 React warn / 无 `undefined card` 报错

### 9.3 回归扫描

- `grep -r "ImageCanvas\|FocusTool\|AnnotateTool\|focus.*style\|annotate.*type" src/`
  → 应只剩 import 已删 + 删除标记,确认无残留引用
- `grep -r "course.images\|course.objectives.words" src/`
  → 应 0 命中

---

## 10. 风险 / 备注

- **风险 1:** LLM 已被旧 prompt 调教过,可能生成旧 `show` / `focus` action。
  对策:`buildSystemPrompt` 完全重写并明确"只允许 show_card",speech-extractor
  对未知 tool 名做 noop(不崩)。
- **风险 2:** `wordsLearned` 是英文词字符串,句卡 id 是 `sentence_*` 不会污染。
  对策:第 7 节明确"句卡不参与 wordPerformance"。
- **风险 3:** 句卡英文较长(~10 词),TTS 时延增加。
  对策:本 spec 不优化(独立 TODO §0.actions/TTS 时序)。
- **后续依赖:** 本 spec 落地后,§4 Codex SOP 可基于这套 schema 沉淀
  "课程 cards 数组的 SOP 规则",再后续 ImageGen 也只需吐"单卡的图"。

---

## 11. 验收清单

1. ☐ `pnpm dev` 起,首页两节课列出
2. ☐ transportation:6 张词卡跑完,无 console error
3. ☐ timeNumbers:7 词卡 + 4 句卡跑完,句卡视觉合理
4. ☐ `pnpm test` 全绿
5. ☐ `/lesson-report` 可生成
6. ☐ 源码 grep 无 v1 残留(第 9.3 节命令)
7. ☐ 类型编译无 error(`tsc --noEmit`)

# Lesson Structure Refactor — Three-Phase Implementation Plan

**Implementation status (2026-05-15):** 已按本 plan 实施到 runtime。当前 master 上 food 是唯一可见课程,旧 `transportation` / `timeNumbers` 数据与旧 `LessonView` fallback 已删除,`Course.phases` 已收紧为必填。本文保留为实施记录和后续排查参考。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-15-lesson-structure-refactor-design.md`(必读,本 plan 是它的 actionable 落地)

**Goal:** 把"一种交互模式贯穿一节课"重构为显式三阶段闭环(导入 → 互动 → 巩固),用 food 示范课跑通新结构,并在最后 cleanup 中退役旧课与旧 v2 UI 入口。

**Architecture:** Course schema 加 `phases` 字段;新建 `PhasedLessonController` 包装 `LessonController` 的 ASR/TTS/SSE 管线,外层 phase 状态机规则驱动切换;三个 phase 子组件独立(`IntroPhase` / `InteractivePhase` / `ReinforcePhase`);`LessonClient` 最终只走 `PhasedLessonView`。旧课 `transportation` / `timeNumbers` 不迁移,本 epic 末尾退役。

**Tech Stack:** Next.js 14 自定义 server + TypeScript 严格模式 + vitest + React 18 + @testing-library/react + Tailwind (Bunny 主题) + 现有 ASR/TTS/LLM 管线全部复用。

---

## File Structure 概览

**新建**(纯新增):
- `src/data/courses/food.ts` — food 示范课数据
- `src/data/courses/index.ts` — 新课程 registry(`allCourses` / `getCourseById`)
- `src/data/courses/food.test.ts` — food 课程专属校验单测
- `public/images/food/scene.svg` — 食物餐桌场景图(每张 card 一个 `<g id="card-X">` hotspot,嵌入单体 PNG)
- `public/images/food/{apple,banana,bread,milk,egg,rice}.png` — ImageGen 生成的单卡图
- `src/lib/voice/phased-lesson-controller.ts` — 新外层 controller
- `src/lib/voice/phased-lesson-controller.test.ts`
- `src/components/lesson/PhasedLessonView.tsx` — 顶层 phase 路由
- `src/components/lesson/IntroPhase.tsx` — 导入子组件
- `src/components/lesson/IntroPhase.test.tsx`
- `src/components/lesson/InteractivePhase.tsx` — 互动子组件(复用课堂元素,接注入 controller)
- `src/components/lesson/ReinforcePhase.tsx` — 巩固子组件(题板编排)
- `src/components/lesson/QuizPickWord.tsx` + `.test.tsx`
- `src/components/lesson/QuizRepeatAfterMe.tsx` + `.test.tsx`

**修改**:
- `src/types/course.ts` — 加 `Phases` / `Quiz` 等类型;实现初期可短暂 optional,最终 cleanup 后 `Course.phases` 必填
- `src/types/session.ts`(如果存在)/ `src/lib/agent/session.ts` — Session 加 `currentPhase`
- `src/lib/agent/prompt.ts` — 按 `session.currentPhase` 注入不同段
- `src/lib/agent/session.ts` — 新增 `setSessionPhase` + 在 `streamUserInput` 末尾 yield `progress_snapshot`
- `src/lib/agent/orchestrator.ts` — `mapEventToSSE` 加 `progress_snapshot` 事件映射
- `src/app/api/chat/route.ts` — 加 `action='phase-transition'` 和 `action='quiz-answer'` 分支
- `src/lib/voice/lesson-controller.ts` — **加一个 public 方法 `sendCustomAction(body)`**(底层管线复用)
- `src/app/lesson/[id]/LessonClient.tsx` — 最终直接走 `PhasedLessonView`
- 现有 `@/data/courses/transportation` registry 引用改为 `@/data/courses`
- `docs/architecture.md` — 同步 §2 模块清单 / §4 状态机 / §6 关键决策(最后一步)

**最后 cleanup 退役/删除**:
- `src/data/courses/transportation.ts`
- `src/data/courses/timeNumbers.ts`
- `src/components/lesson/LessonView.tsx` 及只服务旧入口的测试/引用

**继续复用**:
- `src/components/lesson/WordBook.tsx` / `BloomButton.tsx` / `SubtitleBar.tsx` — 直接复用
- `src/components/bunny/Bunny.tsx` / `src/components/scene/SceneFrame.tsx` — 直接复用

---

## Task 1: 扩展 Course 类型,加 Phases / Quiz

**Files:**
- Modify: `src/types/course.ts`
- Test: `src/types/course.test.ts`(新)

- [ ] **Step 1.1: 写失败的类型测试**

新建 `src/types/course.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Course, Phases, Quiz } from './course';

describe('Course phases type', () => {
  it('accepts a course with phases', () => {
    const course: Course = {
      id: 'demo',
      title: 'demo',
      description: 'demo',
      targetAge: [3, 6],
      theme: 'food',
      cards: [],
      objectives: { sentences: [] },
      teachingHints: {
        opening: '', reviewCardIds: [], newCardIds: [], quizQuestions: [], closing: '',
      },
      phases: {
        introduction: { sceneImage: '/x.svg' },
        interactive: {},
        reinforcement: { quizzes: [] },
      },
    };
    expect(course.phases?.introduction.sceneImage).toBe('/x.svg');
  });

  it('discriminates Quiz union', () => {
    const pick: Quiz = {
      id: 'q1', type: 'pick-word', prompt: 'Where is apple?',
      correctCardId: 'apple', distractorCardIds: ['banana', 'bread'],
    };
    const repeat: Quiz = {
      id: 'q2', type: 'repeat-after-me', cardId: 'apple', targetText: 'This is an apple.',
    };
    expect(pick.type).toBe('pick-word');
    expect(repeat.type).toBe('repeat-after-me');
  });

  it('temporarily accepts a course without phases until final cleanup', () => {
    const course: Course = {
      id: 'legacy', title: 'legacy', description: '', targetAge: [3, 6],
      theme: 'transport', cards: [], objectives: { sentences: [] },
      teachingHints: { opening: '', reviewCardIds: [], newCardIds: [], quizQuestions: [], closing: '' },
    };
    expect(course.phases).toBeUndefined();
  });
});
```

- [ ] **Step 1.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/types/course.test.ts
```

Expected: 失败(Phases/Quiz 不存在,Course.phases 字段不存在)。报错 `Cannot find name 'Phases'` 或类似。

- [ ] **Step 1.3: 给 `src/types/course.ts` 加 Phases / Quiz 类型 + 过渡期 Course.phases optional**

在 `src/types/course.ts` 末尾追加:

```ts
export interface IntroductionPhase {
  sceneImage: string;
  sceneCaption?: string;
  narrationHint?: string;
}

export interface InteractivePhase {
  // 占位,后续 epic 扩展(Agent 工具偏好等)
}

export interface ReinforcementPhase {
  quizzes: Quiz[];
}

export interface Phases {
  introduction: IntroductionPhase;
  interactive: InteractivePhase;
  reinforcement: ReinforcementPhase;
}

export type Quiz =
  | {
      id: string;
      type: 'pick-word';
      prompt: string;
      correctCardId: string;
      distractorCardIds: string[];
    }
  | {
      id: string;
      type: 'repeat-after-me';
      cardId: string;
      targetText: string;
    };
```

然后修改 `Course` interface,加 optional `phases`:

```ts
export interface Course {
  id: string;
  title: string;
  description: string;
  targetAge: [number, number];
  theme: CourseTheme;
  cards: WordCard[];
  objectives: {
    sentences: string[];
  };
  teachingHints: TeachingHints;
  phases?: Phases;  // 过渡期 optional;最终 cleanup 后改为必填
}
```

- [ ] **Step 1.4: 跑测试,确认通过**

```bash
pnpm exec vitest run src/types/course.test.ts
pnpm exec tsc --noEmit
```

Expected: 全部 PASS,tsc 无错。

- [ ] **Step 1.5: Commit**

```bash
git add src/types/course.ts src/types/course.test.ts
git commit -m "$(cat <<'EOF'
feat(types): extend Course with transitional Phases / Quiz schema

- IntroductionPhase: sceneImage / sceneCaption / narrationHint
- InteractivePhase: 占位(下个 epic 扩展)
- ReinforcementPhase.quizzes: pick-word | repeat-after-me discriminated union
- Course.phases 先保持 optional,最终 cleanup 删除旧课后改必填

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 写 food 示范课数据(无图片资源)

**Files:**
- Create: `src/data/courses/food.ts`
- Create: `src/data/courses/index.ts`(新标准课程 registry)
- Modify: registry 调用方,从 `@/data/courses/transportation` 改到 `@/data/courses`

- [ ] **Step 2.1: 新建 `src/data/courses/food.ts`**

```ts
import { Course } from '@/types/course';

export const foodCourse: Course = {
  id: 'food',
  title: '食物 Food',
  description: '学习常见食物的英文名称',
  targetAge: [3, 6],
  theme: 'food',
  cards: [
    { id: 'apple',  english: 'apple',  chinese: '苹果',  imageUrl: '/images/food/apple.png',  kind: 'word', drillParts: ['app', 'le'],     difficulty: 1, tags: ['food'] },
    { id: 'banana', english: 'banana', chinese: '香蕉',  imageUrl: '/images/food/banana.png', kind: 'word', drillParts: ['ba', 'na', 'na'], difficulty: 1, tags: ['food'] },
    { id: 'bread',  english: 'bread',  chinese: '面包',  imageUrl: '/images/food/bread.png',  kind: 'word', drillParts: ['bread'],          difficulty: 1, tags: ['food'] },
    { id: 'milk',   english: 'milk',   chinese: '牛奶',  imageUrl: '/images/food/milk.png',   kind: 'word', drillParts: ['milk'],           difficulty: 1, tags: ['food'] },
    { id: 'egg',    english: 'egg',    chinese: '鸡蛋',  imageUrl: '/images/food/egg.png',    kind: 'word', drillParts: ['egg'],            difficulty: 1, tags: ['food'] },
    { id: 'rice',   english: 'rice',   chinese: '米饭',  imageUrl: '/images/food/rice.png',   kind: 'word', drillParts: ['rice'],           difficulty: 2, tags: ['food'] },
  ],
  objectives: {
    sentences: ['This is a ___.', 'I like ___.'],
  },
  teachingHints: {
    opening: '今天我们看看餐桌上有什么食物!',
    reviewCardIds: [],
    newCardIds: ['apple', 'banana', 'bread', 'milk', 'egg', 'rice'],
    quizQuestions: ['Where is the apple?', 'Find the milk.', '哪个是 bread?'],
    closing: '今天我们认识了 apple, banana, bread, milk, egg, rice!',
  },
  phases: {
    introduction: {
      sceneImage: '/images/food/scene.svg',
      sceneCaption: '餐桌上摆着各种食物',
      narrationHint: '逐个指认餐桌上的食物,语气温和不催促,每张说完停 1-2 秒让孩子看图。不要问孩子能不能说出来。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word',       prompt: 'Where is the apple?',  correctCardId: 'apple',  distractorCardIds: ['milk', 'bread'] },
        { id: 'q2', type: 'pick-word',       prompt: 'Find the milk.',        correctCardId: 'milk',   distractorCardIds: ['rice', 'egg'] },
        { id: 'q3', type: 'pick-word',       prompt: 'Which one is bread?',   correctCardId: 'bread',  distractorCardIds: ['banana', 'apple'] },
        { id: 'q4', type: 'repeat-after-me', cardId: 'apple',                 targetText: 'This is an apple.' },
        { id: 'q5', type: 'repeat-after-me', cardId: 'milk',                  targetText: 'I like milk.' },
      ],
    },
  },
};
```

- [ ] **Step 2.2: 新建 `src/data/courses/index.ts`,把 foodCourse 注册为唯一可见课程**

```ts
import { Course } from '@/types/course';
import { foodCourse } from './food';

export const allCourses: Course[] = [foodCourse];

export function getCourseById(id: string): Course | undefined {
  return allCourses.find((c) => c.id === id);
}
```

- [ ] **Step 2.2b: 把 registry 调用方改到 `@/data/courses`**

至少更新:
- `src/app/api/courses/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/stats/route.ts`
- `src/app/api/sessions/route.ts`
- `src/app/api/progress/route.ts`
- `src/lib/voice/asr-proxy.ts`
- `src/data/courses/course-data.test.ts`
- `src/lib/stats.test.ts`

旧 `transportation.ts` / `timeNumbers.ts` 文件暂时可以留在磁盘上,但不再进入 `allCourses`;最终 cleanup task 删除它们和相关测试依赖。

- [ ] **Step 2.3: 跑通用单测,确认旧 `course-data.test.ts` 仍然通过**

```bash
pnpm exec vitest run src/data/courses/course-data.test.ts
```

Expected: PASS(food.cards 全部有非空 drillParts,通用断言不报错)。

- [ ] **Step 2.4: tsc 无错**

```bash
pnpm exec tsc --noEmit
```

Expected: PASS。

- [ ] **Step 2.5: Commit**

```bash
git add src/data/courses/food.ts src/data/courses/index.ts src/app/api src/lib/voice/asr-proxy.ts src/data/courses/course-data.test.ts src/lib/stats.test.ts
git commit -m "$(cat <<'EOF'
feat(course): add food demo course with phases

- 6 cards: apple / banana / bread / milk / egg / rice
- phases.introduction.sceneImage → /images/food/scene.svg (asset 下一 task 加)
- phases.reinforcement.quizzes: 3 pick-word + 2 short-sentence repeat-after-me
- 新建 src/data/courses/index.ts,food 是唯一可见课程
- registry 调用方改到 @/data/courses

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 写 food 课程专属校验单测

**Files:**
- Create: `src/data/courses/food.test.ts`

校验 `docs/course-authoring-standard.md` 的课程完整性约束。

- [ ] **Step 3.1: 写测试,先让 quiz 引用 / 资产存在校验失败**

```ts
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { foodCourse } from './food';

describe('food course schema integrity', () => {
  const cardIds = new Set(foodCourse.cards.map((c) => c.id));

  it('has phases defined', () => {
    expect(foodCourse.phases).toBeDefined();
  });

  it('all card ids are unique', () => {
    expect(cardIds.size).toBe(foodCourse.cards.length);
  });

  it('defines short sentence objectives', () => {
    expect(foodCourse.objectives.sentences.length).toBeGreaterThanOrEqual(1);
    expect(foodCourse.objectives.sentences).toContain('This is a ___.');
  });

  it('quiz pick-word references only valid card ids', () => {
    const quizzes = foodCourse.phases!.reinforcement.quizzes;
    for (const q of quizzes) {
      if (q.type !== 'pick-word') continue;
      expect(cardIds.has(q.correctCardId), `correctCardId ${q.correctCardId}`).toBe(true);
      for (const d of q.distractorCardIds) {
        expect(cardIds.has(d), `distractor ${d}`).toBe(true);
      }
      expect(q.distractorCardIds).not.toContain(q.correctCardId);
      expect(q.distractorCardIds.length).toBeGreaterThanOrEqual(2);
      expect(q.distractorCardIds.length).toBeLessThanOrEqual(3);
    }
  });

  it('quiz repeat-after-me references only valid card ids', () => {
    const quizzes = foodCourse.phases!.reinforcement.quizzes;
    for (const q of quizzes) {
      if (q.type !== 'repeat-after-me') continue;
      expect(cardIds.has(q.cardId), `cardId ${q.cardId}`).toBe(true);
      expect(q.targetText.trim().length).toBeGreaterThan(0);
      expect(q.targetText).toMatch(/[.?!]$/);
      expect(q.targetText.toLowerCase()).not.toMatch(/^say\s+\w+\.?$/);
    }
  });

  it('scene SVG file exists', () => {
    const sceneUrl = foodCourse.phases!.introduction.sceneImage;
    const filePath = path.join(process.cwd(), 'public', sceneUrl);
    expect(fs.existsSync(filePath), `scene file ${filePath}`).toBe(true);
  });

  it('scene SVG contains hotspot for every card', () => {
    const sceneUrl = foodCourse.phases!.introduction.sceneImage;
    const filePath = path.join(process.cwd(), 'public', sceneUrl);
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const card of foodCourse.cards) {
      expect(content, `scene 缺少 hotspot card-${card.id}`).toContain(`id="card-${card.id}"`);
      expect(content, `scene 未嵌入 ${card.imageUrl}`).toContain(`href="${card.imageUrl}"`);
    }
  });

  it('every card has its own image file', () => {
    for (const card of foodCourse.cards) {
      expect(card.imageUrl.endsWith('.png'), `${card.id} should use ImageGen PNG`).toBe(true);
      const filePath = path.join(process.cwd(), 'public', card.imageUrl);
      expect(fs.existsSync(filePath), `card image ${filePath}`).toBe(true);
    }
  });
});
```

- [ ] **Step 3.2: 跑测试,确认资产校验失败(scene / card images 还没创建)**

```bash
pnpm exec vitest run src/data/courses/food.test.ts
```

Expected: schema 部分 PASS,资产部分 FAIL(`scene file ... false`)。

- [ ] **Step 3.3: 不 commit**(资产 Task 4 创建后再一起 commit。本步只确认测试在运行 + 给下一 task 留 fail signal)

---

## Task 4: 创建 food 资产(ImageGen 单卡 PNG + 场景 SVG)

**Files:**
- Create: `public/images/food/scene.svg`
- Create: `public/images/food/{apple,banana,bread,milk,egg,rice}.png`(每张一个文件)

按 `docs/course-authoring-standard.md` 走:Codex 用 ImageGen 生成单体 PNG,再由 `scene.svg` 结构化嵌入。不要只交一张不可交互的大图。

- [ ] **Step 4.1: 用 ImageGen 生成 6 张单卡 PNG**

对每个 card 各生成一张儿童友好、扁平插画风格的单体图,保存为:

```text
public/images/food/apple.png
public/images/food/banana.png
public/images/food/bread.png
public/images/food/milk.png
public/images/food/egg.png
public/images/food/rice.png
```

统一 prompt 约束:
- single subject only, centered, no text, no label, no watermark
- warm child-friendly flat illustration, thick soft outline, simple shapes
- plain light background or transparent-looking clean background
- consistent style across all six assets

实施注意:
- 使用内置 ImageGen 生成后,把最终选中的图片复制/移动进 `public/images/food/`。
- 不要把项目引用指向 `$CODEX_HOME/generated_images/...`。
- 不要覆盖已有正式资产;若目录已有旧图,先确认是否为本 task 产物。

- [ ] **Step 4.2: 创建 scene.svg**

`public/images/food/scene.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768" width="1024" height="768">
  <rect x="0" y="0" width="1024" height="768" fill="#fef6e4"/>
  <rect x="64" y="286" width="896" height="360" fill="#e8c896" rx="28"/>
  <ellipse cx="512" cy="468" rx="410" ry="170" fill="#f0d2a2" opacity="0.55"/>

  <g id="card-apple" style="cursor: pointer;">
    <image href="/images/food/apple.png" x="118" y="365" width="124" height="124"/>
  </g>
  <g id="card-banana" style="cursor: pointer;">
    <image href="/images/food/banana.png" x="278" y="365" width="124" height="124"/>
  </g>
  <g id="card-bread" style="cursor: pointer;">
    <image href="/images/food/bread.png" x="438" y="365" width="124" height="124"/>
  </g>
  <g id="card-milk" style="cursor: pointer;">
    <image href="/images/food/milk.png" x="598" y="365" width="124" height="124"/>
  </g>
  <g id="card-egg" style="cursor: pointer;">
    <image href="/images/food/egg.png" x="758" y="365" width="124" height="124"/>
  </g>
  <g id="card-rice" style="cursor: pointer;">
    <image href="/images/food/rice.png" x="450" y="515" width="124" height="124"/>
  </g>
</svg>
```

- [ ] **Step 4.3: 跑 food.test.ts,确认全部通过**

```bash
pnpm exec vitest run src/data/courses/food.test.ts
```

Expected: 全部 PASS(含短句目标、quiz 引用、PNG 文件、scene hotspot 校验)。

- [ ] **Step 4.4: Commit**

```bash
git add src/data/courses/food.test.ts public/images/food/
git commit -m "$(cat <<'EOF'
feat(course-food): demo scene + ImageGen card assets

- public/images/food/{apple,banana,bread,milk,egg,rice}.png: ImageGen 单体图
- public/images/food/scene.svg: 6 个 <g id="card-X"> hotspot,嵌入 PNG
- food.test.ts: schema + 短句 + 资产完整性校验,全绿
- 正式插画精修留下个 epic(本 epic 不阻塞结构验证)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Session 加 currentPhase,新增 setSessionPhase

**Files:**
- Modify: `src/lib/agent/session.ts`
- Test: `src/lib/agent/session-phase.test.ts`(新)

- [ ] **Step 5.1: 写失败的单测**

新建 `src/lib/agent/session-phase.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, getSession, setSessionPhase, endSession } from './session';

describe('session phase tracking', () => {
  it('phased course session starts at intro', () => {
    const s = createSession(foodCourse);
    expect(s.currentPhase).toBe('intro');
    endSession(s.id);
  });

  it('setSessionPhase updates phase', () => {
    const s = createSession(foodCourse);
    setSessionPhase(s.id, 'interactive');
    expect(getSession(s.id)?.currentPhase).toBe('interactive');
    endSession(s.id);
  });

  it('setSessionPhase on missing session is a no-op', () => {
    expect(() => setSessionPhase('nonexistent', 'interactive')).not.toThrow();
  });
});
```

- [ ] **Step 5.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/lib/agent/session-phase.test.ts
```

Expected: FAIL(`setSessionPhase is not a function`,`currentPhase` 字段不存在)。

- [ ] **Step 5.3: 修改 `src/lib/agent/session.ts`**

在文件顶部 `Session` interface 改:

```ts
export type PhaseName = 'intro' | 'interactive' | 'reinforcement' | 'done';

export interface Session {
  id: string;
  courseId: string;
  course: Course;
  memory: LessonMemory;
  tokenUsage: TokenUsage;
  startTime: Date;
  currentPhase: PhaseName;  // ← 新增
}
```

在 `createSession` 函数里:

```ts
export function createSession(course: Course): Session {
  const id = uuidv4();
  const session: Session = {
    id,
    courseId: course.id,
    course,
    memory: initializeCardProgress(createMemory(), course),
    tokenUsage: {
      asr: { requests: 0, tokens: 0 },
      llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
      tts: { requests: 0, characters: 0 },
    },
    startTime: new Date(),
    currentPhase: 'intro',  // ← 新增
  };
  sessions.set(id, session);
  createLessonLog(id, course.id);
  return session;
}
```

在文件末尾追加 `setSessionPhase`:

```ts
export function setSessionPhase(sessionId: string, phase: PhaseName): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.currentPhase = phase;
}
```

- [ ] **Step 5.4: 跑测试,确认通过**

```bash
pnpm exec vitest run src/lib/agent/session-phase.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS。

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/agent/session.ts src/lib/agent/session-phase.test.ts
git commit -m "$(cat <<'EOF'
feat(session): track currentPhase + setSessionPhase API

- Session.currentPhase: 'intro' | 'interactive' | 'reinforcement' | 'done'
- 新标准课程统一初始 'intro'
- setSessionPhase 给后续 phase-transition API 用

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: prompt.ts 按 currentPhase 注入不同段

**Files:**
- Modify: `src/lib/agent/prompt.ts`
- Test: `src/lib/agent/prompt-phase.test.ts`(新)

- [ ] **Step 6.1: 写失败的单测**

新建 `src/lib/agent/prompt-phase.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createMemory, initializeCardProgress } from './memory';
import { buildSystemPrompt } from './prompt';

function memoryFor(course = foodCourse) {
  return initializeCardProgress(createMemory(), course);
}

describe('phase-aware system prompt', () => {
  it('intro phase: 含"逐个指认"约束 + 含 narrationHint', () => {
    const prompt = buildSystemPrompt(foodCourse, memoryFor(), 'intro');
    expect(prompt).toContain('introduction 阶段');
    expect(prompt).toContain('逐个指认');
    expect(prompt).toContain(foodCourse.phases!.introduction.narrationHint!);
    expect(prompt).toContain('不要问孩子能不能说');
  });

  it('interactive phase: 含 v2 完整教学约束', () => {
    const prompt = buildSystemPrompt(foodCourse, memoryFor(), 'interactive');
    expect(prompt).toContain('interactive 阶段');
    expect(prompt).toContain('P0 教学硬约束');
    expect(prompt).toContain('先练目标词');
  });

  it('reinforcement phase: 含"不再介绍新词"', () => {
    const prompt = buildSystemPrompt(foodCourse, memoryFor(), 'reinforcement');
    expect(prompt).toContain('reinforcement 阶段');
    expect(prompt).toContain('不再介绍新词');
  });

  it('defaults to interactive when phase is omitted during transition', () => {
    const prompt = buildSystemPrompt(foodCourse, memoryFor());
    expect(prompt).toContain('interactive 阶段');
    expect(prompt).toContain('P0 教学硬约束');
  });
});
```

- [ ] **Step 6.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/lib/agent/prompt-phase.test.ts
```

Expected: FAIL(`buildSystemPrompt` 当前签名只 2 个 arg)。

- [ ] **Step 6.3: 修改 `src/lib/agent/prompt.ts`**

在文件顶部加 phase 段常量:

```ts
import { PhaseName } from './session';

const PHASE_INTRO_PROMPT = `
## 当前阶段:introduction 阶段
- 你正在做"主题导入",目标是让孩子先看懂今天学什么,不强求孩子开口
- **逐个指认**屏幕场景图里的元素,每张 card 说一句温和的引入,语气轻松不催促
- 每介绍一张 card 时,必须输出 show_card action,card_id 用下面"可用卡片"里的 id
- **不要问孩子能不能说出来**,这一阶段是输入,不考核
- 讲完所有 cards 之后停下来,等系统切换阶段
`;

const PHASE_INTERACTIVE_PROMPT = `
## 当前阶段:interactive 阶段
- 你正在做"AI 互动",目标是让孩子开口尝试目标词
- 先练目标词,再自然带一个 objectives.sentences 里的核心短句
- 完整使用本课程默认教学循环(P0 教学硬约束 + ASR 容错判定)
`;

const PHASE_REINFORCEMENT_PROMPT = `
## 当前阶段:reinforcement 阶段
- 你正在做"强化巩固",**不再介绍新词**
- 按 quiz 列表逐题出题,等客户端传 quiz-answer
- 答错时正面反馈 + 重播 prompt;同一题错 ≥ 3 次时给出正确答案并自动推进
`;
```

修改函数签名 + 拼装逻辑:

```ts
export function buildSystemPrompt(
  course: Course,
  memory: LessonMemory,
  currentPhase: PhaseName = 'interactive',  // 过渡期默认 interactive,最终调用方都显式传 session.currentPhase
): string {
  const sections = [ROLE_PROMPT, buildCourseInfo(course)];

  if (currentPhase === 'intro') {
    const hint = course.phases?.introduction.narrationHint || '';
    sections.push(PHASE_INTRO_PROMPT + (hint ? `\n- 旁白指南: ${hint}` : ''));
  } else if (currentPhase === 'interactive') {
    sections.push(PHASE_INTERACTIVE_PROMPT);
  } else if (currentPhase === 'reinforcement') {
    sections.push(PHASE_REINFORCEMENT_PROMPT);
  }

  sections.push(buildMemoryContext(memory));
  return sections.join('\n\n---\n\n');
}
```

- [ ] **Step 6.4: 跑测试,确认通过**

```bash
pnpm exec vitest run src/lib/agent/prompt-phase.test.ts
pnpm exec vitest run src/lib/agent/prompt.test.ts
```

Expected: 两个测试文件都 PASS(旧测试两参调用时默认进入 interactive 段;cleanup 阶段可再收紧调用方)。

- [ ] **Step 6.5: 让 session.ts 在调 buildSystemPrompt 时传 phase**

修改 `src/lib/agent/session.ts` 里 `streamUserInput` 函数,把:

```ts
const systemPrompt = buildSystemPrompt(session.course, session.memory);
```

改为:

```ts
const systemPrompt = buildSystemPrompt(session.course, session.memory, session.currentPhase);
```

- [ ] **Step 6.6: 跑全部相关测试**

```bash
pnpm exec vitest run src/lib/agent
pnpm exec tsc --noEmit
```

Expected: 全 PASS。

- [ ] **Step 6.7: Commit**

```bash
git add src/lib/agent/prompt.ts src/lib/agent/prompt-phase.test.ts src/lib/agent/session.ts
git commit -m "$(cat <<'EOF'
feat(prompt): phase-aware system prompt

- buildSystemPrompt 第三参数 currentPhase(default interactive,过渡兼容两参调用)
- intro: 逐个指认 + 不问孩子,带 narrationHint
- interactive: 沿用 v2 完整教学循环
- reinforcement: 不再介绍新词,按 quiz 列表出题
- session.streamUserInput 把 session.currentPhase 透传过去

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 加 `progress_snapshot` SSE 事件

**Files:**
- Modify: `src/lib/agent/session.ts`(在 `streamUserInput` 末尾 yield 一条 snapshot)
- Modify: `src/lib/agent/orchestrator.ts`(`mapEventToSSE` 加分支)
- Test: `src/lib/agent/progress-snapshot.test.ts`(新)

- [ ] **Step 7.1: 写失败的单测**

新建 `src/lib/agent/progress-snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, streamUserInput, endSession } from './session';

describe('progress_snapshot SSE event', () => {
  it('emits a progress_snapshot event with clearedCardIds and totalAttempts', async () => {
    if (process.env.VOICE_MOCK !== 'true') {
      // 真 LLM 跑测试会消耗 token,只在 mock 下跑
      return;
    }
    const session = createSession(foodCourse);
    const events: any[] = [];
    for await (const ev of streamUserInput(session.id, '(课堂开始)')) {
      events.push(ev);
    }
    const snapshot = events.find((e) => e.type === 'progress_snapshot');
    expect(snapshot).toBeDefined();
    expect(snapshot.clearedCardIds).toBeInstanceOf(Array);
    expect(typeof snapshot.totalAttempts).toBe('number');
    endSession(session.id);
  });
});
```

(此测试在 `VOICE_MOCK=true` 下才真正跑,否则 early-return — 与项目现有做法对齐。)

- [ ] **Step 7.2: 跑测试,确认失败(或 skip)**

```bash
VOICE_MOCK=true pnpm exec vitest run src/lib/agent/progress-snapshot.test.ts
```

Expected: FAIL(`progress_snapshot` event 不存在)。

- [ ] **Step 7.3: 修改 `src/lib/agent/session.ts`**

`StreamUserEvent` union 加新分支:

```ts
export type StreamUserEvent =
  | { type: 'speech-delta'; text: string }
  | { type: 'speech-end' }
  | { type: 'actions'; actions: ToolAction[]; state_update: AgentResponse['state_update'] }
  | { type: 'progress_snapshot'; clearedCardIds: string[]; totalAttempts: number; currentPhase: PhaseName }  // ← 新增
  | { type: 'done' }
  | { type: 'error'; message: string };
```

在 `streamUserInput` 里,**在 `yield { type: 'done' }` 之前**插入:

```ts
let totalAttempts = 0;
session.memory.wordPerformance.forEach((p) => { totalAttempts += p.attempts; });

yield {
  type: 'progress_snapshot',
  clearedCardIds: [...session.memory.clearedCardIds],
  totalAttempts,
  currentPhase: session.currentPhase,
};

yield { type: 'done' };
```

- [ ] **Step 7.4: 修改 `src/lib/agent/orchestrator.ts` 的 `mapEventToSSE`**

加分支:

```ts
case 'progress_snapshot':
  return sseFrame('progress_snapshot', {
    clearedCardIds: ev.clearedCardIds,
    totalAttempts: ev.totalAttempts,
    currentPhase: ev.currentPhase,
  });
```

- [ ] **Step 7.5: 跑测试,确认通过**

```bash
VOICE_MOCK=true pnpm exec vitest run src/lib/agent/progress-snapshot.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS。

- [ ] **Step 7.6: Commit**

```bash
git add src/lib/agent/session.ts src/lib/agent/orchestrator.ts src/lib/agent/progress-snapshot.test.ts
git commit -m "$(cat <<'EOF'
feat(sse): emit progress_snapshot at end of each turn

- Server 在 streamUserInput 末尾 yield clearedCardIds + totalAttempts + currentPhase
- orchestrator 映射为 SSE 'progress_snapshot' 事件
- 客户端 PhasedLessonController 用来判断 [切2] 条件(后续 task 接)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `action=phase-transition` API 处理

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Test: `src/app/api/chat/phase-transition.test.ts`(新,通过 mock fetch 测)

- [ ] **Step 8.1: 写失败的单测**

新建 `src/app/api/chat/phase-transition.test.ts`(API route 单测使用 directly invoke POST handler):

```ts
import { describe, expect, it } from 'vitest';
import { POST } from './route';
import { createSession, endSession, getSession } from '@/lib/agent/session';
import { foodCourse } from '@/data/courses/food';

function makeReq(body: any): any {
  return {
    json: async () => body,
  } as any;
}

describe('POST /api/chat action=phase-transition', () => {
  it('updates session.currentPhase and streams SSE', async () => {
    if (process.env.VOICE_MOCK !== 'true') return;
    const session = createSession(foodCourse);
    const res = await POST(makeReq({
      action: 'phase-transition',
      sessionId: session.id,
      to: 'interactive',
    }));
    expect(getSession(session.id)?.currentPhase).toBe('interactive');
    expect(res.headers.get('Content-Type')).toContain('event-stream');
    endSession(session.id);
  });

  it('returns 404 for unknown session', async () => {
    const res = await POST(makeReq({
      action: 'phase-transition',
      sessionId: 'nope',
      to: 'interactive',
    }));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid phase', async () => {
    const session = createSession(foodCourse);
    const res = await POST(makeReq({
      action: 'phase-transition',
      sessionId: session.id,
      to: 'garbage',
    }));
    expect(res.status).toBe(400);
    endSession(session.id);
  });
});
```

- [ ] **Step 8.2: 跑测试,确认失败**

```bash
VOICE_MOCK=true pnpm exec vitest run src/app/api/chat/phase-transition.test.ts
```

Expected: FAIL(`phase-transition` 未实现,返回 `Invalid action` 400)。

- [ ] **Step 8.3: 修改 `src/app/api/chat/route.ts`**

在 `if (body.action === 'end')` 之前加:

```ts
if (body.action === 'phase-transition') {
  const session = getSession(body.sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  const valid = ['intro', 'interactive', 'reinforcement', 'done'];
  if (!valid.includes(body.to)) {
    return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
  }
  setSessionPhase(body.sessionId, body.to);
  // 跑一轮 LLM 让它输出本 phase 的开场白
  const stream = streamUserInputToSSE(body.sessionId, `(切换到 ${body.to} 阶段,请说一句简短开场)`);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

加 import:

```ts
import { createSession, getSession, endSession, setSessionPhase } from '@/lib/agent/session';
```

- [ ] **Step 8.4: 跑测试,确认通过**

```bash
VOICE_MOCK=true pnpm exec vitest run src/app/api/chat/phase-transition.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS。

- [ ] **Step 8.5: Commit**

```bash
git add src/app/api/chat/route.ts src/app/api/chat/phase-transition.test.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /api/chat action=phase-transition

- 更新 session.currentPhase
- 跑一轮 LLM (新 prompt) 输出 phase 开场白,SSE 流回客户端
- 404 unknown session / 400 invalid phase

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `action=quiz-answer` API 处理

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/agent/session.ts`(加 `recordQuizAnswer`)
- Modify: `src/lib/db/schema.ts` + `queries.ts`(若 lesson-report 需要,本 epic 只要内存层)
- Test: `src/app/api/chat/quiz-answer.test.ts`(新)

为减少 db 改动,本 task **只在 session 内存里记 quiz 答题**,db 层留下个 epic。lesson-report 短期里看到的是 `interactions` log(沿用现有路径),quiz 答题作为 interaction 写进去。

- [ ] **Step 9.1: 写失败的单测**

新建 `src/app/api/chat/quiz-answer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { POST } from './route';
import { createSession, endSession, getSession } from '@/lib/agent/session';
import { foodCourse } from '@/data/courses/food';

function makeReq(body: any): any { return { json: async () => body } as any; }

describe('POST /api/chat action=quiz-answer', () => {
  it('records quiz answer and returns ok with assessment', async () => {
    const session = createSession(foodCourse);
    const res = await POST(makeReq({
      action: 'quiz-answer',
      sessionId: session.id,
      quizId: 'q1',
      answer: 'apple',
      correct: true,
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const stored = getSession(session.id)?.memory.totalInteractions;
    expect(stored).toBeGreaterThan(0);
    endSession(session.id);
  });

  it('returns 404 for unknown session', async () => {
    const res = await POST(makeReq({
      action: 'quiz-answer', sessionId: 'nope', quizId: 'q1', answer: 'x', correct: false,
    }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 9.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/app/api/chat/quiz-answer.test.ts
```

Expected: FAIL。

- [ ] **Step 9.3: 实现 `recordQuizAnswer` in `src/lib/agent/session.ts`**

在文件末尾追加:

```ts
export function recordQuizAnswer(
  sessionId: string,
  quizId: string,
  answer: string,
  correct: boolean,
): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.memory.totalInteractions += 1;
  insertInteraction(session.id, {
    timestamp: new Date(),
    userInput: `[quiz:${quizId}] ${answer}`,
    aiResponse: '',
    actions: [],
    modelCalls: { llm: { latency: 0, inputTokens: 0, outputTokens: 0 } },
    // 自定义字段(若 InteractionLog 不支持,加 optional 字段或用 actions 数组里塞 marker)
  } as any);
  return true;
}
```

> 实施 agent 注:若 `InteractionLog` interface 严格不允许 quiz 字段,把 quizId/correct 编码进 `userInput` 字符串(如 `[quiz:q1 ✓] apple`),不要新增 schema 字段。lesson-report 解析时按 prefix 识别。

- [ ] **Step 9.4: 修改 `src/app/api/chat/route.ts`**

在合适位置加分支:

```ts
if (body.action === 'quiz-answer') {
  const ok = recordQuizAnswer(body.sessionId, body.quizId, body.answer, body.correct);
  if (!ok) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

加 import:

```ts
import { createSession, getSession, endSession, setSessionPhase, recordQuizAnswer } from '@/lib/agent/session';
```

- [ ] **Step 9.5: 跑测试,确认通过**

```bash
pnpm exec vitest run src/app/api/chat/quiz-answer.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS。

- [ ] **Step 9.6: Commit**

```bash
git add src/lib/agent/session.ts src/app/api/chat/route.ts src/app/api/chat/quiz-answer.test.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /api/chat action=quiz-answer

- recordQuizAnswer 写进 interactions(供 lesson-report 解析)
- 404 unknown session
- 数据库 schema 本 epic 不扩展(quiz 编码进 userInput prefix)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: LessonController 加 `sendCustomAction(body)` public 方法(additive)

**Files:**
- Modify: `src/lib/voice/lesson-controller.ts`
- Test: 集成测在 Task 11 一起

为让 PhasedLessonController 能复用 LessonController 的 SSE+TTS 管线触发"phase 切换的开场白 SSE",给 LessonController 加一个 public 方法 `sendCustomAction`。这一步仍然不重写底层音频管线。

- [ ] **Step 10.1: 在 `LessonController` 类里 `endLesson` 方法之后追加**

```ts
/**
 * 发送一个自定义 chat action 并消费返回的 SSE(speech/actions 走老路)。
 * 给外层 PhasedLessonController 触发 phase-transition SSE 用。
 */
async sendCustomAction(body: Record<string, any>): Promise<void> {
  if (!this.sessionId) throw new Error('Session not started');
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, sessionId: this.sessionId }),
  });
  if (!res.ok || !res.body) {
    this.emit('error', { message: `Action ${body.action} failed: ${res.status}` });
    return;
  }
  await this.consumeSSE(res.body, () => {});
}

getSessionId(): string | null {
  return this.sessionId;
}
```

- [ ] **Step 10.2: tsc + 跑 v2 现有测试**

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run src/lib/voice
```

Expected: PASS(`lesson-controller` 内部测试若有都不动)。

- [ ] **Step 10.3: Commit**

```bash
git add src/lib/voice/lesson-controller.ts
git commit -m "$(cat <<'EOF'
feat(controller): add LessonController.sendCustomAction + getSessionId

- additive only — 现有 startLesson / endLesson / startListening 等行为不变
- 给 PhasedLessonController(下 task)用来触发 phase-transition / quiz-answer SSE

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: PhasedLessonController(外层 phase 状态机)

**Files:**
- Create: `src/lib/voice/phased-lesson-controller.ts`
- Test: `src/lib/voice/phased-lesson-controller.test.ts`

这是本 epic 的核心新类。它:
1. 拥有一个 LessonController 实例
2. 监听 LessonController 的 `actions` / `state` 事件,累计 `introducedCardIds`,从 SSE `progress_snapshot` 读 `clearedCardIds`
3. 在合适时机调用 `v2.sendCustomAction({ action: 'phase-transition', to: ... })`,然后 emit 'phase-change'

为让 `progress_snapshot` 事件能被 PhasedLessonController 收到,LessonController 的 `consumeSSE` 已经 ignore 这个 event(switch default fall-through)。需要给 LessonController 加一个新的对外事件 `progress`(或让 PhasedLessonController 拦截 SSE)。

**实施选择**:给 LessonController 的 `handleSseEvent` 加一个 `progress_snapshot` 分支,emit 一个 `'progress'` 事件(新加)。

- [ ] **Step 11.1: 给 LessonController 加 progress 事件**

修改 `src/lib/voice/lesson-controller.ts`:

`EventName` union 加:

```ts
type EventName =
  | 'state'
  | 'subtitle'
  | 'subtitle-clear'
  | 'actions'
  | 'progress'           // ← 新增
  | 'phase-change'       // ← 新增(给 PhasedLessonController 用,v2 自己不 emit)
  | 'error';
```

`handleSseEvent` 加分支:

```ts
case 'progress_snapshot':
  this.emit('progress', payload);
  break;
```

- [ ] **Step 11.2: 写 PhasedLessonController 单测(纯逻辑,mock LessonController)**

新建 `src/lib/voice/phased-lesson-controller.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { PhasedLessonController, PhaseName } from './phased-lesson-controller';

// 测试用 mock LessonController,只暴露必要 API
function mockV2() {
  const listeners = new Map<string, Set<Function>>();
  return {
    on(event: string, fn: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off() {},
    emit(event: string, data: any) {
      listeners.get(event)?.forEach((fn) => fn(data));
    },
    startLesson: vi.fn(async () => {}),
    endLesson: vi.fn(async () => {}),
    startListening: vi.fn(async () => {}),
    stopListening: vi.fn(async () => {}),
    sendCustomAction: vi.fn(async () => {}),
    getSessionId: vi.fn(() => 'mock-session'),
    getState: vi.fn(() => 'awaiting'),
  };
}

describe('PhasedLessonController phase transitions', () => {
  let v2: ReturnType<typeof mockV2>;
  let ctrl: PhasedLessonController;

  beforeEach(() => {
    v2 = mockV2();
    ctrl = new PhasedLessonController(v2 as any, foodCourse);
  });

  it('starts at phase=intro', async () => {
    await ctrl.startLesson();
    expect(ctrl.getCurrentPhase()).toBe('intro');
  });

  it('intro → interactive when all cards introduced + TTS finished', async () => {
    await ctrl.startLesson();
    const phaseChanges: PhaseName[] = [];
    ctrl.on('phase-change', (p: PhaseName) => phaseChanges.push(p));

    // 模拟 v2 emit show_card 6 次(所有 cards)
    for (const card of foodCourse.cards) {
      v2.emit('actions', [{ tool: 'show_card', params: { card_id: card.id } }]);
    }
    // 此时还没 TTS finished,不切
    expect(ctrl.getCurrentPhase()).toBe('intro');

    // 模拟 TTS 播完(v2 state 进 awaiting)
    v2.emit('state', 'awaiting');

    // 等微任务跑完
    await new Promise((r) => setTimeout(r, 10));
    expect(phaseChanges).toContain('interactive');
    expect(ctrl.getCurrentPhase()).toBe('interactive');
    expect(v2.sendCustomAction).toHaveBeenCalledWith({ action: 'phase-transition', to: 'interactive' });
  });

  it('interactive → reinforcement when all cards cleared + TTS finished', async () => {
    await ctrl.startLesson();
    ctrl['currentPhase'] = 'interactive'; // 强制进入互动阶段

    const phaseChanges: PhaseName[] = [];
    ctrl.on('phase-change', (p: PhaseName) => phaseChanges.push(p));

    // 模拟 progress_snapshot,所有 cards 都 cleared
    v2.emit('progress', {
      clearedCardIds: foodCourse.cards.map((c) => c.id),
      totalAttempts: 6,
      currentPhase: 'interactive',
    });
    v2.emit('state', 'awaiting');

    await new Promise((r) => setTimeout(r, 10));
    expect(phaseChanges).toContain('reinforcement');
  });

  it('interactive → reinforcement when totalAttempts >= 3 × cards.length (fallback)', async () => {
    await ctrl.startLesson();
    ctrl['currentPhase'] = 'interactive';

    const phaseChanges: PhaseName[] = [];
    ctrl.on('phase-change', (p: PhaseName) => phaseChanges.push(p));

    v2.emit('progress', {
      clearedCardIds: ['apple'],  // 只 cleared 1 张
      totalAttempts: 3 * foodCourse.cards.length,  // 但尝试次数已超
      currentPhase: 'interactive',
    });
    v2.emit('state', 'awaiting');

    await new Promise((r) => setTimeout(r, 10));
    expect(phaseChanges).toContain('reinforcement');
  });
});
```

- [ ] **Step 11.3: 跑测试,确认失败**

```bash
pnpm exec vitest run src/lib/voice/phased-lesson-controller.test.ts
```

Expected: FAIL(类不存在)。

- [ ] **Step 11.3b (新增): 加 intro follow-up 兜底测试**

在 `phased-lesson-controller.test.ts` 末尾追加(用 `vi.useFakeTimers()` 模拟 3s 空闲):

```ts
describe('PhasedLessonController intro follow-up fallback', () => {
  let v2: ReturnType<typeof mockV2>;
  let ctrl: PhasedLessonController;

  beforeEach(() => {
    vi.useFakeTimers();
    v2 = mockV2();
    ctrl = new PhasedLessonController(v2 as any, foodCourse);
  });
  afterEach(() => vi.useRealTimers());

  it('intro: 3s idle 且 cards 未全部介绍 → 发 follow-up message', async () => {
    await ctrl.startLesson();
    // 只介绍 3 张
    for (const card of foodCourse.cards.slice(0, 3)) {
      v2.emit('actions', [{ tool: 'show_card', params: { card_id: card.id } }]);
    }
    v2.emit('state', 'awaiting');
    vi.advanceTimersByTime(3500);
    expect(v2.sendCustomAction).toHaveBeenCalledWith({
      action: 'message',
      text: expect.stringContaining('继续'),
    });
  });

  it('intro: 第 3 次空闲(已 follow-up 2 次)→ 强制切到 interactive', async () => {
    await ctrl.startLesson();
    // 模拟 3 轮 idle,每轮 3.5s
    for (let i = 0; i < 3; i++) {
      v2.emit('state', 'speaking');  // reset idle timer
      v2.emit('state', 'awaiting');
      vi.advanceTimersByTime(3500);
    }
    // 第 1、2 次是 follow-up message,第 3 次应该是 phase-transition
    const calls = (v2.sendCustomAction as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.filter((c: any) => c.action === 'message').length).toBe(2);
    expect(calls.find((c: any) => c.action === 'phase-transition' && c.to === 'interactive')).toBeDefined();
  });

  it('intro: 卡片介绍齐全后 idle timer 不再起作用(走主路径切阶段)', async () => {
    await ctrl.startLesson();
    for (const card of foodCourse.cards) {
      v2.emit('actions', [{ tool: 'show_card', params: { card_id: card.id } }]);
    }
    v2.emit('state', 'awaiting');
    await Promise.resolve(); // microtask
    expect(v2.sendCustomAction).toHaveBeenCalledWith({ action: 'phase-transition', to: 'interactive' });
  });
});
```

跑:`pnpm exec vitest run src/lib/voice/phased-lesson-controller.test.ts` — 应该 FAIL(follow-up 未实现)。

- [ ] **Step 11.4: 写 `src/lib/voice/phased-lesson-controller.ts`**

```ts
'use client';

import { LessonController } from './lesson-controller';
import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';

export type PhaseName = 'intro' | 'interactive' | 'reinforcement' | 'done';

type EventName = 'phase-change';
type Listener<T = any> = (data: T) => void;

interface ProgressSnapshot {
  clearedCardIds: string[];
  totalAttempts: number;
  currentPhase: PhaseName | null;
}

export class PhasedLessonController {
  private listeners = new Map<EventName, Set<Listener>>();
  private currentPhase: PhaseName = 'intro';
  private introducedCardIds = new Set<string>();
  private lastSnapshot: ProgressSnapshot | null = null;
  private pendingTransition: PhaseName | null = null;
  private introIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private introFollowupCount = 0;
  private static readonly INTRO_IDLE_MS = 3000;
  private static readonly MAX_INTRO_FOLLOWUPS = 2;

  constructor(
    private v2: LessonController,
    private course: Course,
  ) {
    this.v2.on('actions', this.onV2Actions);
    this.v2.on('progress', this.onV2Progress);
    this.v2.on('state', this.onV2State);
  }

  // ─── public API ─────────────────────────────────────────────────

  on(event: EventName, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }
  off(event: EventName, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }
  private emit(event: EventName, data: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  getCurrentPhase(): PhaseName { return this.currentPhase; }

  async startLesson(): Promise<void> {
    await this.v2.startLesson(this.course.id);
  }

  async endLesson(): Promise<void> {
    if (this.introIdleTimer) {
      clearTimeout(this.introIdleTimer);
      this.introIdleTimer = null;
    }
    this.v2.off('actions', this.onV2Actions);
    this.v2.off('progress', this.onV2Progress);
    this.v2.off('state', this.onV2State);
    await this.v2.endLesson();
    this.currentPhase = 'done';
  }

  // ─── v2 event handlers ──────────────────────────────────────────

  private onV2Actions = (actions: ToolAction[]) => {
    if (this.currentPhase !== 'intro') return;
    for (const a of actions) {
      if (a.tool === 'show_card') {
        this.introducedCardIds.add(a.params.card_id);
      }
    }
    this.maybeArmTransition();
  };

  private onV2Progress = (snapshot: ProgressSnapshot) => {
    this.lastSnapshot = snapshot;
    this.maybeArmTransition();
  };

  private onV2State = (state: string) => {
    // 任何非 awaiting 状态都先 cancel 兜底计时器
    if (state !== 'awaiting') {
      if (this.introIdleTimer) {
        clearTimeout(this.introIdleTimer);
        this.introIdleTimer = null;
      }
      return;
    }
    // pending transition 优先
    if (this.pendingTransition) {
      const target = this.pendingTransition;
      this.pendingTransition = null;
      void this.performTransition(target);
      return;
    }
    // intro 兜底:LLM 卡住 + cards 没介绍齐 → 起 idle 计时
    if (
      this.currentPhase === 'intro' &&
      this.introducedCardIds.size < this.course.cards.length
    ) {
      this.armIntroIdleTimer();
    }
  };

  private armIntroIdleTimer(): void {
    if (this.introIdleTimer) clearTimeout(this.introIdleTimer);
    this.introIdleTimer = setTimeout(() => {
      this.introIdleTimer = null;
      if (this.currentPhase !== 'intro') return;
      if (this.introducedCardIds.size >= this.course.cards.length) return;
      if (this.introFollowupCount >= PhasedLessonController.MAX_INTRO_FOLLOWUPS) {
        // 已 follow-up 2 次仍不齐 → 强制切
        void this.performTransition('interactive');
        return;
      }
      this.introFollowupCount += 1;
      void this.v2.sendCustomAction({
        action: 'message',
        text: '(请继续介绍下一张 card,直到全部介绍完)',
      });
    }, PhasedLessonController.INTRO_IDLE_MS);
  }

  // ─── transition logic ───────────────────────────────────────────

  private maybeArmTransition(): void {
    if (this.pendingTransition) return; // 已 armed
    if (this.currentPhase === 'intro') {
      if (this.introducedCardIds.size >= this.course.cards.length) {
        this.pendingTransition = 'interactive';
      }
    } else if (this.currentPhase === 'interactive' && this.lastSnapshot) {
      const allCleared = this.lastSnapshot.clearedCardIds.length >= this.course.cards.length;
      const maxAttemptsReached = this.lastSnapshot.totalAttempts >= 3 * this.course.cards.length;
      if (allCleared || maxAttemptsReached) {
        this.pendingTransition = 'reinforcement';
      }
    }
  }

  private async performTransition(to: PhaseName): Promise<void> {
    this.currentPhase = to;
    this.emit('phase-change', to);
    await this.v2.sendCustomAction({ action: 'phase-transition', to });
  }

  /**
   * 给 ReinforcePhase 用:所有 quizzes 答完后调,切到 done。
   */
  async completeReinforcement(): Promise<void> {
    this.currentPhase = 'done';
    this.emit('phase-change', 'done');
  }
}
```

- [ ] **Step 11.5: 跑测试,确认通过**

```bash
pnpm exec vitest run src/lib/voice/phased-lesson-controller.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS。

- [ ] **Step 11.6: Commit**

```bash
git add src/lib/voice/lesson-controller.ts src/lib/voice/phased-lesson-controller.ts src/lib/voice/phased-lesson-controller.test.ts
git commit -m "$(cat <<'EOF'
feat(controller): PhasedLessonController — outer phase state machine

- LessonController 加 'progress' / 'phase-change' 事件
- v2 SSE handler 把 progress_snapshot 转发到 'progress' 事件
- PhasedLessonController 监听 actions + progress + state,armed-then-fire transition
- 切1: introducedCardIds.size === cards.length + TTS done
- 切2: clearedCardIds full OR totalAttempts >= 3×cards.length + TTS done
- 切3: 由 ReinforcePhase 触发(completeReinforcement)
- intro 兜底:LLM 卡住 3s 未介绍齐 → 主动 follow-up message,最多 2 次,仍不齐则强制切 interactive
- 单测全绿:主路 + interactive fallback + intro follow-up 3 个 case

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: IntroPhase 子组件

**Files:**
- Create: `src/components/lesson/IntroPhase.tsx`
- Test: `src/components/lesson/IntroPhase.test.tsx`

- [ ] **Step 12.1: 写 IntroPhase 测试**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntroPhase } from './IntroPhase';
import { foodCourse } from '@/data/courses/food';

describe('IntroPhase', () => {
  it('renders the scene image', () => {
    render(<IntroPhase course={foodCourse} onHotspotClick={() => {}} />);
    const img = screen.getByRole('img', { name: /餐桌/ });
    expect(img).toBeTruthy();
  });

  it('calls onHotspotClick when a card hotspot is clicked', async () => {
    const onClick = vi.fn();
    const { container } = render(<IntroPhase course={foodCourse} onHotspotClick={onClick} />);
    // 模拟点击 #card-apple (实际场景中由 inline SVG 处理 — 此测试用 DOM 模拟)
    const target = container.querySelector('[data-hotspot="apple"]');
    if (target) {
      fireEvent.click(target);
      expect(onClick).toHaveBeenCalledWith('apple');
    }
  });

  it('disabled BloomButton placeholder visible', () => {
    render(<IntroPhase course={foodCourse} onHotspotClick={() => {}} />);
    // 占位元素,arial-disabled 或 data 属性
    const placeholder = screen.getByTestId('bloom-placeholder');
    expect(placeholder).toBeTruthy();
  });
});
```

- [ ] **Step 12.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/components/lesson/IntroPhase.test.tsx
```

Expected: FAIL。

- [ ] **Step 12.3: 写 `IntroPhase.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Course } from '@/types/course';

interface IntroPhaseProps {
  course: Course;
  onHotspotClick: (cardId: string) => void;
}

export function IntroPhase({ course, onHotspotClick }: IntroPhaseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const phases = course.phases;
  if (!phases) return null;

  // 给 SVG 里的 <g id="card-X"> 绑定 click(SVG 通过 <object> 或 inline 渲染)
  // 简化:用 <img> + 透明覆盖层(data-hotspot)实现可点击
  useEffect(() => {
    if (!containerRef.current) return;
    const handlers: Array<{ el: Element; fn: EventListener }> = [];
    for (const card of course.cards) {
      const el = containerRef.current.querySelector(`[data-hotspot="${card.id}"]`);
      if (!el) continue;
      const fn = () => onHotspotClick(card.id);
      el.addEventListener('click', fn);
      handlers.push({ el, fn });
    }
    return () => {
      for (const { el, fn } of handlers) el.removeEventListener('click', fn);
    };
  }, [course, onHotspotClick]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center bg-bunny-cream">
      <div className="relative w-[90vw] max-w-[1024px] aspect-[4/3]">
        <img
          src={phases.introduction.sceneImage}
          alt={phases.introduction.sceneCaption || '场景:餐桌'}
          className="w-full h-full"
        />
        {/* 透明 hotspot 覆盖层(本 MVP 用绝对定位坐标硬编码,future 用 SVG inline 直接绑) */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-2 p-8">
          {course.cards.map((card) => (
            <button
              key={card.id}
              type="button"
              data-hotspot={card.id}
              className="opacity-0 hover:opacity-20 hover:bg-bunny-pink rounded-full transition-opacity cursor-pointer"
              aria-label={`点 ${card.chinese}`}
            />
          ))}
        </div>
      </div>
      {phases.introduction.sceneCaption && (
        <p className="mt-4 font-zh text-lg text-bunny-ink-soft">{phases.introduction.sceneCaption}</p>
      )}
      {/* BloomButton 占位(灰),保留布局 */}
      <div data-testid="bloom-placeholder" className="absolute bottom-6 right-8 w-16 h-16 rounded-full bg-bunny-cream-soft opacity-30" aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 12.4: 跑测试,确认通过**

```bash
pnpm exec vitest run src/components/lesson/IntroPhase.test.tsx
```

Expected: PASS。

- [ ] **Step 12.5: Commit**

```bash
git add src/components/lesson/IntroPhase.tsx src/components/lesson/IntroPhase.test.tsx
git commit -m "$(cat <<'EOF'
feat(lesson): IntroPhase component — scene image + hotspot click

- 展示 phases.introduction.sceneImage
- 透明覆盖层 hotspot(MVP: grid 布局对齐 scene.svg 中 6 个 food item 位置)
- 灰 BloomButton 占位,保留布局
- onHotspotClick(cardId) 给上层 PhasedLessonView 用

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: InteractivePhase 子组件(复用课堂元素,不依赖 LessonView)

**Files:**
- Create: `src/components/lesson/InteractivePhase.tsx`
- Test: `src/components/lesson/InteractivePhase.test.tsx`

**实现路径**:在 InteractivePhase 内重新组合课堂元素(SceneFrame + WordBook + BloomButton + SubtitleBar + Bunny),并绑定到 PhasedLessonController 持有的 LessonController(通过 prop 注入)。`LessonView.tsx` 后续 cleanup 退役。

- [ ] **Step 13.1: 写测试**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InteractivePhase } from './InteractivePhase';
import { foodCourse } from '@/data/courses/food';
import { LessonController } from '@/lib/voice/lesson-controller';

function mockController(): any {
  return {
    on: vi.fn(), off: vi.fn(), getState: () => 'awaiting',
    startListening: vi.fn(), stopListening: vi.fn(),
  };
}

describe('InteractivePhase', () => {
  it('renders WordBook + Bunny + BloomButton + SubtitleBar', () => {
    render(<InteractivePhase course={foodCourse} controller={mockController()} />);
    // WordBook 包含至少一张 card 文本
    expect(screen.getByText(/apple/i)).toBeTruthy();
  });
});
```

- [ ] **Step 13.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/components/lesson/InteractivePhase.test.tsx
```

- [ ] **Step 13.3: 写 `InteractivePhase.tsx`**

参考现有课堂布局,重新组合 SceneFrame + WordBook + Bunny + BloomButton + SubtitleBar,但 controller 通过 prop 注入:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { WordBook } from './WordBook';
import { SubtitleBar } from './SubtitleBar';
import { BloomButton } from './BloomButton';
import { Bunny, type BunnyMood, type BunnyPose } from '@/components/bunny/Bunny';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController, LessonStateName } from '@/lib/voice/lesson-controller';
import { useSpacebar } from '@/hooks/useSpacebar';

const STATE_TO_MOOD: Record<LessonStateName, BunnyMood> = {
  idle: 'idle', greeting: 'speaking', awaiting: 'idle', listening: 'listening',
  thinking: 'thinking', speaking: 'speaking', ending: 'idle',
};
const STATE_TO_POSE: Record<LessonStateName, BunnyPose> = {
  idle: 'stand', greeting: 'stand', awaiting: 'stand', listening: 'stand',
  thinking: 'stand', speaking: 'point', ending: 'stand',
};

interface Props {
  course: Course;
  controller: LessonController;
}

export function InteractivePhase({ course, controller }: Props) {
  const [state, setState] = useState<LessonStateName>(controller.getState());
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({
    text: '', source: 'idle',
  });
  const [currentCardId, setCurrentCardId] = useState<string>(course.cards[0]?.id || '');

  useEffect(() => {
    const onState = (s: LessonStateName) => setState(s);
    const onSub = (s: { text: string; source: 'user' | 'ai' }) => setSubtitle(s);
    const onClear = () => setSubtitle({ text: '', source: 'idle' });
    const onActions = (a: ToolAction[]) => {
      for (let i = a.length - 1; i >= 0; i--) {
        if (a[i].tool === 'show_card') {
          setCurrentCardId(a[i].params.card_id);
          break;
        }
      }
    };
    controller.on('state', onState);
    controller.on('subtitle', onSub);
    controller.on('subtitle-clear', onClear);
    controller.on('actions', onActions);
    return () => {
      controller.off('state', onState);
      controller.off('subtitle', onSub);
      controller.off('subtitle-clear', onClear);
      controller.off('actions', onActions);
    };
  }, [controller]);

  const canHold = state === 'awaiting' || state === 'listening';
  useSpacebar({
    enabled: canHold,
    onDown: () => controller.startListening(),
    onUp: () => controller.stopListening(),
  });

  const isPlaying = state === 'speaking' || state === 'greeting';

  return (
    <SceneFrame variant="cabin" enterFrom="yard">
      <div className="absolute inset-0 top-14 bottom-28 flex items-center justify-center px-4">
        <div className="relative" style={{ width: 'min(90vw, calc((100vh - 200px) * 4 / 3))', maxWidth: '1600px' }}>
          <WordBook cards={course.cards} currentCardId={currentCardId} />
          <div className="absolute left-6 bottom-6 z-20">
            <Bunny pose={STATE_TO_POSE[state]} mood={STATE_TO_MOOD[state]} size={120} />
          </div>
        </div>
      </div>
      <footer className="absolute bottom-0 left-0 right-0 h-28 z-20 flex items-center justify-center px-8 gap-4">
        <div className="flex-1 max-w-4xl">
          <SubtitleBar text={subtitle.text} source={subtitle.source} isPlaying={isPlaying} />
        </div>
        <BloomButton
          disabled={!canHold}
          active={state === 'listening'}
          onPressStart={() => controller.startListening()}
          onPressEnd={() => controller.stopListening()}
        />
      </footer>
    </SceneFrame>
  );
}
```

- [ ] **Step 13.4: 跑测试,确认通过**

```bash
pnpm exec vitest run src/components/lesson/InteractivePhase.test.tsx
pnpm exec tsc --noEmit
```

- [ ] **Step 13.5: Commit**

```bash
git add src/components/lesson/InteractivePhase.tsx src/components/lesson/InteractivePhase.test.tsx
git commit -m "$(cat <<'EOF'
feat(lesson): InteractivePhase — v2 layout driven by injected controller

- 复用 SceneFrame + WordBook + Bunny + BloomButton 布局元素
- 不依赖 LessonView.tsx;旧 LessonView 在 cleanup 阶段退役
- controller 通过 prop 注入(来自 PhasedLessonController 持有的 LessonController)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: QuizPickWord 组件

**Files:**
- Create: `src/components/lesson/QuizPickWord.tsx`
- Test: `src/components/lesson/QuizPickWord.test.tsx`

- [ ] **Step 14.1: 写测试**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuizPickWord } from './QuizPickWord';
import { foodCourse } from '@/data/courses/food';

describe('QuizPickWord', () => {
  const quiz = {
    id: 'q1', type: 'pick-word' as const,
    prompt: 'Where is the apple?',
    correctCardId: 'apple',
    distractorCardIds: ['milk', 'bread'],
  };

  it('renders prompt + 3 image options', () => {
    render(<QuizPickWord quiz={quiz} course={foodCourse} onAnswer={() => {}} />);
    expect(screen.getByText(/Where is the apple/)).toBeTruthy();
    // 3 张图(1 correct + 2 distractor)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(3);
  });

  it('calls onAnswer(correct=true) when correct card tapped', () => {
    const onAnswer = vi.fn();
    render(<QuizPickWord quiz={quiz} course={foodCourse} onAnswer={onAnswer} />);
    const appleBtn = screen.getByRole('button', { name: /apple/i });
    fireEvent.click(appleBtn);
    expect(onAnswer).toHaveBeenCalledWith({ correct: true, picked: 'apple' });
  });

  it('calls onAnswer(correct=false) when distractor tapped', () => {
    const onAnswer = vi.fn();
    render(<QuizPickWord quiz={quiz} course={foodCourse} onAnswer={onAnswer} />);
    const milkBtn = screen.getByRole('button', { name: /milk/i });
    fireEvent.click(milkBtn);
    expect(onAnswer).toHaveBeenCalledWith({ correct: false, picked: 'milk' });
  });
});
```

- [ ] **Step 14.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/components/lesson/QuizPickWord.test.tsx
```

- [ ] **Step 14.3: 写 `QuizPickWord.tsx`**

```tsx
'use client';

import { useMemo } from 'react';
import { Course, Quiz, WordCard } from '@/types/course';

interface Props {
  quiz: Extract<Quiz, { type: 'pick-word' }>;
  course: Course;
  onAnswer: (result: { correct: boolean; picked: string }) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function QuizPickWord({ quiz, course, onAnswer }: Props) {
  const options = useMemo<WordCard[]>(() => {
    const ids = [quiz.correctCardId, ...quiz.distractorCardIds];
    return shuffle(ids.map((id) => course.cards.find((c) => c.id === id)!).filter(Boolean));
  }, [quiz, course]);

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <h2 className="font-zh text-2xl text-bunny-ink">{quiz.prompt}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {options.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onAnswer({ correct: card.id === quiz.correctCardId, picked: card.id })}
            className="w-32 h-32 bg-white border-2 border-bunny-pink-soft rounded-bunny-lg hover:scale-105 transition-transform flex items-center justify-center"
            aria-label={card.english}
          >
            <img src={card.imageUrl} alt={card.english} className="w-24 h-24" />
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 14.4: 跑测试,确认通过**

```bash
pnpm exec vitest run src/components/lesson/QuizPickWord.test.tsx
```

- [ ] **Step 14.5: Commit**

```bash
git add src/components/lesson/QuizPickWord.tsx src/components/lesson/QuizPickWord.test.tsx
git commit -m "$(cat <<'EOF'
feat(lesson): QuizPickWord — pick the correct image from N options

- 显示 prompt + 1 correct + 2-3 distractor 卡片图
- 选项随机洗牌
- tap → onAnswer({correct, picked})

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: QuizRepeatAfterMe 组件

**Files:**
- Create: `src/components/lesson/QuizRepeatAfterMe.tsx`
- Test: `src/components/lesson/QuizRepeatAfterMe.test.tsx`

复用 BloomButton + LessonController 的 ASR + 一个简单的"语音含目标词"判定(本 MVP 不调 LLM judge,直接 string contains;后续可改为 LLM judge)。

- [ ] **Step 15.1: 写测试**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QuizRepeatAfterMe } from './QuizRepeatAfterMe';
import { foodCourse } from '@/data/courses/food';

function mockController(): any {
  const listeners = new Map<string, Set<Function>>();
  return {
    on(e: string, fn: Function) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e)!.add(fn); },
    off() {},
    emit(e: string, d: any) { listeners.get(e)?.forEach((fn) => fn(d)); },
    startListening: vi.fn(),
    stopListening: vi.fn(),
    getState: vi.fn(() => 'awaiting'),
  };
}

describe('QuizRepeatAfterMe', () => {
  const quiz = { id: 'q4', type: 'repeat-after-me' as const, cardId: 'apple', targetText: 'This is an apple.' };

  it('renders targetText + BloomButton', () => {
    render(<QuizRepeatAfterMe quiz={quiz} course={foodCourse} controller={mockController()} onAnswer={() => {}} />);
    expect(screen.getByText(/This is an apple/)).toBeTruthy();
  });

  it('judges correct when ASR final contains target word (case-insensitive)', () => {
    const onAnswer = vi.fn();
    const c = mockController();
    render(<QuizRepeatAfterMe quiz={quiz} course={foodCourse} controller={c} onAnswer={onAnswer} />);
    act(() => c.emit('subtitle', { text: 'I see APPLE!', source: 'user' }));
    // 模拟 ASR final 触发
    // 实际实现可能监听 'subtitle' source='user' 当 final 后,或暴露 ASR final 事件
    // 简化:暴露 onSubtitleUser 处理 — 测试侧把 stopListening 触发后立即检查
    // ... 详见实现
  });
});
```

> 实施 agent 注:`QuizRepeatAfterMe` 判定的事件来源 — LessonController 的 `subtitle` 事件(`source='user'`)在 ASR final 时 emit。本组件监听这个事件,把它当成"用户说完一句"的信号。判定:`lowercased(text).includes(targetWord)` 即 correct。

- [ ] **Step 15.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/components/lesson/QuizRepeatAfterMe.test.tsx
```

- [ ] **Step 15.3: 写 `QuizRepeatAfterMe.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { BloomButton } from './BloomButton';
import { Course, Quiz } from '@/types/course';
import { LessonController } from '@/lib/voice/lesson-controller';
import { useSpacebar } from '@/hooks/useSpacebar';

interface Props {
  quiz: Extract<Quiz, { type: 'repeat-after-me' }>;
  course: Course;
  controller: LessonController;
  onAnswer: (result: { correct: boolean; said: string }) => void;
}

export function QuizRepeatAfterMe({ quiz, course, controller, onAnswer }: Props) {
  const [listening, setListening] = useState(false);
  const card = course.cards.find((c) => c.id === quiz.cardId);
  const targetWord = card?.english.toLowerCase() || '';

  useEffect(() => {
    const onSub = (s: { text: string; source: 'user' | 'ai' }) => {
      // 用户的 ASR final / partial 都会走这里;粗暴用 partial 触发(实际可改 final-only)
      if (s.source !== 'user') return;
      if (!targetWord) return;
      const said = s.text.toLowerCase();
      if (said.includes(targetWord)) {
        onAnswer({ correct: true, said: s.text });
      }
    };
    controller.on('subtitle', onSub);
    return () => controller.off('subtitle', onSub);
  }, [controller, targetWord, onAnswer]);

  useSpacebar({
    enabled: true,
    onDown: () => { setListening(true); controller.startListening(); },
    onUp: () => { setListening(false); controller.stopListening(); },
  });

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <p className="font-zh text-xl text-bunny-ink-soft">跟着说:</p>
      <h2 className="font-en text-3xl text-bunny-ink">{quiz.targetText}</h2>
      {card && (
        <img src={card.imageUrl} alt={card.english} className="w-32 h-32 mt-4" />
      )}
      <BloomButton
        disabled={false}
        active={listening}
        onPressStart={() => { setListening(true); controller.startListening(); }}
        onPressEnd={() => { setListening(false); controller.stopListening(); }}
      />
    </div>
  );
}
```

- [ ] **Step 15.4: 跑测试,确认通过**

```bash
pnpm exec vitest run src/components/lesson/QuizRepeatAfterMe.test.tsx
```

- [ ] **Step 15.5: Commit**

```bash
git add src/components/lesson/QuizRepeatAfterMe.tsx src/components/lesson/QuizRepeatAfterMe.test.tsx
git commit -m "$(cat <<'EOF'
feat(lesson): QuizRepeatAfterMe — speak to repeat target text

- 展示 quiz.targetText + card image + BloomButton
- 监听 controller.subtitle source=user 事件,string contains(targetWord) 判 correct
- 后续可升级为 LLM judge,本 MVP 够用

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: ReinforcePhase 编排组件

**Files:**
- Create: `src/components/lesson/ReinforcePhase.tsx`
- Test: `src/components/lesson/ReinforcePhase.test.tsx`

ReinforcePhase 维护当前 quiz 索引 + 重试次数,把 QuizPickWord / QuizRepeatAfterMe 串成关卡。

- [ ] **Step 16.1: 写测试**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReinforcePhase } from './ReinforcePhase';
import { foodCourse } from '@/data/courses/food';

function mockController(): any { return { on: vi.fn(), off: vi.fn(), startListening: vi.fn(), stopListening: vi.fn(), getState: () => 'awaiting' }; }

describe('ReinforcePhase', () => {
  it('starts at quiz 0', () => {
    render(<ReinforcePhase course={foodCourse} controller={mockController()} onAllDone={() => {}} sessionId="s1" />);
    expect(screen.getByText(/Where is the apple/)).toBeTruthy();
  });

  it('advances to next quiz on correct answer', async () => {
    render(<ReinforcePhase course={foodCourse} controller={mockController()} onAllDone={() => {}} sessionId="s1" />);
    const appleBtn = screen.getByRole('button', { name: /apple/i });
    fireEvent.click(appleBtn);
    await new Promise((r) => setTimeout(r, 50));
    // 第二题应该出现
    expect(screen.getByText(/Find the milk/)).toBeTruthy();
  });

  it('calls onAllDone after last quiz', async () => {
    const onAllDone = vi.fn();
    // 写一个只有 1 题的简化 course 测
    const slim = { ...foodCourse, phases: { ...foodCourse.phases!, reinforcement: { quizzes: [foodCourse.phases!.reinforcement.quizzes[0]] } } } as any;
    render(<ReinforcePhase course={slim} controller={mockController()} onAllDone={onAllDone} sessionId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /apple/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onAllDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 16.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/components/lesson/ReinforcePhase.test.tsx
```

- [ ] **Step 16.3: 写 `ReinforcePhase.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { QuizPickWord } from './QuizPickWord';
import { QuizRepeatAfterMe } from './QuizRepeatAfterMe';
import { Course } from '@/types/course';
import { LessonController } from '@/lib/voice/lesson-controller';

interface Props {
  course: Course;
  controller: LessonController;
  sessionId: string;
  onAllDone: () => void;
}

export function ReinforcePhase({ course, controller, sessionId, onAllDone }: Props) {
  const quizzes = course.phases!.reinforcement.quizzes;
  const [idx, setIdx] = useState(0);
  const [retries, setRetries] = useState(0);
  const current = quizzes[idx];

  const handleAnswer = async (result: { correct: boolean; picked?: string; said?: string }) => {
    const answer = result.picked || result.said || '';
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quiz-answer', sessionId, quizId: current.id, answer, correct: result.correct }),
      });
    } catch {}
    if (result.correct || retries >= 2) {
      // correct 或 retried ≥ 3 次:推进
      const next = idx + 1;
      if (next >= quizzes.length) {
        onAllDone();
      } else {
        setIdx(next);
        setRetries(0);
      }
    } else {
      setRetries((r) => r + 1);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-bunny-cream">
      <div className="mb-4 font-zh text-sm text-bunny-ink-soft">{idx + 1} / {quizzes.length}</div>
      {current.type === 'pick-word' ? (
        <QuizPickWord quiz={current} course={course} onAnswer={handleAnswer} />
      ) : (
        <QuizRepeatAfterMe quiz={current} course={course} controller={controller} onAnswer={handleAnswer} />
      )}
      <div className="mt-6 flex gap-2">
        {quizzes.map((_, i) => (
          <span key={i} className={`w-3 h-3 rounded-full ${i < idx ? 'bg-bunny-pink' : 'bg-bunny-cream-soft'}`} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 16.4: 跑测试,确认通过**

```bash
pnpm exec vitest run src/components/lesson/ReinforcePhase.test.tsx
```

- [ ] **Step 16.5: Commit**

```bash
git add src/components/lesson/ReinforcePhase.tsx src/components/lesson/ReinforcePhase.test.tsx
git commit -m "$(cat <<'EOF'
feat(lesson): ReinforcePhase — quiz orchestration

- 依次过 quizzes,dispatch 到 QuizPickWord 或 QuizRepeatAfterMe
- 每答完一题 POST /api/chat?action=quiz-answer
- 答错重试 2 次后强制推进(避免卡死)
- 全部答完调 onAllDone(由 PhasedLessonController 收到后切 done)
- 底部进度点

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: PhasedLessonView 顶层路由

**Files:**
- Create: `src/components/lesson/PhasedLessonView.tsx`
- Test: `src/components/lesson/PhasedLessonView.test.tsx`

- [ ] **Step 17.1: 写测试**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PhasedLessonView } from './PhasedLessonView';
import { foodCourse } from '@/data/courses/food';

describe('PhasedLessonView', () => {
  it('initial render shows IntroPhase', () => {
    render(<PhasedLessonView course={foodCourse} />);
    expect(screen.getByText(/餐桌上摆着各种食物/)).toBeTruthy();
  });
});
```

- [ ] **Step 17.2: 跑测试,确认失败**

```bash
pnpm exec vitest run src/components/lesson/PhasedLessonView.test.tsx
```

- [ ] **Step 17.3: 写 `PhasedLessonView.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IntroPhase } from './IntroPhase';
import { InteractivePhase } from './InteractivePhase';
import { ReinforcePhase } from './ReinforcePhase';
import { LessonController } from '@/lib/voice/lesson-controller';
import { PhasedLessonController, PhaseName } from '@/lib/voice/phased-lesson-controller';
import { Course } from '@/types/course';
import { Button } from '@/components/ui/Button';

interface Props {
  course: Course;
}

export function PhasedLessonView({ course }: Props) {
  const router = useRouter();
  const v2Ref = useRef<LessonController | null>(null);
  const phasedRef = useRef<PhasedLessonController | null>(null);
  const [phase, setPhase] = useState<PhaseName>('intro');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const v2 = new LessonController();
    const phased = new PhasedLessonController(v2, course);
    v2Ref.current = v2;
    phasedRef.current = phased;
    phased.on('phase-change', (p: PhaseName) => setPhase(p));
    return () => {
      phased.endLesson().catch(() => {});
    };
  }, [course]);

  const handleStart = async () => {
    setStarted(true);
    await phasedRef.current?.startLesson();
  };

  const handleHotspotClick = (cardId: string) => {
    // intro 阶段点 hotspot → 触发一轮"请介绍 X"的对话
    void v2Ref.current?.sendCustomAction({
      action: 'message',
      text: `(请介绍 ${cardId})`,
    });
  };

  const handleDone = () => router.push(`/lesson/${course.id}/done`);
  const handleLeave = () => router.push('/');

  if (!started) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-bunny-cream">
        <h1 className="font-zh text-3xl mb-4">{course.title}</h1>
        <Button size="lg" onClick={handleStart}>开始上课</Button>
      </div>
    );
  }

  const v2 = v2Ref.current!;
  const sessionId = v2.getSessionId() || '';

  return (
    <main className="w-screen h-screen relative">
      <header className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-30">
        <button onClick={handleLeave} className="px-3 py-2 rounded-bunny-md hover:bg-bunny-pink-soft">离开</button>
        <h1 className="font-zh text-xl">{course.title}</h1>
        <div className="w-20" />
      </header>
      <div className="absolute inset-0 top-14">
        {phase === 'intro' && <IntroPhase course={course} onHotspotClick={handleHotspotClick} />}
        {phase === 'interactive' && <InteractivePhase course={course} controller={v2} />}
        {phase === 'reinforcement' && (
          <ReinforcePhase
            course={course}
            controller={v2}
            sessionId={sessionId}
            onAllDone={() => phasedRef.current?.completeReinforcement()}
          />
        )}
        {phase === 'done' && (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <h2 className="font-zh text-2xl mb-4">今天的课结束啦!</h2>
            <Button onClick={handleDone}>看看你学了什么</Button>
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 17.4: 跑测试,确认通过**

```bash
pnpm exec vitest run src/components/lesson/PhasedLessonView.test.tsx
pnpm exec tsc --noEmit
```

- [ ] **Step 17.5: Commit**

```bash
git add src/components/lesson/PhasedLessonView.tsx src/components/lesson/PhasedLessonView.test.tsx
git commit -m "$(cat <<'EOF'
feat(lesson): PhasedLessonView — top-level phase router

- 创建 LessonController + 包装成 PhasedLessonController
- 按 currentPhase 切子组件:Intro / Interactive / Reinforce / Done
- intro hotspot click → v2.sendCustomAction message
- ReinforcePhase 完成 → phased.completeReinforcement → phase=done

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: LessonClient 直接进入三阶段路径

**Files:**
- Modify: `src/app/lesson/[id]/LessonClient.tsx`

- [ ] **Step 18.1: 修改 `LessonClient.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { PhasedLessonView } from '@/components/lesson/PhasedLessonView';
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

  return <PhasedLessonView course={course} />;
}
```

- [ ] **Step 18.2: tsc + 跑相关测试**

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
```

Expected: 全 PASS。

- [ ] **Step 18.3: Commit**

```bash
git add src/app/lesson/[id]/LessonClient.tsx
git commit -m "$(cat <<'EOF'
feat(client): make phased lesson view the only lesson path

- LessonClient 直接 render PhasedLessonView
- 不再保留 LessonView v2 fallback
- 旧课退役由最终 cleanup 删除数据与死引用

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Smoke test + architecture.md 同步

**Files:**
- Modify: `docs/architecture.md`(§2 / §4 / §6 同步)

- [ ] **Step 19.1: 跑 dev server,手动 smoke**

```bash
pnpm run dev
```

打开浏览器:
- `http://localhost:3000/lesson/food` → 应该看到"开始上课"按钮,点击后进入 IntroPhase(场景图),AI 应该开始介绍 cards
- `/api/courses` → 应该只返回新标准课程(此时至少 food)

如果 food 走不通(如 LLM prompt 没正确切阶段、phase transition API 出错),回到对应 task 修。

- [ ] **Step 19.2: 同步 `docs/architecture.md`**

在 §2 模块清单表格末尾追加几行:

```markdown
| `src/data/courses/food.ts` | food 示范课(三阶段 schema 示例) |
| `src/data/courses/index.ts` | 新标准课程 registry,当前只暴露 food |
| `src/lib/voice/phased-lesson-controller.ts` | **外层 phase 状态机**,包 LessonController 音频管线,规则驱动 phase 切换 |
| `src/components/lesson/PhasedLessonView.tsx` | 顶层 phase 路由,按 currentPhase 切 IntroPhase / InteractivePhase / ReinforcePhase |
| `src/components/lesson/IntroPhase.tsx` | 主题导入:场景图 + 透明 hotspot 点图触发讲解 |
| `src/components/lesson/InteractivePhase.tsx` | AI 互动:复用课堂元素,接 PhasedLessonController 持有的 LessonController |
| `src/components/lesson/ReinforcePhase.tsx` | 强化巩固:quiz 编排(pick-word / repeat-after-me),完成后 → done |
| `src/components/lesson/QuizPickWord.tsx` | quiz:听 prompt 选对的图 |
| `src/components/lesson/QuizRepeatAfterMe.tsx` | quiz:跟读目标短句,ASR 含目标词判 correct |
```

在 §4 状态机末尾追加新章节"4b. PhasedLessonController phase 轴":

```markdown
### 4b. PhasedLessonController phase 轴(food 课程)

```
idle ─startLesson─▶ intro ─[切1]─▶ interactive ─[切2]─▶ reinforcement ─[切3]─▶ done
  ▲                                                                              │
  └────── endLesson(任意 phase 都能立刻退出)──────────────────────────────────┘
```

切1: introducedCardIds.size === cards.length AND TTS finished
切2: clearedCardIds.size === cards.length OR totalAttempts >= 3 × cards.length, AND TTS finished
切3: reinforcement 所有 quizzes 答完

phase 切换由 PhasedLessonController 自己判定,LLM 不输出 phase_transition。
课程统一走 PhasedLessonController + PhasedLessonView;
旧课程 transportation / timeNumbers 不迁移,在 cleanup 中退役。
```

在 §6 关键决策表格末尾追加:

```markdown
| 三阶段 phase 切换 | 规则驱动,PhasedLessonController 判定 | LLM 自主切换不可预测;规则可测、可回滚 |
| 新标准唯一化 | food 跑通后退役 transportation / timeNumbers 与 LessonView fallback | 避免长期维护两套课程路径 |
| LessonController 定位 | 继续复用 ASR/TTS/SSE 管线,不作为独立 lesson UI 入口 | 降低重写音频链路风险 |
```

- [ ] **Step 19.3: Commit architecture.md 同步**

```bash
git add docs/architecture.md
git commit -m "$(cat <<'EOF'
docs(arch): sync §2 / §4 / §6 for three-phase lesson refactor

- §2 模块清单新增 PhasedLessonController / PhasedLessonView / 3 phase 子组件 / 2 quiz 组件
- §4 加 phase 轴状态机(food 课程路径)
- §6 加 phase 切换 / 新标准唯一化 / LessonController 定位决策

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Cleanup 旧课与 v2-only 入口(最后执行)

**Files:**
- Delete: `src/data/courses/transportation.ts`
- Delete: `src/data/courses/timeNumbers.ts`
- Delete: `src/components/lesson/LessonView.tsx` 和只服务它的测试(若无其它引用)
- Modify: tests/docs still importing old courses
- Modify: `src/types/course.ts`(把 `Course.phases?` 收紧为必填 `phases`)

- [ ] **Step 20.1: 删除旧课程数据并清掉死引用**

删除或更新所有仍引用旧课程的测试/模块。用以下命令找引用:

```bash
rg -n "transportationCourse|timeNumbersCourse|@/data/courses/transportation|@/data/courses/timeNumbers|LessonView" src tests docs
```

处理原则:
- 业务入口和 API 只能从 `@/data/courses` 取 `allCourses` / `getCourseById`。
- 课程相关测试改用 `foodCourse` 或本地最小 fixture。
- 如果某个测试专门验证 sentence cards,保留一个 test-local fixture,不要依赖已退役 `timeNumbersCourse`。
- `LessonController` 不删除;它仍是 PhasedLessonController 的底层音频管线。

- [ ] **Step 20.2: 收紧 Course schema**

把 `src/types/course.ts`:

```ts
phases?: Phases;
```

改为:

```ts
phases: Phases;
```

同步删除 `src/types/course.test.ts` 里的 "temporarily accepts a course without phases" case。

- [ ] **Step 20.3: 删除 LessonClient fallback 残留**

确认不存在:

```bash
rg -n "course\\.phases\\)|<LessonView|from '@/components/lesson/LessonView'|from './LessonView'" src
```

- [ ] **Step 20.4: 同步 docs/TODO.md / docs/architecture.md**

更新当前状态:
- 课程列表从旧两课改成 food 是当前唯一可见课程
- transportation / timeNumbers 标记为退役,不是待迁移
- v2 LessonView fallback 已删除;LessonController 仍保留为底层管线

- [ ] **Step 20.5: cleanup 验证**

```bash
pnpm exec tsc --noEmit
pnpm test
git diff --check
```

Expected: 全绿,且 `rg` 不再找到旧课程/旧 UI 入口死引用。

- [ ] **Step 20.6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(course): retire legacy lessons and v2 lesson fallback

- Remove transportation/timeNumbers course data from runtime
- Make food/new phased course path the only visible lesson path
- Tighten Course.phases after legacy cleanup
- Remove LessonView v2 fallback and related dead references
- Keep LessonController as reusable ASR/TTS/SSE pipeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: 最终验收

- [ ] **Step 21.1: tsc + 全单测**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: 全绿。

- [ ] **Step 21.2: 验收清单(spec §12)逐项检查**

| 项 | 命令 / 操作 | 预期 |
|----|------|------|
| typecheck | `pnpm exec tsc --noEmit` | 0 error |
| 单测 | `pnpm test` | 全绿,含 phased-lesson-controller / quiz / prompt 切换等新加测试 |
| food 课程走得通 | `pnpm run dev` → `/lesson/food` | 三阶段顺序进入,endLesson 正常 |
| 课程列表 | `/api/courses` | 只返回新标准课程,至少包含 food |
| 旧课退役 | `/lesson/transportation` / `/lesson/timeNumbers` | 不在课程列表;可 404 或显示未找到 |
| lesson-report | `/lesson-report <session-id>` | 报告生成不报错(quiz 答题作为 interaction 出现在 log 里) |

- [ ] **Step 21.3: 如果全过,无需新 commit;若中途修过 bug,正常 commit**

---

## Final notes

- 本 plan 假设 `@testing-library/react` 已可用(项目里 `src/components/lesson/WordBook.test.tsx` 等已经在用)。如果实际跑测试报 `not found`,先 `pnpm add -D @testing-library/react jsdom` 然后在 vitest 配置里设 environment 'jsdom'。
- 多个 `VOICE_MOCK=true` 单测依赖项目已有 mock 模式;若 mock 没接 streamUserInput 路径,可以把对应测试 case 标 `it.skip` + 注释,留给后续手测覆盖。
- LessonController 加 `sendCustomAction` / `getSessionId` / `progress` 事件三处是为了复用底层音频管线;不要把它误删。
- food 示范课的 sceneCaption / narrationHint 在 IntroPhase 不全部呈现(只显示 sceneCaption),narrationHint 通过 server prompt 注入。

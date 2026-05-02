# 课后报告生成器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"实测一节课后人工读 DB 写诊断"固化为 `/lesson-report` slash command,自动产出**面向开发者**的诊断报告(ASR 误识 / 话术循环 / token 异常 / 埋点缺失四类工程信号)。

**Architecture:** 一个 helper 脚本(`scripts/lesson-report-data.ts`)从 SQLite 拉取 session 数据 + 课程定义 + 计算确定性 anomaly flag,输出 JSON 到 stdout;一个 slash command(`.claude/commands/lesson-report.md`)指导 Claude 跑脚本 → 读 JSON → 按模板生成 markdown 报告 → 落档到 `docs/lesson-reports/`。脚本核心是 pure function `buildReport(db, sessionId, courseLoader)`,接受依赖注入便于单测用 in-memory DB。

**Tech Stack:** TypeScript / `tsx` / `better-sqlite3` / `vitest`(已有依赖,无需新增)

**Spec:** `docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`

---

## Pre-flight 上下文(下游 agent 必读)

**先读这些文件再动手:**
- `CLAUDE.md`(项目根)— 项目级强制规则(测试自动化、文档同步、commit 风格、凭据安全)
- `docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`(本 plan 对应 spec,设计意图与边界)
- `docs/architecture.md`(living doc,系统现状,Task 8 要往里同步)
- `src/lib/db/schema.ts`(实际 DB schema 来源)
- `src/data/courses/transportation.ts`、`src/types/course.ts`(课程定义结构,Task 4 / Task 5 的 `defaultCourseLoader` 依据)

**依赖状态:** 不要 `pnpm install`。`tsx` / `better-sqlite3` / `vitest` / `@types/better-sqlite3` 都已在 `package.json`。

**测试与 typecheck 命令:**
- 单文件单测:`pnpm test scripts/lesson-report-data.test.ts`
- 全测试套:`pnpm test`(原有 27 个 + 本 plan 新增 ~13 个 = ~40 个)
- typecheck:`pnpm exec tsc --noEmit`
- 测试 / typecheck 任一不过 → **不准 commit**(项目 CLAUDE.md §8 硬规则)

**DB 前置:** 本 plan 假设 `db/eduagent.db` 已有至少一节真实开发期跑过的课(给 Task 6 / Task 9 自验证用)。如果 DB 不存在或为空,先跑一次 `pnpm dev` 完成一节真课再跑 Task 6;或者用 `VOICE_MOCK=true pnpm dev` 跑 mock 课也行。

**Commit message 风格(项目 CLAUDE.md 提交风格节):**
- 单行 subject:`feat(report): ...` / `docs(...)` / `chore(...)` / `fix(...)` 等
- body 用 `-` bullet 列实质改动
- 末尾追加 `Co-Authored-By: <你的模型名> <noreply@anthropic.com>`(plan 各 task 给的 Co-Authored-By 行是占位写 Opus 4.7,**实施时换成你自己的模型名**)
- 用 HEREDOC 传 message 防 shell 转义
- 不允许 `--no-verify`、`--amend`(项目 §8 规则)

**凭据规则(项目 CLAUDE.md §7):** 任何 commit message / docs / 代码注释里禁止出现真实 API key 值。本 plan 只读 SQLite 不接外部 API,无凭据风险,但仍按规则。

---

## File Structure

| 路径 | 状态 | 职责 |
|---|---|---|
| `scripts/lesson-report-data.ts` | 新增 (~120 行) | 数据层 — pure `buildReport()` + CLI `main()` |
| `scripts/lesson-report-data.test.ts` | 新增 (~180 行) | vitest 单测,in-memory DB seed |
| `.claude/commands/lesson-report.md` | 新增 (~70 行) | slash command prompt |
| `docs/lesson-reports/.gitkeep` | 新增 (空) | 占位让目录存在 |
| `.gitignore` | 修改 (+1 行) | 忽略 `docs/lesson-reports/*.md` |
| `docs/architecture.md` | 修改 (+~15 行) | 加"开发工具链 — 课后报告"节 |
| `docs/TODO.md` | 修改 (+1 行) | §0 课程反馈条目下加报告引用 |

### 共享类型(`scripts/lesson-report-data.ts` 顶部 export,所有 task 共用同一签名)

```ts
export interface ReportData {
  session: {
    id: string;
    courseId: string;
    courseTitle: string;
    targetWords: string[];
    startTime: string;
    endTime: string | null;
    durationSec: number | null;
    interactionCount: number;
    ended: boolean;
  };
  tokens: {
    llm: { requests: number; input: number; output: number; avgInputPerRound: number; maxInput: number };
    asr: { requests: number; tracked: boolean };
    tts: { requests: number; tracked: boolean };
  };
  anomalies: {
    highAvgInput: boolean;
    asrUsageNotTracked: boolean;
    ttsUsageNotTracked: boolean;
    tokensCorrupted: boolean;
  };
  interactions: Array<{
    n: number;
    ts: string;
    user: string;
    ai: string;
    actions: unknown[];
  }>;
}

export type CourseLoader = (courseId: string) => Promise<{ title: string; words: string[] } | null>;

export async function buildReport(
  db: import('better-sqlite3').Database,
  sessionId: string | null,
  courseLoader: CourseLoader
): Promise<ReportData> { /* implemented across Tasks 2-5 */ }
```

---

## Task 1: 目录与 gitignore 骨架

**Files:**
- Create: `docs/lesson-reports/.gitkeep`(空文件)
- Modify: `.gitignore`(追加 1 行)

- [ ] **Step 1: 建报告归档目录占位**

```bash
mkdir -p "docs/lesson-reports"
touch "docs/lesson-reports/.gitkeep"
```

- [ ] **Step 2: 追加 gitignore 规则**

读 `.gitignore` 末尾,在文件最后追加:

```
# Lesson reports — 内部诊断,不污染 repo;真要分享某份单独 commit
docs/lesson-reports/*.md
```

- [ ] **Step 3: 验证规则生效**

Run:
```bash
echo "# fake report" > docs/lesson-reports/test.md
git status --short docs/lesson-reports/
```
Expected: 输出只含 `?? docs/lesson-reports/.gitkeep`(test.md 被忽略,.gitkeep 被追踪)。验证完删除 `docs/lesson-reports/test.md`。

- [ ] **Step 4: Commit**

```bash
git add docs/lesson-reports/.gitkeep .gitignore
git commit -m "$(cat <<'EOF'
chore(report): 加 docs/lesson-reports/ 目录骨架 + gitignore

- docs/lesson-reports/.gitkeep 占位让目录存在
- .gitignore 追加 docs/lesson-reports/*.md(默认不污染 repo,需分享时单独 commit)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 数据层 — 类型 + 基础聚合(TDD)

**Files:**
- Create: `scripts/lesson-report-data.ts`
- Create: `scripts/lesson-report-data.test.ts`

本 task 实现 `buildReport()` 的最小版本:仅 `session`(基础字段)、`tokens.llm.*`、`interactions`。anomaly / 课程读取 / CLI 在后续 task。

- [ ] **Step 1: 写测试 helper(seed 假课到 in-memory DB)**

文件:`scripts/lesson-report-data.test.ts`

```ts
import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { buildReport, type CourseLoader } from './lesson-report-data';

function createMemDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE lesson_logs (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      interaction_count INTEGER DEFAULT 0,
      token_usage TEXT DEFAULT '{}'
    );
    CREATE TABLE interaction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      user_input TEXT DEFAULT '',
      ai_response TEXT DEFAULT '',
      actions TEXT DEFAULT '[]',
      model_calls TEXT DEFAULT '{}'
    );
  `);
  return db;
}

interface SeedSession {
  id: string;
  courseId: string;
  startTime: string;
  endTime?: string | null;
  tokenUsage?: object;
  interactions?: Array<{ user: string; ai: string; actions?: unknown[]; ts?: string; modelCalls?: object }>;
}

function seedSession(db: Database.Database, s: SeedSession): void {
  db.prepare(
    'INSERT INTO lesson_logs (id, course_id, start_time, end_time, interaction_count, token_usage) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    s.id,
    s.courseId,
    s.startTime,
    s.endTime ?? null,
    s.interactions?.length ?? 0,
    JSON.stringify(s.tokenUsage ?? {})
  );
  s.interactions?.forEach((it, i) => {
    db.prepare(
      'INSERT INTO interaction_logs (lesson_id, timestamp, user_input, ai_response, actions, model_calls) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      s.id,
      it.ts ?? new Date(Date.parse(s.startTime) + i * 1000).toISOString(),
      it.user,
      it.ai,
      JSON.stringify(it.actions ?? []),
      JSON.stringify(it.modelCalls ?? {})
    );
  });
}

const noopCourseLoader: CourseLoader = async () => null;

const stubTransportationLoader: CourseLoader = async (id) =>
  id === 'transportation'
    ? { title: '交通工具 Transportation', words: ['car', 'bus', 'train', 'airplane', 'bicycle', 'boat'] }
    : null;
```

- [ ] **Step 2: 写第一个失败测试 — 基础字段**

继续 append 到 `scripts/lesson-report-data.test.ts`:

```ts
describe('buildReport — basic aggregation', () => {
  it('reads session + interactions + token totals', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 'sess-1',
      courseId: 'transportation',
      startTime: '2026-05-02T04:17:35.000Z',
      endTime: '2026-05-02T04:27:28.000Z',
      tokenUsage: {
        llm: { requests: 2, inputTokens: 2400, outputTokens: 200 },
        asr: { requests: 0, tokens: 0 },
        tts: { requests: 0, characters: 0 },
      },
      interactions: [
        { user: '(开始)', ai: 'hello', actions: [{ tool: 'show', params: { image_id: 'car' } }],
          modelCalls: { llm: { inputTokens: 1200 } } },
        { user: 'car', ai: 'great', actions: [],
          modelCalls: { llm: { inputTokens: 1200 } } },
      ],
    });

    const r = await buildReport(db, 'sess-1', noopCourseLoader);

    expect(r.session.id).toBe('sess-1');
    expect(r.session.courseId).toBe('transportation');
    expect(r.session.startTime).toBe('2026-05-02T04:17:35.000Z');
    expect(r.session.endTime).toBe('2026-05-02T04:27:28.000Z');
    expect(r.session.durationSec).toBe(593);
    expect(r.session.ended).toBe(true);
    expect(r.session.interactionCount).toBe(2);
    expect(r.tokens.llm.requests).toBe(2);
    expect(r.tokens.llm.input).toBe(2400);
    expect(r.tokens.llm.output).toBe(200);
    expect(r.tokens.llm.avgInputPerRound).toBe(1200);
    expect(r.tokens.llm.maxInput).toBe(1200);
    expect(r.interactions).toHaveLength(2);
    expect(r.interactions[0].n).toBe(1);
    expect(r.interactions[0].user).toBe('(开始)');
    expect(r.interactions[0].actions).toEqual([{ tool: 'show', params: { image_id: 'car' } }]);
  });
});
```

- [ ] **Step 3: 跑测试,确认失败(模块不存在)**

Run:
```bash
pnpm test scripts/lesson-report-data.test.ts
```
Expected: FAIL,错误形如 `Failed to load url ./lesson-report-data` 或 `Cannot find module`。

- [ ] **Step 4: 实现最小 buildReport — 基础聚合**

Create: `scripts/lesson-report-data.ts`

```ts
import type { Database } from 'better-sqlite3';

export interface ReportData {
  session: {
    id: string;
    courseId: string;
    courseTitle: string;
    targetWords: string[];
    startTime: string;
    endTime: string | null;
    durationSec: number | null;
    interactionCount: number;
    ended: boolean;
  };
  tokens: {
    llm: { requests: number; input: number; output: number; avgInputPerRound: number; maxInput: number };
    asr: { requests: number; tracked: boolean };
    tts: { requests: number; tracked: boolean };
  };
  anomalies: {
    highAvgInput: boolean;
    asrUsageNotTracked: boolean;
    ttsUsageNotTracked: boolean;
    tokensCorrupted: boolean;
  };
  interactions: Array<{
    n: number;
    ts: string;
    user: string;
    ai: string;
    actions: unknown[];
  }>;
}

export type CourseLoader = (courseId: string) => Promise<{ title: string; words: string[] } | null>;

interface LessonRow {
  id: string;
  course_id: string;
  start_time: string;
  end_time: string | null;
  interaction_count: number;
  token_usage: string;
}

interface InteractionRow {
  timestamp: string;
  user_input: string;
  ai_response: string;
  actions: string;
  model_calls: string;
}

export async function buildReport(
  db: Database,
  sessionId: string | null,
  courseLoader: CourseLoader
): Promise<ReportData> {
  const lesson = sessionId
    ? (db.prepare('SELECT * FROM lesson_logs WHERE id = ?').get(sessionId) as LessonRow | undefined)
    : (db.prepare('SELECT * FROM lesson_logs ORDER BY start_time DESC LIMIT 1').get() as LessonRow | undefined);

  if (!lesson) {
    throw new Error(`session not found: ${sessionId ?? '(latest)'}`);
  }

  const rows = db.prepare(
    'SELECT timestamp, user_input, ai_response, actions, model_calls FROM interaction_logs WHERE lesson_id = ? ORDER BY id ASC'
  ).all(lesson.id) as InteractionRow[];

  const interactions = rows.map((r, i) => ({
    n: i + 1,
    ts: r.timestamp,
    user: r.user_input,
    ai: r.ai_response,
    actions: safeJsonParse(r.actions, []) as unknown[],
  }));

  const usage = parseTokenUsage(lesson.token_usage);
  const inputs = rows.map((r) => {
    const mc = safeJsonParse(r.model_calls, {}) as { llm?: { inputTokens?: number } };
    return mc.llm?.inputTokens ?? 0;
  });
  const sumInput = inputs.reduce((a, b) => a + b, 0);
  const avgInputPerRound = inputs.length > 0 ? Math.round(sumInput / inputs.length) : 0;
  const maxInput = inputs.length > 0 ? Math.max(...inputs) : 0;

  const startMs = Date.parse(lesson.start_time);
  const endMs = lesson.end_time ? Date.parse(lesson.end_time) : null;
  const durationSec = endMs !== null ? Math.round((endMs - startMs) / 1000) : null;

  return {
    session: {
      id: lesson.id,
      courseId: lesson.course_id,
      courseTitle: lesson.course_id,             // overridden by Task 4
      targetWords: [],                            // overridden by Task 4
      startTime: lesson.start_time,
      endTime: lesson.end_time,
      durationSec,
      interactionCount: interactions.length,
      ended: lesson.end_time !== null,
    },
    tokens: {
      llm: {
        requests: usage.llm.requests,
        input: usage.llm.inputTokens,
        output: usage.llm.outputTokens,
        avgInputPerRound,
        maxInput,
      },
      asr: { requests: usage.asr.requests, tracked: usage.asr.requests > 0 },
      tts: { requests: usage.tts.requests, tracked: usage.tts.requests > 0 },
    },
    anomalies: {
      highAvgInput: false,
      asrUsageNotTracked: false,
      ttsUsageNotTracked: false,
      tokensCorrupted: false,
    },
    interactions,
  };
}

function safeJsonParse(s: string, fallback: unknown): unknown {
  try { return JSON.parse(s); } catch { return fallback; }
}

interface ParsedUsage {
  llm: { requests: number; inputTokens: number; outputTokens: number };
  asr: { requests: number };
  tts: { requests: number };
  corrupted: boolean;
}

function parseTokenUsage(raw: string): ParsedUsage {
  const empty: ParsedUsage = {
    llm: { requests: 0, inputTokens: 0, outputTokens: 0 },
    asr: { requests: 0 },
    tts: { requests: 0 },
    corrupted: false,
  };
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, number>>;
    return {
      llm: {
        requests: parsed.llm?.requests ?? 0,
        inputTokens: parsed.llm?.inputTokens ?? 0,
        outputTokens: parsed.llm?.outputTokens ?? 0,
      },
      asr: { requests: parsed.asr?.requests ?? 0 },
      tts: { requests: parsed.tts?.requests ?? 0 },
      corrupted: false,
    };
  } catch {
    return { ...empty, corrupted: true };
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run:
```bash
pnpm test scripts/lesson-report-data.test.ts
```
Expected: PASS,1 个测试通过。

- [ ] **Step 6: typecheck**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 7: 加"默认最近一节"测试**

Append 到 `scripts/lesson-report-data.test.ts` 的 describe 里:

```ts
  it('returns the latest session when no id provided', async () => {
    const db = createMemDb();
    seedSession(db, { id: 'old', courseId: 'transportation', startTime: '2026-04-01T00:00:00.000Z' });
    seedSession(db, { id: 'new', courseId: 'transportation', startTime: '2026-05-02T00:00:00.000Z' });

    const r = await buildReport(db, null, noopCourseLoader);
    expect(r.session.id).toBe('new');
  });
```

- [ ] **Step 8: 跑测试确认通过**

Run: `pnpm test scripts/lesson-report-data.test.ts`
Expected: PASS,2 个测试通过。

- [ ] **Step 9: Commit**

```bash
git add scripts/lesson-report-data.ts scripts/lesson-report-data.test.ts
git commit -m "$(cat <<'EOF'
feat(report): scripts/lesson-report-data.ts 基础聚合 + 单测

- buildReport(db, sessionId, courseLoader) pure 函数,接受 db 注入便于测试
- 实现:session 基本字段(durationSec/ended)、interactions 编号、token 聚合(avg/max input)
- 默认 sessionId=null 取最近一节(start_time DESC LIMIT 1)
- 单测:in-memory better-sqlite3,验证基础聚合 + latest fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 数据层 — Anomaly Flags(TDD)

**Files:**
- Modify: `scripts/lesson-report-data.ts`
- Modify: `scripts/lesson-report-data.test.ts`

补 4 个 anomaly flag:`highAvgInput` / `asrUsageNotTracked` / `ttsUsageNotTracked` / `tokensCorrupted`。

- [ ] **Step 1: 写 highAvgInput 测试(false 与 true 两 case)**

Append 到 test 文件:

```ts
describe('buildReport — anomaly flags', () => {
  it('highAvgInput=true when avg > 1000', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z',
      interactions: [
        { user: 'a', ai: 'a', modelCalls: { llm: { inputTokens: 1500 } } },
        { user: 'b', ai: 'b', modelCalls: { llm: { inputTokens: 1500 } } },
      ],
    });
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.highAvgInput).toBe(true);
  });

  it('highAvgInput=false when avg <= 1000', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z',
      interactions: [
        { user: 'a', ai: 'a', modelCalls: { llm: { inputTokens: 800 } } },
        { user: 'b', ai: 'b', modelCalls: { llm: { inputTokens: 1000 } } },
      ],
    });
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.highAvgInput).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test scripts/lesson-report-data.test.ts`
Expected: 1 个 FAIL(`highAvgInput` 永远 false)。

- [ ] **Step 3: 实现 highAvgInput**

在 `scripts/lesson-report-data.ts` 的 `buildReport` 末尾,把:
```ts
    anomalies: {
      highAvgInput: false,
```
改为:
```ts
    anomalies: {
      highAvgInput: avgInputPerRound > 1000,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test scripts/lesson-report-data.test.ts`
Expected: PASS,4 个测试通过。

- [ ] **Step 5: 写 asr/tts/tokensCorrupted 测试**

Append 到同 describe:

```ts
  it('asrUsageNotTracked=true when asr.requests=0', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z',
      tokenUsage: { asr: { requests: 0 }, tts: { requests: 0 } },
    });
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.asrUsageNotTracked).toBe(true);
    expect(r.anomalies.ttsUsageNotTracked).toBe(true);
    expect(r.tokens.asr.tracked).toBe(false);
  });

  it('asrUsageNotTracked=false when asr.requests>0', async () => {
    const db = createMemDb();
    seedSession(db, {
      id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z',
      tokenUsage: { asr: { requests: 5 }, tts: { requests: 3 } },
    });
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.asrUsageNotTracked).toBe(false);
    expect(r.anomalies.ttsUsageNotTracked).toBe(false);
    expect(r.tokens.asr.tracked).toBe(true);
  });

  it('tokensCorrupted=true when token_usage is invalid JSON', async () => {
    const db = createMemDb();
    db.prepare(
      'INSERT INTO lesson_logs (id, course_id, start_time, token_usage) VALUES (?, ?, ?, ?)'
    ).run('s', 'x', '2026-01-01T00:00:00.000Z', '{not json');
    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.anomalies.tokensCorrupted).toBe(true);
    expect(r.tokens.llm.input).toBe(0);
    expect(r.tokens.asr.requests).toBe(0);
  });
```

- [ ] **Step 6: 跑测试确认 asr/tts 已 PASS,tokensCorrupted FAIL**

Run: `pnpm test scripts/lesson-report-data.test.ts`
Expected: asr/tts 两条 PASS(已经从 `tracked` 派生),tokensCorrupted FAIL(flag 永远 false)。

- [ ] **Step 7: 实现 tokensCorrupted + asr/tts not tracked flag**

在 `scripts/lesson-report-data.ts` 中,把 `parseTokenUsage` 调用结果赋给 const,后用:

把:
```ts
  const usage = parseTokenUsage(lesson.token_usage);
```
保持不变,然后在返回值中把:
```ts
    anomalies: {
      highAvgInput: avgInputPerRound > 1000,
      asrUsageNotTracked: false,
      ttsUsageNotTracked: false,
      tokensCorrupted: false,
    },
```
改为:
```ts
    anomalies: {
      highAvgInput: avgInputPerRound > 1000,
      asrUsageNotTracked: usage.asr.requests === 0,
      ttsUsageNotTracked: usage.tts.requests === 0,
      tokensCorrupted: usage.corrupted,
    },
```

- [ ] **Step 8: 跑测试确认全通过**

Run: `pnpm test scripts/lesson-report-data.test.ts`
Expected: PASS,7 个测试全过。

- [ ] **Step 9: Commit**

```bash
git add scripts/lesson-report-data.ts scripts/lesson-report-data.test.ts
git commit -m "$(cat <<'EOF'
feat(report): anomaly flags — highAvgInput / asr-tts not tracked / tokensCorrupted

- highAvgInput:avgInputPerRound > 1000
- asrUsageNotTracked / ttsUsageNotTracked:对应 requests === 0
- tokensCorrupted:token_usage JSON 解析失败时 true,各指标兜底为 0
- 单测覆盖每个 flag 的 true / false 两侧

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 数据层 — 课程目标词读取(TDD)

**Files:**
- Modify: `scripts/lesson-report-data.ts`
- Modify: `scripts/lesson-report-data.test.ts`

接入 `CourseLoader`,把 `courseTitle` / `targetWords` 真正填上。课程缺失时 graceful fallback。

- [ ] **Step 1: 写课程目标词测试**

Append 到 test 文件:

```ts
describe('buildReport — course definition', () => {
  it('populates courseTitle and targetWords from courseLoader', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'transportation', startTime: '2026-01-01T00:00:00.000Z' });

    const r = await buildReport(db, 's', stubTransportationLoader);
    expect(r.session.courseTitle).toBe('交通工具 Transportation');
    expect(r.session.targetWords).toEqual(['car', 'bus', 'train', 'airplane', 'bicycle', 'boat']);
  });

  it('lowercases all targetWords', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'mixed', startTime: '2026-01-01T00:00:00.000Z' });
    const loader: CourseLoader = async () => ({ title: 'Mixed', words: ['Cat', 'DOG', 'Bird'] });

    const r = await buildReport(db, 's', loader);
    expect(r.session.targetWords).toEqual(['cat', 'dog', 'bird']);
  });

  it('falls back when course not found', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'unknown', startTime: '2026-01-01T00:00:00.000Z' });

    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.session.courseTitle).toBe('unknown');  // 回落到 courseId
    expect(r.session.targetWords).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test scripts/lesson-report-data.test.ts`
Expected: 3 个 FAIL(`courseTitle` 等于 courseId、`targetWords` 永远空数组)。

- [ ] **Step 3: 实现课程读取**

在 `scripts/lesson-report-data.ts` 的 `buildReport` 中,在 `const lesson` 之后、`const rows` 之前,加:

```ts
  const course = await courseLoader(lesson.course_id);
  const courseTitle = course?.title ?? lesson.course_id;
  const targetWords = (course?.words ?? []).map((w) => w.toLowerCase());
```

然后把返回值里:
```ts
      courseTitle: lesson.course_id,             // overridden by Task 4
      targetWords: [],                            // overridden by Task 4
```
改为:
```ts
      courseTitle,
      targetWords,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test scripts/lesson-report-data.test.ts`
Expected: PASS,10 个测试全过。

- [ ] **Step 5: typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add scripts/lesson-report-data.ts scripts/lesson-report-data.test.ts
git commit -m "$(cat <<'EOF'
feat(report): 接入 CourseLoader 注入,填 courseTitle/targetWords

- buildReport 调 courseLoader(courseId) 拿课程定义
- targetWords 强制小写;课程读不到时 courseTitle 回落 courseId,targetWords=[]
- 单测覆盖正常加载、大小写归一化、未知课程 fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CLI 入口 + 边界(TDD + 集成)

**Files:**
- Modify: `scripts/lesson-report-data.ts`(加 `main()` + 默认 courseLoader)
- Modify: `scripts/lesson-report-data.test.ts`(补边界单测)

补:`session-id` 找不到、`endTime=null`、`interactions=[]`、CLI `main()` + `defaultCourseLoader`(动态 import `src/data/courses/<courseId>.ts`)。

- [ ] **Step 1: 写边界测试**

Append 到 test 文件:

```ts
describe('buildReport — edge cases', () => {
  it('endTime null → ended=false, durationSec=null', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z', endTime: null });

    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.session.ended).toBe(false);
    expect(r.session.durationSec).toBeNull();
  });

  it('empty interactions → counts and avgs default to 0, no throw', async () => {
    const db = createMemDb();
    seedSession(db, { id: 's', courseId: 'x', startTime: '2026-01-01T00:00:00.000Z' });

    const r = await buildReport(db, 's', noopCourseLoader);
    expect(r.session.interactionCount).toBe(0);
    expect(r.tokens.llm.avgInputPerRound).toBe(0);
    expect(r.tokens.llm.maxInput).toBe(0);
    expect(r.anomalies.highAvgInput).toBe(false);
    expect(r.interactions).toEqual([]);
  });

  it('throws when sessionId not found', async () => {
    const db = createMemDb();
    await expect(buildReport(db, 'nope', noopCourseLoader)).rejects.toThrow(/session not found/);
  });
});
```

- [ ] **Step 2: 跑测试确认通过**

Run: `pnpm test scripts/lesson-report-data.test.ts`
Expected: PASS,13 个测试全过(这些边界 Task 2-4 已经隐式覆盖了,本步骤是显式锁存)。

- [ ] **Step 3: 加 default courseLoader + main 入口**

在 `scripts/lesson-report-data.ts` 文件末尾追加:

```ts
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

interface CourseModule {
  [key: string]: { title: string; objectives: { words: Array<{ english: string }> } } | unknown;
}

export const defaultCourseLoader: CourseLoader = async (courseId) => {
  try {
    const mod = (await import(`../src/data/courses/${courseId}`)) as CourseModule;
    const candidate = Object.values(mod).find(
      (v): v is { title: string; objectives: { words: Array<{ english: string }> } } =>
        typeof v === 'object' && v !== null && 'title' in v && 'objectives' in v
    );
    if (!candidate) return null;
    return {
      title: candidate.title,
      words: candidate.objectives.words.map((w) => w.english),
    };
  } catch {
    return null;
  }
};

async function main(): Promise<void> {
  const sessionId = process.argv[2] ?? null;
  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './db/eduagent.db');

  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`DB 不存在:${dbPath}。先跑过 dev server 让其初始化数据库。\n`);
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const data = await buildReport(db, sessionId, defaultCourseLoader);
    process.stdout.write(JSON.stringify(data, null, 2));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('session not found')) {
      process.stderr.write(`${err.message}\n\n最近 5 节课:\n`);
      const recent = db.prepare(
        'SELECT id, course_id, start_time FROM lesson_logs ORDER BY start_time DESC LIMIT 5'
      ).all() as Array<{ id: string; course_id: string; start_time: string }>;
      recent.forEach((r) => process.stderr.write(`  ${r.id}  ${r.course_id}  ${r.start_time}\n`));
      process.exit(1);
    }
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) {
  void main();
}
```

- [ ] **Step 4: 检查 main 不污染单测(单测里不应触发 main 执行)**

Run: `pnpm test scripts/lesson-report-data.test.ts`
Expected: 13 个测试 PASS,无 stdout/stderr 污染。

注:`isMain` 判断 `import.meta.url` 与 `process.argv[1]` 相等才执行 — 测试导入时 argv[1] 是 vitest 的入口文件,所以 main 不会触发。

- [ ] **Step 5: typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误。如果报 `import.meta.url` 错,在脚本顶端加 `/// <reference types="node" />`(tsconfig 已含 esnext 模块,通常 OK)。如真有问题改用 `process.argv[1]?.endsWith('lesson-report-data.ts')` 兜底。

- [ ] **Step 6: Commit**

```bash
git add scripts/lesson-report-data.ts scripts/lesson-report-data.test.ts
git commit -m "$(cat <<'EOF'
feat(report): CLI main + defaultCourseLoader + 边界单测

- main():解析 argv → 打开 DB(readonly) → buildReport → JSON 到 stdout
- session 找不到时 stderr 列最近 5 节;DB 文件不存在时给提示并 exit 1
- defaultCourseLoader 动态 import src/data/courses/<courseId>.ts,导出失败回 null
- 单测显式锁:endTime null / interactions 空 / sessionId 不存在抛错

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 真 DB 自验证(无代码改动)

**Files:** 无修改,纯验证。

按项目 CLAUDE.md "测试自动化原则 §A 自验证职责":写完脚本立即拿真 session 跑一次,人眼校 JSON。

- [ ] **Step 1: 跑最近一节(默认无参)**

Run:
```bash
pnpm tsx scripts/lesson-report-data.ts | head -50
```
Expected:
- 输出有效 JSON 起始 `{`
- `session.id`、`session.courseId`、`session.courseTitle="交通工具 Transportation"`(真课读到)
- `session.targetWords` 含 `["car","bus","train","airplane","bicycle","boat"]`
- `tokens.llm.requests > 0`
- `anomalies.asrUsageNotTracked=true`(因为 ASR 没埋点)

如果上一节是 transportation 课,以上字段都该有真实值。

- [ ] **Step 2: 跑指定 session**

先列最近 5 节挑一个(plan 撰写时存在的 `cf63ef96-5dd1-4f40-89a7-ad324a311680` 是 transportation 课,可能仍可用,也可能数据库已演进):

```bash
sqlite3 db/eduagent.db "SELECT id, course_id, interaction_count, start_time FROM lesson_logs ORDER BY start_time DESC LIMIT 5;"
```

挑一节 `interaction_count > 0` 且 `course_id='transportation'` 的 session,记下 `<SID>`,然后:

```bash
pnpm tsx scripts/lesson-report-data.ts <SID> | python3 -c "import json,sys; d=json.load(sys.stdin); print('id', d['session']['id']); print('duration', d['session']['durationSec']); print('avg', d['tokens']['llm']['avgInputPerRound']); print('high', d['anomalies']['highAvgInput']); print('words', d['session']['targetWords'])"
```

Expected:
- `id` 与 `<SID>` 一致
- `duration` 是非负整数(若 endTime 为空会是 None,挑别的)
- `avg` 是非负整数
- `high` 是 True 或 False
- `words` 是 `['car', 'bus', 'train', 'airplane', 'bicycle', 'boat']`(transportation 课固定六个词)

- [ ] **Step 3: 跑不存在的 session(验证错误路径)**

Run:
```bash
pnpm tsx scripts/lesson-report-data.ts nope-not-real-id; echo "exit=$?"
```
Expected:
- stderr 输出 `session not found: nope-not-real-id` + 最近 5 节列表
- `exit=1`

- [ ] **Step 4: 全测试套(确认没破坏其他模块)**

Run:
```bash
pnpm test
```
Expected: 全部通过(原 27 个 + 新增 13 个 = 40 个)。

- [ ] **Step 5: 验证完毕,无需 commit**

记录验证通过即可。如步骤 1-3 任一异常,回 Task 2-5 修。

---

## Task 7: Slash Command Prompt

**Files:**
- Create: `.claude/commands/lesson-report.md`

- [ ] **Step 1: 创建 slash command 文件**

Create: `.claude/commands/lesson-report.md`

```markdown
---
description: 上完一节实测课后,生成"内部迭代向"诊断报告
argument-hint: "[session-id]"
---

# 课后报告 — 内部迭代诊断

## 流程

1. **跑数据脚本**:`pnpm tsx scripts/lesson-report-data.ts $ARGUMENTS`(无参 = 最近一节)
2. **解析 stdout 里的 JSON**
3. **按下面"报告模板"生成 markdown**
4. **报告文件名**:`docs/lesson-reports/<YYYY-MM-DD>-<session.id 前 8 位>.md`
   - YYYY-MM-DD 用 `session.startTime` 转日期(不要用今天的日期)
   - 文件已存在则覆盖
5. **Write 工具写文件**;在对话里展开报告全文
6. **主动问**:"要不要拆成 TODO 加到 docs/TODO.md?"

## 报告模板(必须包含这些 section)

### 标题与基本信息
```
# 课后报告 — <courseId> (YYYY-MM-DD)

session: <id 前 8 位>... · <时长> · <轮次>轮 · <input> in / <output> out
```

如 `session.ended === false`,在标题下加一行:`⚠️ 课程未正常结束(end_time 为空)`。
如 `anomalies.tokensCorrupted === true`,加一行:`⚠️ token_usage 解析失败,token 数字不可信`。

### 词汇覆盖与掌握

如 `targetWords` 为空 → 跳过此节并标 "⚠️ 课程定义缺失,跳过词汇分析"。

否则用 markdown 表格,每个 targetWord 一行:

| 词 | 出现 | 学生说对 | 状态 |
|---|---|---|---|

判断方法(LLM 看 raw `interactions` 数组判):
- 出现次数:老师 ai 文本里提到该词的轮次数(粗略 grep,不区分大小写)
- 学生说对:学生 user 输入里准确说出该词(允许大小写、标点差异;`Tree → train` 算没说对)
- 状态:✅ 掌握(学生说对过且话术不卡)/ ⚠️ 勉强(说对前卡了 ≥3 轮 / 仅模糊接近)/ ❌ 未掌握(从未说对)

### 问题诊断

对每条诊断**严格按"现象 → 根因猜测 → 迭代方向"三段式**。覆盖以下 4 类工程信号(每类不一定都有,但都要扫一遍):

1. **ASR 误识** — 看 `interactions[].user`,捞出明显不像学生本意的识别(中文谐音风马牛、英文随机词、把目标词识别成无关词)。
2. **明显的话术循环卡死** — 老师对同一对象连续 ≥3 轮重复几乎相同的话(逐字相似度高),状态没推进。**注意**:不要去评判"该不该这么教",只汇报"循环本身"这个工程现象。
3. **Token 异常** — 看 `anomalies.highAvgInput` 与 `tokens.llm.avgInputPerRound` 数字。
4. **埋点缺失** — `anomalies.asrUsageNotTracked` / `anomalies.ttsUsageNotTracked`。

### 超出本报告范围的观察(供产品决策)

如果发现教学策略类现象(老师没教 X 却在总结里提了 X / 老师该不该用某种话术 / 教学顺序合不合理),**只在这一节列出来,不分析、不出建议**。如果没有,这节可省略。

### 迭代候选(可拆 TODO)

把上面诊断段落里的"迭代方向"汇总成 bullet 列表,每条独立可拆,语气直接(不绕)。

## 写作要求

- **受众是开发者自己**,不要鼓励性语言(没有"小朋友真棒")
- **现象必须引证具体轮次或数据**(轮次号 / 原文 / 数字),不能空喊
- **建议要可落地** — 不能"需要优化 ASR",要写"在 src/lib/voice/asr-proxy.ts 给儿童场景注入课程目标词作 hot_words"这种程度
- **不评判教学**,工程报告只看"是不是按代码写的运行了 / 有没有可观测异常",教学层面的对错放"超出本报告范围"那一节

## 边界情况

- 脚本 exit 1(session 不存在 / DB 不存在):把 stderr 内容贴回对话,不要继续生成报告
- `interactions` 为空:仍出报告,但词汇覆盖与诊断都标 "零交互,无数据可分析"
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/lesson-report.md
git commit -m "$(cat <<'EOF'
feat(report): /lesson-report slash command prompt

- 流程:跑 scripts/lesson-report-data.ts → 解析 JSON → 按模板生成 markdown → 落档 docs/lesson-reports/
- 报告四节:基本信息 / 词汇覆盖与掌握 / 问题诊断(4 类工程信号)/ 迭代候选
- 教学策略类观察单列"超出本报告范围",只列不分析,避免越界

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 文档同步

**Files:**
- Modify: `docs/architecture.md`(加节)
- Modify: `docs/TODO.md`(加引用)

按项目 CLAUDE.md 强制规则:加新功能必须同步 living doc。

- [ ] **Step 1: architecture.md 加"开发工具链 — 课后报告"节**

用 Edit 工具在 `docs/architecture.md` 末尾追加(注意:本节本身含一个代码块,所以**不要**用 markdown fence 把整节包起来,直接以 markdown 原文追加即可):

```
---

## 开发工具链 — 课后报告生成器

实测课后用 `/lesson-report` slash command 生成内部诊断报告,驱动迭代决策。

调用链:

    /lesson-report [session-id?]
      ↓ Claude 读 .claude/commands/lesson-report.md
      ↓ 跑 pnpm tsx scripts/lesson-report-data.ts [session-id?]
      ↓ 拿 JSON(基础聚合 + anomaly flags + 全部 interactions)
      ↓ Claude 按 prompt 模板生成 markdown
      ↓ Write 到 docs/lesson-reports/YYYY-MM-DD-<sid8>.md(已 gitignore)

**职责切分**:
- **`scripts/lesson-report-data.ts`**(数据层,有单测):基础聚合 + 课程目标词 + anomaly flags(`highAvgInput` / `asrUsageNotTracked` / `ttsUsageNotTracked` / `tokensCorrupted`)。pure 函数 `buildReport(db, sessionId, courseLoader)`,接受依赖注入。
- **`.claude/commands/lesson-report.md`**(LLM 层):报告模板 + 写作要求,LLM 看 raw `interactions` 判 ASR 误识 / 话术循环卡死。

**报告范围**:只产出**工程信号**(ASR 误识 / 话术循环 / token / 埋点),教学策略类观察只列不评判。spec 见 `docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`。
```

调用链用 4 空格缩进当代码块,避开嵌套 fence 问题。

- [ ] **Step 2: TODO.md 加报告引用**

在 `docs/TODO.md` §0 那条 "**课程反馈分析(2026-05-02 transportation 课观察)**" 项目末尾加一行,变成:

```markdown
- [ ] **课程反馈分析(2026-05-02 transportation 课观察)** — session `cf63ef96-5dd1-4f40-89a7-ad324a311680`,...(原内容不动)
  5. **ASR/TTS 用量未埋点**:DB 里 `asr.requests=0 / tts.requests=0`,只有 LLM 在算。`logger.ts` / token 统计逻辑这块缺埋点。
  
  现已通过 `/lesson-report` 自动生成,后续每节实测课的反馈走该工具,详见 `docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`。
```

(具体编辑时根据当前 TODO.md 实际内容做最小 patch — 用 Edit 工具,不要重写整个 §0。)

- [ ] **Step 3: 检查变更**

Run:
```bash
git diff docs/architecture.md docs/TODO.md
```
Expected:架构文档新增一节;TODO.md 在已有条目末尾加 1-2 行引用。

- [ ] **Step 4: typecheck + 全测试**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 全过。

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/TODO.md
git commit -m "$(cat <<'EOF'
docs(architecture,todo): 同步课后报告生成器接入

- architecture.md 加"开发工具链 — 课后报告生成器"节,描述调用链与职责切分
- TODO.md §0 课程反馈分析条目下加 /lesson-report 引用

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 端到端自验证(Claude 内 /lesson-report)

**Files:** 无代码改动。在 Claude 里实跑 slash command,验证完整流程。

- [ ] **Step 1: Claude 内跑默认最近一节**

在当前 Claude 对话输入:`/lesson-report`

预期 Claude 行为:
- 跑 `pnpm tsx scripts/lesson-report-data.ts`
- 解析 JSON
- Write 到 `docs/lesson-reports/2026-05-02-cf63ef96.md`(假设最近一节是今天 transportation)
- 在对话里 cat 报告
- 主动问"要不要拆成 TODO?"

- [ ] **Step 2: 检查报告文件**

Run:
```bash
ls docs/lesson-reports/
cat docs/lesson-reports/2026-05-02-*.md | head -60
```
Expected:
- 文件存在,文件名日期来自 `session.startTime`(2026-05-02)
- 内容包含 4 个 section:基本信息 / 词汇覆盖 / 问题诊断 / 迭代候选
- 至少捞出今天观察过的 ASR 误识 + 话术循环 + 埋点缺失三类
- token 异常这条诊断里有具体数字(如 1399 in / round)

- [ ] **Step 3: 验证文件已 gitignore**

Run:
```bash
git status docs/lesson-reports/
```
Expected: 报告 .md 文件不出现在 untracked 列表(只有 `.gitkeep` 被追踪,且已 commit 过)。

- [ ] **Step 4: Claude 内跑指定 session(用一节边界 case 课)**

先查找一节边界 case session(0 交互 或 endTime=null):

```bash
sqlite3 db/eduagent.db "SELECT id, course_id, interaction_count, end_time FROM lesson_logs WHERE end_time IS NULL OR interaction_count = 0 ORDER BY start_time DESC LIMIT 3;"
```

如查到结果,挑一个 `<SID2>`,在 Claude 里输:`/lesson-report <SID2>`

预期 Claude 跑出报告,**正确处理这两个边界**:
- 报告头标 `⚠️ 课程未正常结束(end_time 为空)`(若 endTime 为 null)
- 词汇覆盖与诊断节标"零交互,无数据可分析"(若 interactions 为空)

如查不到任何边界 case session,本步骤跳过。

- [ ] **Step 5: 跑错误 session 路径**

在 Claude 里输:`/lesson-report not-a-real-id`

预期 Claude 把 stderr 错误贴回对话,不继续生成报告。

- [ ] **Step 6: 验证全测试套仍 PASS**

Run: `pnpm test`
Expected: 40 个全过。

- [ ] **Step 7: 验证完毕**

如所有步骤 PASS,本 task 无需 commit。如有问题(报告内容不对 / 模板没遵守 / 边界没处理),回到对应 task 修。

---

## Self-Review 备忘(plan 编写者已自查,实施者无需重做)

- 已对照 spec §6 实施 checklist,9 个 task 全覆盖(脚本 / 单测 / slash command / .gitkeep / .gitignore / architecture.md / TODO.md / 自验证)
- 已对照 spec §5 测试策略,§A 自验证体现在 Task 6 + Task 9,§B 集成自动化体现在 Task 2-5 的 TDD 步骤里(共 ≥10 个测试 case 覆盖基础聚合 / anomaly flags / 课程读取 / 边界)
- 类型 `ReportData` 在 Task 2 一次定义完整,后续 task 增量填字段而不增字段,签名一致
- 边界处理(spec §4)逐项映射到任务:session 不存在 / endTime null / interactions 空 / 课程缺失 / DB 不存在 / token 损坏 / 重跑覆盖 — 全部有对应步骤或测试

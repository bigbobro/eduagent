# guard-pipeline-refactor (D)

> Parent: `05-24-codebase-cleanup-and-refactor`
> Depends on: `05-24-cleanup-quick-wins` 必须先完成（C 删 prompt 字段会让 pipeline 设计更干净）

## Goal

把 `src/lib/agent/session.ts` 的 `streamUserInput` 函数（当前 169 行）拆成 **GuardContext + GuardFn[] pipeline**。让后续加新 guard（过去 3 天加了 5 次：R1-R7 + R-A/B/C）变成"写一个 guard 函数 + push 到数组"，而不是去 169 行的巨函数里找空位插入。

**核心约束：行为不变 refactor。** 不引入新行为、不修复未发现的 bug、不改 smoke 测试预期。

## 范围

### 在新文件 `src/lib/agent/guards/` 下建立：

```
src/lib/agent/guards/
  ├── index.ts                       # GuardContext / GuardFn / runPipeline 类型与执行器
  ├── closing-guard.ts               # R4/R6 closing guard (unlearned-word override)
  ├── premature-closing-guard.ts     # R-B soft-closing override
  ├── normalize-actions.ts           # R-C normalize（从 memory.ts 搬出来还是保留？见下方决策）
  ├── speech-card-align.ts           # speech 跟 show_card 对齐（alignSpeechWithNormalizedCard）
  └── *.test.ts                      # 每个 guard 最小 1 case 单测
```

### GuardContext / GuardFn 类型定义

```ts
// src/lib/agent/guards/index.ts
import { Course } from '@/types/course';
import { LessonMemory } from '@/types/session';
import { AgentResponse, ToolAction } from '@/types/tools';

export interface GuardContext {
  speech: string;
  actions: ToolAction[];
  stateUpdate: AgentResponse['state_update'];
  memory: LessonMemory;
  course: Course;
  asrText?: string;
  currentPhase: PhaseName;
}

export type GuardFn = (ctx: GuardContext) => GuardContext;

export function runPipeline(ctx: GuardContext, guards: GuardFn[]): GuardContext {
  return guards.reduce((acc, guard) => {
    try {
      return guard(acc);
    } catch (err) {
      console.error('[guard]', guard.name, 'failed:', err);
      return acc;  // 跳过失败 guard，pipeline 继续（diverge 已锁定该行为）
    }
  }, ctx);
}
```

### `streamUserInput` 改造后骨架（≤ 80 行）

```ts
export async function* streamUserInput(...) {
  // 1. session 查找 + addUserMessage（保持原样，~10 行）
  // 2. LLM 流式消费 + speechExtractor（保持原样，~20 行）
  // 3. extractor.finalize() + sanitize（保持原样，~5 行）
  // 4. ★ 走 pipeline ★
  let ctx = { speech, actions, stateUpdate, memory, course, asrText, currentPhase };
  ctx = runPipeline(ctx, [
    closingGuard,           // R4/R6
    prematureClosingGuard,  // R-B
    normalizeActions,       // R-C（如果保留在 memory.ts，pipeline 调 wrapper）
    speechCardAlign,        // speech/show_card 对齐
  ]);
  // 5. yield speech-delta / speech-end / actions（保持原样，~5 行）
  // 6. commit memory + token + insertInteraction（保持原样，~20 行）
  // 7. yield progress_snapshot + done（保持原样，~10 行）
}
```

目标：函数体 ≤ 80 行（当前 169 行）。

### `normalizeAssistantActions` 处理决策

`normalizeAssistantActions` 现在在 `memory.ts:198-267`，输入是 `(memory, course, response, rawAsrText)`，输出是 `ToolAction[]`。两个选项：

**选项 A（推荐）**：把 normalize 包成 GuardFn 留在 memory.ts，pipeline 调 wrapper
```ts
// 在 guards/normalize-actions.ts：
import { normalizeAssistantActions } from '../memory';
export const normalizeActions: GuardFn = (ctx) => ({
  ...ctx,
  actions: normalizeAssistantActions(ctx.memory, ctx.course, {
    speech: ctx.speech,
    actions: ctx.actions,
    state_update: ctx.stateUpdate,
  }, ctx.asrText),
});
```
**优点**：normalize 内部 `applyAttemptAssessment` 跟 memory 状态强耦合，留在 memory.ts 更合理。Wrapper 薄。
**缺点**：guards/ 目录不"自包含"。

**选项 B**：搬整个 normalize 到 guards/normalize-actions.ts
**优点**：guards/ 目录自包含
**缺点**：要把 applyAttemptAssessment 也搬过来或 export 出去，改动面大。

→ **决策：选项 A**。理由：D 是行为不变 refactor，搬 normalize 风险高。等下次真的要解耦 memory state 时再做。

### 移动 / 删除的代码

- `session.ts:145-167` R4/R6 closing guard 逻辑 → `guards/closing-guard.ts`
- `session.ts:169-195` R-B premature-closing guard → `guards/premature-closing-guard.ts`
- `session.ts:266-291` `alignSpeechWithNormalizedCard` + `getLastWordShowCardId` + `speechMentionsCard` + `buildCardPrompt` + `escapeRegExp` → `guards/speech-card-align.ts`
- `session.ts:197-201` 调 `normalizeAssistantActions` → pipeline `normalizeActions` wrapper

## 单测要求

每个 guard 至少 1 case 单测（不追求 100% 覆盖）：

| Guard | 测试 case |
|---|---|
| `closingGuard` | LLM speech 列举了未学词时，speech 被替换成兜底模板 |
| `prematureClosingGuard` | LLM 在 interactive phase 且有 untouched cards 时说"下次再来"，speech 被替换、actions 强推下一张 untouched 词卡 |
| `normalizeActions` | 已在 `memory.test.ts` 有大量测试覆盖，新增 wrapper 不重复，只加 1 case 验证 wrapper shape 正确 |
| `speechCardAlign` | speech 提到了非 forceCardId 的卡，被替换成 forceCardId 的 buildCardPrompt |
| `runPipeline` | guard 抛错时 ctx 不变继续走下一个，且 console.error 被触发 |

参考现有 test 风格：`src/lib/agent/closing-guard.test.ts` 是 R4/R6 的旧测，**应该改成走新 guards 模块**而不是 import session 内联逻辑。

## 风险与回滚

- **风险 1（最高）**：guard 顺序变化导致 smoke 行为变化。**缓解**：严格按 `streamUserInput` 现有顺序，逐项搬过去，**先全部搬完再跑 smoke**。如果 smoke 出现差异，回退到搬动前最后一个绿 commit
- **风险 2**：try/catch 包住 guard 后，原本本应抛 SSE error 的 case 被吞。**缓解**：所有 guard 当前都不抛错（都是 if/then/replace 逻辑），所以理论上 try/catch 是为未来防御。**验证**：单测要求 guard 抛错时 ctx 不变，但同时要 console.error
- **风险 3**：`alignSpeechWithNormalizedCard` 依赖 `session.memory.currentCardId`，搬出 session.ts 后要确保 memory 在 pipeline 中是 read-only（不被前面的 guard 改动 memory.currentCardId）。**实际**：当前 pipeline 各步都不动 memory（memory 修改是 pipeline 之后 commitAssistantStreamResult），安全。但 PRD 要明确写 "GuardContext.memory 是 read-only 视图"
- **风险 4**：normalize 在 R-C 模式下会修改 `actions`（强推 forceCardId），但不动 `speech`；speech-card-align 看 actions 决定 speech 是否替换。**顺序敏感**：normalize 必须在 speech-card-align 之前。PRD 已锁定顺序

- **回滚**：单 PR，纯重构 0 行为变化。`git revert` 即可。如果 smoke 失败，先 revert 再调试

## 验收清单

- [ ] `pnpm test` 全绿（含每个 guard 的新单测）
- [ ] `pnpm exec tsc --noEmit` 0 error
- [ ] `pnpm smoke:lesson` 通过（CLAUDE.md 强制规则）
- [ ] `streamUserInput` 函数行数 < 80 行
- [ ] `src/lib/agent/guards/` 目录建立，4 个 guard 文件 + index.ts + 4 个 *.test.ts
- [ ] `src/lib/agent/closing-guard.test.ts` 迁移到新模块（删旧 import session 内联逻辑的版本）
- [ ] grep 全仓：session.ts 不再含 closing guard / premature-closing guard / speech-align 的 inline 实现
- [ ] **行为对照**：跑同一份 animals 课的 smoke 输入，重构前后 console 输出（特别是 `[normalize] snapshot` 那行）应一致
- [ ] guard 数组顺序在 index.ts 用注释明确："顺序敏感，不要随意调换"

## 文档同步（CLAUDE.md 强制规则）

- `docs/architecture.md` 新增 §[Agent Guard Pipeline]：列出 4 个 guard 职责、GuardContext shape、为什么这么拆（链接到本 PRD）
- `docs/architecture.md` §[session.ts 职责] 更新：现在只剩 LLM 流消费 + memory commit + token accounting + SSE yield
- `docs/TODO.md` 不动（这次工作不是来自 TODO，是 review 出来的）

## Definition of Done

- 验收清单全 ✅
- commit message：`refactor(agent): extract guard pipeline from streamUserInput`
- PR body 含"行为不变验证"段落（如何确认 smoke 输出无差异）

## Out of Scope

- **不修任何 guard 的实际逻辑 bug**（哪怕重构过程发现可疑代码，挂 TODO 不动）
- **不引入新的 guard**（review 之外的 idea 全部排除）
- 不动 normalize 内部逻辑、不动 applyAttemptAssessment
- 不动 LessonController / PhasedLessonController
- 不改 SSE 事件 schema

## Technical Notes

- guard 演进史（grill-me 挖到）：R1-R4 (5a4d120) → R5/R6/R7 (bbcd83d) → R-A (739490c) → R-B (4ad4708) → R-C (9bbcc77)
- 当前 streamUserInput 解剖：见上一轮 review 输出 + 父 PRD
- 决策记录：normalize 留 memory.ts（选项 A）、guard 失败跳过继续（diverge）、GuardContext.memory 是 read-only
- 不依赖 cleanup-quick-wins 的 A 段（删 logger / silentTurns 等），但依赖 C 段（删 prompt 字段，让 stateUpdate shape 已收窄到 current_word + attempt_assessment）

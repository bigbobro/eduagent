# Fix: Teacher Agent state sync — show_card 错位 + wrap-up loop + mastered 信号

## Goal

修复 2026-05-22 实测课暴露的 Teacher Agent 3 类状态同步问题:让 LLM 输出的 `show_card` / `speech` / `attempt_assessment` 与 LessonController 的真实卡片状态严格一致,消除"卡片切回 cat / 老师说下次再来 / 命中后仍循环"。

参考报告:[`docs/lesson-reports/2026-05-22-427f287b.md`](../../../docs/lesson-reports/2026-05-22-427f287b.md)

**不在本 task:** systemPrompt token 优化(#4)拆到下一个 task,需要独立 benchmark。

## What I already know

### 报告里的 3 个工程现象(都有轮次级证据)

1. **show_card 错位** — n=16/22/26/28/39/41/43 共 7 次:学生说对当前词后,同一轮 LLM 把 `show_card.card_id` 切回 `cat`
2. **"下次再来玩吧"循环** — 70 轮中 ~40 轮触发,从 n=3 起就出现
3. **turtle 命中后还循环 5 轮** — n=30-35,学生连说 6 次 turtle,LLM 不推进

### 关键代码事实

- **session.ts:154-180** R4 closing guard:LLM speech 命中任一 `targetWord ∉ wordsLearned` 就整句替换。但**正在教的词必然 unlearned**,所以教 cat 时说"cat"就触发。
- **session.ts:231** `interactionLog.actions = normalizedActions` — lesson-report 看到的 show_card 是 normalize 后结果,所以 cat 真的过了过滤。
- **memory.ts:305-319** `canShowCard` 当前对 word card 是"只要不是 cleared 就放行"(`untouched | attempted | needs_review` 都通过),所以"卡 'attempted' 12 轮的 cat"可以被无限切回。
- **memory.ts:171-197** `normalizeAssistantActions` 已有 reject + 回灌 `activeWordCardId` 的 fallback,但没考虑"correct 后未切卡 → 应主动推进"。
- **prompt.ts:148-174** 已注入 `当前应练习的 word card / wordOrder / clearedWordIds`,但没说"show_card.card_id 必须 ∈ {current, next}"。
- **prompt.ts:204-209** R4 总结约束"绝不能说出未通过的目标词"与教学逻辑直接冲突,需要排除 currentWord。

## Requirements

### R1 — show_card 严格白名单 (方案 X)

`canShowCard` 收紧:word card 必须 ∈ `{currentCard, nextCard}`,其中 `nextCard = newCardIds.find(id => cardProgress[id] !== 'cleared' && id !== currentCard)`。
- 既不是 current 也不是 next 的 word card show_card → reject
- reject 后 fallback push `currentCard`(不是 activeWordCardId,因为 active 算法已经把 cleared 的 current 当成 next 计算了,直接 push current 防 case 错位)
- sentence card 保持原有"必须挂在 currentCard 下"逻辑

### R2 — R4 closing guard 加 currentWord 白名单 (方案 A)

`session.ts:154-180` 的 `unlearnedMentioned` 过滤把 `memory.currentWord` 加入白名单:
```ts
const unlearnedMentioned = targetWords.filter((w) => {
  if (wordsLearned.includes(w)) return false;
  if (w === session.memory.currentWord) return false;  // 新增:正在教的词不算 unlearned
  // ... 原逻辑
});
```
- 保留 R4 原意(防 LLM 在 closing 阶段枚举全部 12 词)
- prompt.ts:209 的 R4 总结约束同步改成"绝不能说出未通过且不是当前正在教的目标词"

### R3 — mastered 后服务端硬推 nextCard (方案 Q)

`normalizeAssistantActions` 增强:
- 输入:`memory`, `course`, `response`, `rawAsrText`
- 计算 `assessedMemory` 后:如果 `assessment.result === 'correct' && assessment.card_id === memory.currentCardId`(即当前卡刚通过)且 LLM 输出的 `actions` 不包含 `show_card` 到任何非 cleared 卡 → 自动 push `show_card: nextCard`
- 这与 R1 的 fallback 共用 `nextCard` 计算,确保 LLM speech 即使还在鼓励当前词,卡片也切了

## Acceptance Criteria

- [ ] **AC1**(R1 单测):`canShowCard('cat', memory_with_cleared_cat, course, ...)` → false;`canShowCard('cat', memory_with_attempted_cat_but_current_is_dog, ...)` → false
- [ ] **AC2**(R1 单测):`normalizeAssistantActions` 在 LLM 输出 `show_card: cat`(cat 已 cleared,currentCard=dog)时,output actions = `[show_card: dog]`(或 nextCard)
- [ ] **AC3**(R2 单测):closing guard 在 `speech="我们一起说 cat"` 且 `currentWord='cat'` 且 `cat ∉ wordsLearned` 时,**不**替换 speech
- [ ] **AC4**(R2 单测):closing guard 在 `speech="还有 elephant 等着我们"` 且 `currentWord='cat'` 且 `elephant ∉ wordsLearned` 时,**仍**替换 speech(防 R4 原意回归)
- [ ] **AC5**(R3 单测):`normalizeAssistantActions` 在 LLM 输出 `assessment.result=correct, card_id=currentCard, actions=[]` 时,output 包含 `show_card: nextCard`
- [ ] **AC6**(R3 单测):若 LLM 已 emit `show_card: nextCard`,服务端不重复 push
- [ ] **AC7**(mini scenario 1)"学生连说 turtle 2 次 correct + LLM 没切卡":mock streamLLM 第 1 轮返回 `{assessment:correct, actions:[]}`,断言 normalize 后含 `show_card: lion`(turtle 在 animals 的下一张)
- [ ] **AC8**(mini scenario 2)"cat 已 cleared,LLM 又 show_card cat":断言 output 不含 cat,含 dog
- [ ] **AC9**(mini scenario 3)"教 cat 时 LLM speech 含 cat":断言 speech 原样保留,不被 wrap-up 替换
- [ ] **AC10**(mini scenario 4)"closing 阶段 LLM speech 同时含 cat(unlearned)和 elephant(也 unlearned)":断言 speech 被替换为 wrap-up
- [ ] typecheck (pnpm exec tsc --noEmit) + pnpm test 全绿

## Definition of Done

- 单测全绿 + typecheck 干净
- `docs/architecture.md`:§6 关键设计决策表追加 R5(show_card 白名单)/ R6(closing guard 修正)/ R7(mastered 硬推)
- 旧 R4 closing guard 描述同步更新(说明 currentWord 白名单)
- 提交 commit 后,跑一节 animals 课生成 lesson-report,人工核对 #1/#2/#3 现象消失(不作为 AC,作为发版前 sanity check)

## Out of Scope

- **#4 systemPrompt token 优化** — 拆到下一个 task(独立 benchmark)
- ASR hot_words 注入 — `feat-asr-course-hot-words-injection` task
- quiz/句子跟读阶段静态 TTS — `feat-quiz-phase-tts-guidance` task
- TTS underscore sanitize — 已 inline 修(本次 commit 之前)
- history 截断到 4-6 轮(当前 MAX_HISTORY=12 不动)
- 学生主动请求复习已 cleared 词的 show_card — 不支持,prompt 不写

## Technical Approach

### 修改文件 (按改动顺序)

1. **`src/lib/agent/memory.ts`**
   - `canShowCard`:word card 分支收紧到 `cardId ∈ {currentCard, nextCard}`,nextCard 通过新 helper `getNextWordCardId(memory, course)` 计算
   - `normalizeAssistantActions`:增加 mastered 硬推分支 — 检测 `assessment.result === 'correct'` 且没 emit show_card 到 nextCard 时,append push
   - 新增 export `getNextWordCardId(memory, course): string`(给单测和 session.ts guard 共用)

2. **`src/lib/agent/session.ts`**
   - R4 closing guard 的 `unlearnedMentioned` 过滤加 `if (w === session.memory.currentWord) return false`
   - 增加结构化诊断日志:`console.warn('[normalize]', { rejectedCard, currentCard, nextCard, reason })` — 便于下次实测复盘

3. **`src/lib/agent/prompt.ts`**
   - R4 总结约束(行 209)改成 "绝不能说出未通过且不是当前正在教的目标词"
   - 当前目标控制段(行 168-174)增加 "show_card.card_id 必须 ∈ {当前应练习的 word card, 下一张未通过 word card};服务端会拒绝其他切卡"

4. **`src/lib/agent/memory.test.ts`**
   - AC1, AC2, AC5, AC6 + nextCard helper 单测

5. **`src/lib/agent/session.test.ts`**(若不存在则新建,优先在现有 test 文件追加)
   - AC3, AC4 + mini scenarios AC7-AC10

6. **`docs/architecture.md`**
   - §6 表格追加 R5/R6/R7,旧 R4 行同步

### 计算 nextCard 的细节

```ts
export function getNextWordCardId(memory: LessonMemory, course: Course): string {
  const wordCardIds = new Set(
    course.cards.filter((c) => c.kind === 'word').map((c) => c.id)
  );
  const currentId = memory.currentCardId;
  // 在 newCardIds 顺序里找第一个既不是 current 也未 cleared 的 word card
  return course.teachingHints.newCardIds.find(
    (id) => wordCardIds.has(id)
      && id !== currentId
      && memory.cardProgress[id] !== 'cleared'
  ) || '';
}
```

## Decision (ADR-lite)

**Context:** 2026-05-22 实测课 70 轮里出现 7 次 show_card 切回 cat、40+ 轮 wrap-up 误触发、turtle 命中后循环 5 轮。已有的 R4 closing guard 与 normalize 防御不够。

**Decision:**
1. R1 把 canShowCard 收紧到 {currentCard, nextCard} 双白名单(原"非 cleared 即放行"过宽)
2. R2 closing guard 把 currentWord 加入 unlearned 白名单(保留 R4 防"枚举未教词"原意)
3. R3 normalize 在 correct 后未切卡时服务端硬推 nextCard(prompt 硬规则不可信赖)
4. 测试:5-10 个边界单测 + 4 个 mini scenarios 对应 AC3-AC10
5. **不**做 token 优化、**不**做 fixture 70 轮重放

**Consequences:**
- 失去"学生说'再说 cat'时 LLM 自由 show_card 回 cleared 卡"的能力(用户场景,目前 prompt 也没承诺)
- 失去 LLM 自主决定"再 drill 一次"的节奏控制(R3 强制推进)
- 同轮可能出现"卡片已切但 speech 仍鼓励当前词"的体验小别扭 — 接受
- 后续若 prompt 大改,mini scenarios 单测保留意义,而非死 fixture

## Technical Notes

### 涉及文件路径
- `src/lib/agent/session.ts` — R4 closing guard, normalize 调用点, SSE yield
- `src/lib/agent/memory.ts` — canShowCard, normalizeAssistantActions, applyAttemptAssessment
- `src/lib/agent/memory.test.ts` — 现有单测,扩展
- `src/lib/agent/prompt.ts` — buildMemoryContext, R4 总结约束
- `src/types/course.ts` — Course / WordCard 类型(只读)
- `src/types/session.ts` — LessonMemory 类型(只读)
- `src/types/tools.ts` — ToolAction / AgentResponse 类型(只读)

### 历史 spec / 报告
- `docs/lesson-reports/2026-05-22-427f287b.md` — 本次问题报告
- `docs/lesson-reports/2026-05-22-bd78d967.md` — 当天早一节,引入 R4 closing guard 的源头
- `.trellis/tasks/archive/2026-05-22-teacher-agent-ux-fixes-from-05-22-real-test/` — R1-R4 修复来源
- `docs/architecture.md` — §6 关键设计决策表(R1-R4 在此)

### 项目规则约束
- CLAUDE.md:"测试自动化原则强制" — 单测 + mini scenarios 满足
- CLAUDE.md:"文档同步是 commit 的一部分" — DoD 含 architecture.md 同步

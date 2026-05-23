# cleanup-quick-wins (A+B+C)

> Parent: `05-24-codebase-cleanup-and-refactor`

## Goal

把 review 发现的低风险、零设计死代码、过期 mock、被废弃的 LLM prompt 字段一次性清掉，让代码库减肥 + 降 LLM output tokens。**纯机械活，不涉及行为变化（除 C 让 LLM 少输出 4 个字段，服务端原本就不读）。**

## 范围（详细清单）

### A. 删死代码（6 项）

| 文件 | 行号/对象 | 动作 | 验证 |
|---|---|---|---|
| `src/lib/logger.ts` | 整文件 | **删整个文件** | grep `from.*lib/logger` 全仓 0 命中 |
| `src/lib/mimo/llm.ts:18-57` | `callLLM` 非流式函数 | **删函数 + 函数上面那行注释** | grep `\bcallLLM\b` 全仓只剩 0 处或仅在 mimo/llm.ts 自身（已删后 0） |
| `src/lib/agent/memory.ts:148-153` | `incrementSilentTurns` 函数 | **删** | grep `incrementSilentTurns` 全仓 0 命中 |
| `src/lib/agent/memory.ts:21,64` `src/types/session.ts:42` | `silentTurns` 字段 | **从 `LessonMemory` interface + `createMemory()` + `addUserMessage` 返回对象中删字段** | tsc 通过 |
| `src/lib/agent/prompt.ts:201-205` | `if (memory.silentTurns > 2) { ... }` 死分支 | **整块删掉**（"注意力警告"那段） | grep `silentTurns` 全仓 0 命中（除可能的 docs/spec 历史引用，那些是 OK 的） |
| `src/types/tools.ts:12-15` | `GenerateState` interface | **删** | grep `GenerateState` 全仓 0 命中 |
| `src/types/tools.ts:32` | `state_update.generated_content?: GenerateState` | **删字段** | tsc 通过；C 部分会同步删 prompt schema 引用 |
| `src/lib/agent/memory.ts:69-98` | `addAssistantMessage` 函数 | **内联进 `commitAssistantStreamResult`（同文件 line 163-172）** | grep `addAssistantMessage` 全仓 0 命中 |
| `src/lib/agent/memory.ts:174-184` | `getNextWordCardId` 函数 | **删函数**（normalize 已内联 `findFirstUncleared`） | grep `getNextWordCardId` 全仓除 test 外 0 命中；删 test 里对应 describe 块（`src/lib/agent/memory.test.ts:412-460`） |

**A 段不动**：
- normalize 内部的 `findFirstUncleared` helper（已在用）
- markWordCorrect / markWordIncorrect（虽然只被 test + applyAttemptAssessment 内部用，但 applyAttemptAssessment 的 updateWordPerformance 包了一层调用 → 不算死代码）

### B. 修 mockStreamLLM 的过期 ToolAction shape

**位置**：`src/lib/mimo/llm.ts:158-176` `mockStreamLLM()` 函数

**现状（已坏）**：
```ts
const fixed = JSON.stringify({
  speech: 'Hello! ...',
  actions: [{ tool: 'show', params: { image_id: 'boat' } }],  // ❌ 不是合法 ToolAction
  state_update: { current_word: 'boat', phase: 'learning' },
});
```

**修后**：选 animals 课的真实词卡（cat 是最简单的）：
```ts
const fixed = JSON.stringify({
  speech: '你好!我是兔老师。Look at this. 这是 a cat,小猫!你跟我说一遍,cat。',
  actions: [{ tool: 'show_card', params: { card_id: 'cat' } }],
  state_update: { current_word: 'cat' },  // C 之后只保留 current_word
});
```

**验证**：
- `VOICE_MOCK=true pnpm test` 通过（特别是 `src/app/api/chat/phase-transition.test.ts`、`quiz-answer.test.ts`、`src/lib/agent/progress-snapshot.test.ts`）
- 手动 `VOICE_MOCK=true pnpm dev` + 启动 animals 课，确认 mock 路径走得通

### C. 删 prompt 字段（state_update 瘦身）

**位置**：`src/lib/agent/prompt.ts:50-69` 输出格式 JSON 示例

**删的字段**（服务端 R-C 之后全部不读）：
- `current_card_id` — normalize 强推
- `phase` — phased controller 前端切
- `words_learned` — R2 hits 服务端累计
- `generated_content` — 0 引用（已与 A 段 `GenerateState` 删除联动）

**保留的字段**：
- `speech`、`actions[]`、`current_word`、`attempt_assessment`

**改后 prompt 输出格式段落**：
```
## 输出格式
你必须严格输出以下 JSON 格式，不要输出其他内容：
{
  "speech": "你要说的话（中文+英文混合）",
  "actions": [
    { "tool": "show_card", "params": { "card_id": "卡片ID" } }
  ],
  "state_update": {
    "current_word": "当前正在教的词（仅 word 卡时设置；句卡阶段可留空或保持上一个）",
    "attempt_assessment": {
      "card_id": "被评估的当前卡片ID",
      "result": "correct|close|wrong|off_topic",
      "should_advance": true,
      "evidence": "一句话说明你如何从 raw ASR 和目标卡判断"
    }
  }
}
```

**同步检查**（确认服务端"忽略未知字段"行为）：
- `src/lib/agent/session.ts:155` `result.state_update.current_word` 仍能读到 — OK
- `src/lib/agent/session.ts:223` `result.state_update.attempt_assessment` 仍能读到 — OK
- speech-extractor 解析 state_update 的代码 — 检查不要因为字段缺失而抛错（应该是宽松解析，但要看一眼）

## 风险与回滚

- **风险 1**：删 `silentTurns` 时如果 DB / API 契约 / lesson-report 引用了这个字段会破。**检查**：grep `silentTurns` 全仓（含 db/, scripts/lesson-report-data.ts）确认无外部引用
- **风险 2**：C 删字段后 LLM 可能仍然输出旧字段（迁移期），服务端必须容忍。**预期**：`JSON.parse` + `result.state_update.foo` 取值是宽松的，多余字段会被忽略 — 不需要 zod 校验。已确认（diverge 选项已锁定"服务端保持忽略未知字段"）
- **风险 3**：B 修 mock 时如果选的 card_id（cat）跟 animals 课程定义不一致，VOICE_MOCK 测试还是会失败。**验证**：在改之前 `grep -n "id: 'cat'" src/data/courses/animals.ts` 确认存在
- **回滚**：单 PR 单 commit，`git revert` 即可

## 验收清单

- [ ] `pnpm test` 全绿（含 VOICE_MOCK 路径的测试）
- [ ] `pnpm exec tsc --noEmit` 0 error
- [ ] `pnpm smoke:lesson` 通过（CLAUDE.md 强制规则，A/C 动了 agent 必须跑；B 不触发但建议跑）
- [ ] grep 验证 6 个死代码全删（见上表"验证"列）
- [ ] grep 验证 prompt schema 不再出现 `current_card_id` / `phase` / `words_learned` / `generated_content`（除 phase-transition 路由那种合法用法）
- [ ] 手动 mock 路径 smoke：`VOICE_MOCK=true pnpm dev` 启 animals 课，看 console 没有报错、mock chunk 流出来正常解析

## 文档同步（CLAUDE.md 强制规则）

- `docs/architecture.md` §[LLM 接口] / §[agent state_update]：更新 schema 字段清单（删 4 个），加 "2026-05-24: prompt schema 瘦身，state_update 仅保留 current_word + attempt_assessment" 短句
- `docs/architecture.md` §[mock 路径] 如有：更新 mockStreamLLM 现状
- `docs/TODO.md` "Prompt / token budget slimming" 段：记一笔 "2026-05-24 已删 state_update 4 个废字段（current_card_id / phase / words_learned / generated_content）"
- 不动 CLAUDE.md（规则不变）

## Definition of Done

- 上面验收清单全 ✅
- 文档同步全做
- commit message：`refactor(cleanup): remove dead code + fix mock + slim prompt schema`
- PR body 简述 A/B/C 各做了什么 + 行数减少统计

## Out of Scope

- 不动 normalize/guard 逻辑（D 的事）
- 不动 LessonController / PhasedLessonController（不在 review 范围）
- 不重命名 / 不改 schema（除删字段）
- 不动豆包协议

## Technical Notes

- 上一轮 review 详细位置见对话上下文
- silentTurns 之所以从未被增量是历史遗留（旧版本曾计划做"沉默检测"但后来没实现）
- mockStreamLLM 的过期是 `refactor(canvas): v2 schema + show_card protocol(types/data/agent 层)` (130a71f) 没改 mock 残留

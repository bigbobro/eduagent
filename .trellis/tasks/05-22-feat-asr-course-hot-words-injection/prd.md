# Feat: ASR course hot_words injection (接通断链 + phase-aware 收窄)

## Goal

修复 2026-05-22 实测课报告 #3 — ASR 把 cat 一连串识别成 Touch/Cut/Kite/K 卡了 12 轮的根因:**hot_words 链路从 client 到 server 是断的**,儿童发英文短词时没有任何热词偏置。本 task 接通链路 + 按 phase 收窄 hot_words 集合 + 补回归测试覆盖儿童短词难例。

参考报告: [`docs/lesson-reports/2026-05-22-427f287b.md`](../../../docs/lesson-reports/2026-05-22-427f287b.md) — n=3-13 cat 卡 12 轮证据。

## What I already know (auto-context done)

### 现有实现状态(关键发现:server 端已实现,client 端从未调用)

**`src/lib/voice/asr-proxy.ts:68-99`** 已经完整实现 hot_words 注入:
- `buildAsrRequestPayload(session)` 接受 `AsrSessionInfo = { courseId, targetWords, cardId }`
- `buildHotWords(session)` 合并 `targetWords` + 单个 `cardWord`(由 cardId 查得)
- 注入到豆包 `request.corpus.context = JSON.stringify({ hotwords: [{ word: ... }] })`
- URL query string 解析(asr-proxy.ts:50-66)— 支持 `?courseId=&targetWords=&cardId=`
- **Fallback**:URL 带 courseId 但不带 targetWords 时,自动用整门课的 word card 英文(`getCourseTargetWords`)

**`src/lib/voice/asr-client.ts:18-23`** 有 `setAsrSessionContext(context)` 把 context 写到模块单例 `sessionContext`,然后 `open()` 时拼到 URL 上(asr-client.ts:91-96)。

**但是:** `grep -rn 'setAsrSessionContext' src/` **只找到定义,没有任何调用方**。所以:
- client 端 sessionContext 永远是 `{}`
- ASR URL 是 `/api/voice/asr`(无 query)
- server 端 sessionInfo = `{}` → buildHotWords 返回 `[]` → 豆包请求无 corpus → 无任何热词偏置

`docs/architecture.md` 第 43 行表格说"targetWords hot_words 注入" — **这是上次 task 写错的描述,实际未生效**,本 task 同步修正。

### 已有的测试基建

`scripts/asr-hotwords-regression.ts` 是完整的回归脚本,流程:
1. 用 TTS 合成 fixture 句子(中英混读)→ pcm
2. 把 pcm 喂给豆包 ASR(带/不带 hot_words 配置)
3. 断言 ASR 文本是否包含 `requiredTerms`
4. 写报告到 `docs/lesson-reports/asr-hotwords-regression-<ts>.json`
5. 已有 4 个历史报告(2026-05-05),case 集中在 hour/minute/second/hundred/thousand 这类时间数字词

**注意:** 这个脚本调真豆包 ASR,需要 `.env.local` 的 DOUBAO 凭据,不在 `pnpm test` 里跑。CLAUDE.md 提到 `pnpm run voice:asr-hotwords` 是它的 npm script(待确认 package.json)。

### LessonController 已有的状态

`src/lib/voice/lesson-controller.ts:74` `startLesson(courseId)` 持有 courseId。SSE actions 事件流出 `show_card.card_id` → 已有 `pendingActions` flush 路径(R1 from prior task)。要接通 hot_words 链路,**所有需要的信号都已经在 lesson-controller 上**,只是没有连出去。

### 豆包协议要点

- `request.corpus.context` 是 JSON string,内部 `hotwords: [{word: ...}]`(不是顶层 `hot_words` 字段)
- 双向流式支持 100 tokens 的热词
- 没有 per-hotword weight 字段(协议未提供)
- `language_hint` 字段在协议未出现,继续不传 `audio.language`

`docs/DOUBAO Protocol/asr.md:418-423` 是权威。

## Assumptions

- A1: 主要工作是 wiring,代码改动量小(2-3 处)。难点在测试覆盖和验证 hot_words 对儿童短词的实际提升效果。
- A2: phase-aware 收窄(currentCardId 单词 vs 全课程 12 词)对短词识别有显著提升 — **未验证,需要 fixture 测试对比**。豆包文档说"热词数量越精确效果越好"(双向流式 100 tokens 限制),理论支持。
- A3: cat 这种 3 字母短词即使加 hot_words,仍可能被识别成 Touch/Cut(完全不同发音的词)。报告 #3 提到 ASR 把儿童的 "cat" 识别成 "Touch" — 这很反常,可能不是 hot_words 能完全救的,但能显著降低 → 需要 fixture 验证目标:命中率 ≥ 70%(不期望 100%)。
- A4: 儿童 fixture 用 TTS 合成"接近儿童发音"的样本不够真实 — 但当前没有更好的替代;先用 TTS 多 voice 多 speed 生成,后续可以收集真儿童录音 fixture(out of scope)。

## Open Questions

- ~~Q1: 接通策略?~~ **已定:方案 A — startLesson 一次性写 targetWords + actions flush 时更新 cardId。**
- ~~Q2: hot_words 收窄?~~ **已定:方案 W2 — `{currentCard, nextCard}` 二词窗,与 R5/R7 对齐。**
- ~~Q3+Q4: 测试范围 + 验收?~~ **已定:加 animals + 几门常规课短词 fixture(~30 case),验收 baseline diff ≥ 30pp。旧 hour/minute fixture 对应的课程已废弃,直接删除 + 清理 `TIME_NUMBERS_TARGET_WORDS` const + 4 个旧 regression json,不做 rerun。**

## Requirements

- **R1** client 端 `LessonController.startLesson(courseId)` 内调用一次:`setAsrSessionContext({ courseId })`(server 端 fallback 会按 courseId 查全课 word cards,但**不**作为最终 hot_words 集合 — 见 R3)
- **R2** server 端 `buildHotWords(session)` 修改为 **W2 窗口**:当传入了 `cardId` 时,只返回 `{ currentWord, nextWord }`(从 course.cards + course.teachingHints.newCardIds 计算 nextWord);未传 cardId 时仍 fallback 全 12 词。这样保证开课 / actions 未到达期间 ASR 也有保底。
- **R3** `LessonController` 在 `pendingActions` flush 时(SSE actions → flush 路径,与 R1 prior task 同点)调用 `setAsrSessionContext({ ...prev, cardId })` 更新 currentCardId,使下一轮 startListening 的 ASR URL 携带最新 cardId
- **R4** 修正 `docs/architecture.md` 第 43 行 asr-proxy 描述,从"targetWords hot_words 注入"改成更准确的 "**握手期 PCM buffer + finish 缓存 + 按 currentCardId/nextCardId 注入 hot_words(无 cardId 时 fallback 全课词)**"
- **R5** 扩展 `scripts/asr-hotwords-regression.ts`:
  - 删除 `TIME_NUMBERS_TARGET_WORDS` const + 旧 hour/minute case
  - 删除 4 个旧 `docs/lesson-reports/asr-hotwords-regression-2026-05-05-*.json`
  - 新增 case set:animals 12 词 + colors / body / shapes 各挑 3-4 个代表性短词(总计 ~30 case)
  - 每个 case 跑两遍(baseline 无 hot_words / with W2 hot_words),记录两边命中率与差值
- **R6** asr-client 加单测验证 sessionContext → URL query 拼接正确(无 cardId 时不带 cardId 参数;有 cardId 时携带);asr-proxy 加 W2 窗口单测(W2 选词正确、nextWord 跨过 cleared)

## Acceptance Criteria

- [ ] **AC1** `pnpm test` 全绿:asr-client.test.ts(若新建)、asr-proxy.test.ts 包含 W2 窗口测试与 URL 拼接测试
- [ ] **AC2** `pnpm exec tsc --noEmit` 干净
- [ ] **AC3** 跑 `pnpm run voice:asr-hotwords` 后产出新报告,验收:`avgDiff = mean(with_hot_words_hit - baseline_hit) ≥ 30 个百分点`,**且** with_hot_words 命中率 ≥ baseline(任一 case 不允许 hot_words 反而拉低)
- [ ] **AC4** 真课 sanity check(不计 AC,仅发版前确认):跑一节 animals 课,dev server log 里能看到 `[asr xxxx] hot_words` 日志显示当前 cardId/nextCardId,且 cat 这种短词在 push-to-talk 1-2 次内识别到 cat(不再 12 轮卡死)
- [ ] **AC5** `docs/architecture.md` 表格行更新

## Definition of Done

- 单测全绿(asr-client.test.ts 若不存在则新建,测 sessionContext 拼接 URL)
- typecheck 干净
- `pnpm run voice:asr-hotwords` 跑一次新 fixture set,命中率达标
- `docs/architecture.md` 表格描述修正
- 跑一节真课验证 cat/dog/fish 等短词不再 12 轮卡死(不作为 AC,作为 sanity check)

## Out of Scope

- 收集真儿童录音 fixture(用 TTS 合成 voice 替代,后续单独 task)
- LLM 端 ASR 容错判定改进(memory.ts:240 R2 literal verify 不动)
- 添加豆包"自学习平台"热词词表(用 corpus.boosting_table_id)— 当前 direct hot_words 已够用
- 改 豆包 ASR endpoint 或 model_name(继续用 bigmodel_async)

## Technical Approach (待 Q&A converge 后填)

待定。初稿方向:

```
LessonController.startLesson(courseId)
  └─ setAsrSessionContext({ courseId, targetWords: <derived from course> })

LessonController flush pendingActions (or on actions emit)
  └─ if (show_card.card_id) setAsrSessionContext({ ..., cardId: <new> })

AsrClient.open()
  └─ readModuleSingleton sessionContext → query string → server
```

`setAsrSessionContext` 已经是模块单例 merge 写法,只要每轮 startListening 前 sessionContext 是最新的,asr.open 就能拿到。

## Technical Notes

### 涉及文件
- `src/lib/voice/asr-proxy.ts`(已实现,不动)
- `src/lib/voice/asr-client.ts`(setAsrSessionContext 调用方接通)
- `src/lib/voice/lesson-controller.ts`(在 startLesson + actions emit 处调用)
- `src/data/courses/*.ts`(已有 cards,只读)
- `scripts/asr-hotwords-regression.ts`(扩 case 集)
- `tests/fixtures/audio/*.pcm`(新增儿童动物词 fixture)
- `docs/architecture.md`(修正描述)
- `package.json`(确认 `voice:asr-hotwords` script 存在)

### 项目规则约束
- CLAUDE.md "测试自动化原则强制" — 必须用 fixture 跑命中率,不能只手测
- CLAUDE.md "改了协议适配 / 性能相关 → 同步 doc" — architecture.md 表格描述要修正(本来就要修)
- 不能在 commit / docs 出现真实凭据

### 参考已有相关代码
- 上一节(state-sync task)的 commit `bbcd83d` 展示了"normalize 用 assessedMemory"的 cross-cutting invariant 写法
- `docs/lesson-reports/asr-hotwords-regression-2026-05-05-*.json` 是产出格式参考

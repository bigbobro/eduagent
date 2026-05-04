# P0 Observability + Teaching Loop

**Date:** 2026-05-04
**Goal:** 消化 2026-05-02 transportation 实测课里最影响下一轮判断的 P0 问题:ASR/TTS 用量缺埋点、词汇表现没有进入闭环、LLM 总结/重复引导缺少硬约束。

## Scope

本迭代只做三件事:

1. **ASR/TTS usage 可观测**
   - 真实学生轮次进入 `/api/chat?action=message` 时带上 ASR latency + 文本长度。
   - 每次 assistant speech 生成后,按实际 speech 字符数记录 TTS requests/characters。
   - `/lesson-report` 继续基于 `token_usage` 判断 ASR/TTS 是否已跟踪。

2. **词汇表现追踪**
   - 只判断当前目标词 `memory.currentWord`。
   - 只做英文词精确 token 命中,例如 `train` 正确,`tree` 不算正确。
   - 写内存 `wordPerformance` 和 SQLite `word_performance`。

3. **Prompt 教学约束**
   - closing/review 只能总结 `wordsLearned`,不能把课程全集当作已学。
   - 当前词连续 3 次错误时,必须换策略或跳过,不能继续重复"跟老师一起说"。

## Non-goals

- 不做 ASR hotwords/context 注入。
- 不做 sliding-window / 摘要压缩。
- 不做 session resume。
- 不改 actions/TTS 时序。
- 不设计复杂发音相似度算法。

## Success Criteria

- `pnpm test` 通过。
- `pnpm exec tsc --noEmit` 通过。
- 新 lesson 结束后 `token_usage.asr.requests > 0`、`token_usage.tts.requests > 0`。
- 学生对当前词的每次尝试会更新 `word_performance.attempts/correct/needs_review`。
- Prompt 文本明确包含"连续 3 次错误切换策略"和"只能总结已学词汇"。
- `docs/architecture.md`、`docs/TODO.md` 同步当前事实。

# Pronunciation Assessment Design (2026-05-25)

## 背景

2026-05-25 `treats` 实测课卡在 `ice cream`:学生多次说出 `Ice cream`,LLM 也判断正确,但服务端 R-C 只按 `icecream` 字面 token 计数,导致 `cardCorrectCount.icecream` 不增加,无法推进到第 12 个词 `lollipop`。

同一类问题还包括 `pie` / `派`:中文释义与英文读音高度重合,ASR 可能输出中文"派",但教学目标仍是英文 `pie`。继续只靠 exact transcript 会过死;反过来默认把所有中文释义都算正确又过宽,例如学生说"蛋糕"不应直接通过 `cake`。

## 调研信号

- Microsoft Azure Pronunciation Assessment 使用 reference text + audio,返回 Accuracy / Fluency / Completeness / Prosody,并有 word/phoneme 粒度和 omission / insertion / mispronunciation 等错误类型。它把读稿场景(scripted assessment)与开放表达场景(unscripted assessment)分开。参考: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment>
- Azure 责任说明明确:pronunciation assessment 的表现依赖 STT 准确率、提交的 reference transcription、以及与人工评分的一致性;它不是普通 transcript exact match。参考: <https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/pronunciation-assessment/characteristics-and-limitations-pronunciation-assessment>
- Speechace 的 pronunciation scoring API 也是传入目标 text 和 user audio file,针对 word / phrase / sentence 打分,不是只看 ASR transcript。参考: <https://api-docs.speechace.com/api-reference/score-text-pronunciation>
- Pearson Versant 把口语能力拆成 Sentence Mastery / Vocabulary / Fluency / Pronunciation,其中 repeat 题同时评估句子掌握、流利度和发音。参考: <https://www.pearson.com/content/dam/one-dot-com/one-dot-com/english/versant-test/Official-Test-Guide-Versant-English-Test-final.pdf>
- ETS SpeechRater 面向非母语者口语,关注 pronunciation / fluency / vocabulary / grammar 等多维特征。参考: <https://www.ets.org/speechrater.html>

结论:行业里"说对"通常不是单一 transcript 命中,而是至少分成"是否说了目标内容"和"发音/流利度是否可接受"。EduAgent 当前没有 provider-native pronunciation score,所以短期只能做目标命中层,不能假装已经做了完整发音评测。

## EduAgent 判定分层

### Layer 1: Target Hit

判断学生这轮是否在说当前目标词/短句。

- 输入:raw ASR transcript、currentCardId、`WordCard.english`、`WordCard.asrAliases`。
- 规则:
  - 英文 target 和 raw ASR 都 lower-case。
  - 保留 ASCII 字母/数字和 CJK 字符,删除空格、标点、连字符等分隔符,所以 `ice cream` / `ice-cream` / `icecream` 等价。
  - `asrAliases` 是课程作者显式声明的命中别名,用于 `pie` / `派` 这类 ASR 常见同音/音译输出。
  - 不默认把 `WordCard.chinese` 当 alias。`cake` / `蛋糕` 不自动通过。

### Layer 2: Pronunciation Quality

判断发音是否接近目标。当前版本不实现,只保留设计位置。

- 理想输入:原始 audio + reference text。
- 理想输出:word-level 或 phoneme-level score,例如 accuracy / completeness / fluency / errorType。
- provider 候选:Azure Pronunciation Assessment 或 Speechace。
- 约束:儿童语音、中文环境、噪音、短词都可能影响评分,必须用本项目实测音频校准阈值。

### Layer 3: Pedagogical Advance

判断课堂是否推进到下一张卡。

- 当前 R-C:同一当前词卡需要 2 次 Layer 1 hit 才 `cleared`。
- LLM `attempt_assessment.result` 不直接决定推进;它只在无 hit 时影响 `needs_review` / 换策略。
- 对 3-6 岁学习场景,推进含义是"本节课可以继续",不是"长期掌握"。

## 当前实现决策

短期 v0.1 保留 R-C 的 2-hit 推进,只修 Target Hit 层:

1. `normalizeR2MatchText()` 保留 ASCII 字母/数字和 CJK 字符,删除分隔符。
2. `WordCard.asrAliases?: string[]` 作为课程显式命中别名。
3. `treats/pie` 增加 `asrAliases: ["派"]`。
4. `treats/icecream` 的展示英文改成 `ice cream`,卡片 id 和图片路径保持 `icecream`。
5. 回归测试覆盖:
   - `Ice cream.` / `ice-cream!` 可清除 `icecream`。
   - `派。` 可清除 `pie`。
   - `蛋糕。` 不会默认清除 `cake`。

## 后续方案

如果继续优化发音评测,不要继续扩字符串规则。下一步应加一个独立 provider spike:

1. 缓存 20-30 条真实儿童跟读音频,覆盖 `pie`、`cake`、`ice cream`、`lion`、`duck`、短句。
2. 用 reference text 调 Azure / Speechace 跑 pronunciation score。
3. 对比人工标注的 `pass / close / miss`。
4. 定阈值后再把 Layer 2 接入 R-C,例如:
   - `pass`: target hit 且 word accuracy >= threshold。
   - `close`: target hit 但 pronunciation score 低,继续慢读。
   - `miss`: 无 target hit。

在这个 provider spike 前,不要把 `asrAliases` 扩成大字典,也不要默认接受全部中文释义。

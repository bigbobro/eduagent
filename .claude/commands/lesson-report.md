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

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

## Realtime 课(桌面 App 的真人课)

真人课在桌面 App 里上,数据在 `~/Library/Application Support/EduAgent/`,不在仓库开发库。不要直接读正在用的库:

1. 把 `eduagent.db*`(含 `-wal`/`-shm`)和 `logs/server.log` 复制到一个临时目录。
2. 用副本跑脚本:`DATABASE_PATH=<副本>/eduagent.db pnpm -s tsx scripts/lesson-report-data.ts <session-id>`。
3. Realtime 课没有 ASR,下面"问题诊断"里的"ASR 误识"换成读 `responses` / `responseStats`:被取消的回应(尤其 `emptyCancelled`)、`assessments`(静默评估回应,即 `kind` 为 `assess` 的行:`total` 总数、`failed` 失败数(未完成或报告解析不出结果,会重试一次),`results` 里 `correct` / `close` / `wrong` / `not_attempt` 各几次;老课没有这类行,全为 0。`total` / `completed` / `cancelled` / `emptyCancelled` 只统计老师回应,不含评估行,可与旧课对比;评估行仍在 `responses` 列表里)、`nudges`(沉默提醒次数)、回复等待 `replyMs`(中位数、p90、最大值);再对照副本 `server.log` 里该 session 的 `child speech`、`response ended early`、`reply wait` 行。

Realtime 课还输出以下字段,不要把 `session.interactionCount` 当作孩子说话的次数:

- `childUtterances`:有可用判定的孩子语音段数,包括 `not_attempt`。只数已完成且结果可解析的评估回应,失败后重试的失败行不重复计;完全失败或早于评估回应留存的语音无法从此字段还原。
- `notAttempts`:判成「不算」的清单。`n` 是有效评估回应中的序号,`ts` 是回应保存时间,`targetId` 是孩子开口时绑定的屏幕目标,`heard` 是模型自述听到的内容。旧 `tools` 只有工具名时 `targetId` 为 `null`,不可从相邻换卡动作推测。
- `targetRuns`:按 `interaction_logs.model_calls.assessment.target_id` 对连续保存的作答分段。每段的 `targetId`、`startTurn` / `endTurn`(作答记录轮次)、`length`、`correct`、`cleared` 分别表示目标、起止轮次、作答数、正确数、是否在段内过关(课程卡看 `mastered`,练习题看正确作答)。目标改变或某条记录没有目标时断段;「不算」不进作答记录,因此不打断此处连续性。
- `responses[].tools`:换卡现在留作 `show_card(<课程卡 id>)`,未知卡或坏参数是 `show_card(?)`;评估留作 `record_assessment(<绑定目标 id>)`,无绑定仍是 `record_assessment`。`start_practice` / `end_sitting` 仍只有名字,多个工具逗号分隔。旧的无括号写法仍可读。

Realtime 的 `eval.teachingLoop.stuckCardRuns` / `maxStuckRunLength`、`eval.agentBehavior.speechCardMismatches` / `speechCardMismatchCount` / `emptyActionTurns` 为 `null`,表示依赖 `actions` 的检测不适用,不能写成「检测为零,没有问题」。`coverage_gap`、`clear_rate_low`、`clear_rate_source_legacy`、`needs_review`、`teaching_loop_stuck` 只用于原有课堂,Realtime 的 `nextIterationSignals` 不输出它们。Realtime 改看 `long_target_run`(warn,连续同一目标作答不少于 6 次,值为最长段长度)和 `not_attempts`(info,值为「不算」条数);仅在达到阈值或有记录时出现。

副本日志另查 `battle started`(`elapsedMs`,不含暂停的已上课时长)和 `sitting end settled`(`waitedMs`、结束时在途评估数 `pending`、是否等到超时 `timedOut`),分别对应战斗事件和最终 `sitting-ended` 发出时刻。两条日志只含标识、时间、数量和布尔值,不含话术或转写。

## 报告模板(必须包含这些 section)

### 标题与基本信息
```
# 课后报告 — <courseId> (YYYY-MM-DD)

session: <id 前 8 位>... · <时长> · <轮次>轮 · <input> in / <output> out
```

如 `session.ended === false`,在标题下加一行:`⚠️ 课程未正常结束(end_time 为空)`。
如 `eval.sessionHealth.endedGracefully === false`(即使 `ended === true`,因为 `touchLessonLog` 每轮都会刷 `end_time`),在标题下加一行:`⚠️ 课程非优雅结束(未收到 action:end,可能是关标签页/崩溃)`。
如 `anomalies.tokensCorrupted === true`,加一行:`⚠️ token_usage 解析失败,token 数字不可信`。
Realtime 基本信息同时列 `childUtterances` 语音段和 `interactionCount` 条已保存作答,不要把两种计数混称「轮次」。

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
- `interactions` 为空:仍出报告。原有课堂标 "零交互,无数据可分析";Realtime 如有 `responses` / `notAttempts`,继续分析这些已留存的回应,只把作答分析标为无已保存作答。

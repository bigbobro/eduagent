# 课后报告生成器 — 内部迭代向诊断工具

**日期：** 2026-05-02
**迭代目标：** 把"实测一节课后,人工读 DB 写诊断"这件事固化成可复用产物。每节实测课后跑 `/lesson-report`,自动产出**面向开发/产品**的诊断报告(问题 + 根因猜测 + 迭代方向),用于驱动后续迭代决策。

**非目标:**
- ❌ 给家长/学生看(那是另一个 feature,本次不做)
- ❌ 自动入库 / 自动 commit / 自动发通知
- ❌ 跨课对比 / 趋势图(YAGNI;真有需求再做)
- ❌ **教学策略层面的诊断**(LLM 总结准确性、教学覆盖度、复习/巩固时机、目标词未实际教时该不该提...)— 这是 MVP 之后的"教学策略设计"议题,不是 bug,需要单独立项。本迭代只产出**可观测的工程信号**(ASR 误识、token 异常、埋点缺失、明显的话术循环卡死),不替产品决定教学策略对错

---

## 1. 整体架构

### 调用链

```
你输 /lesson-report [session-id?]
    ↓
Claude 读 .claude/commands/lesson-report.md
    ↓
Claude 跑 pnpm tsx scripts/lesson-report-data.ts [session-id?]
    ↓
拿到 JSON(基本信息 + 全部轮次 + 规则化算好的指标)
    ↓
Claude 按 prompt 模板生成 markdown 报告
    ↓
Write 到 docs/lesson-reports/YYYY-MM-DD-<sid8>.md
    ↓
在对话里展开报告 + 主动问"要不要拆成 TODO?"
```

### 文件清单

| 路径 | 状态 | 行数估计 | 职责 |
|---|---|---|---|
| `scripts/lesson-report-data.ts` | 新增 | ~80 行 | 数据层:DB 拉取 + 规则化指标计算,输出 JSON |
| `scripts/lesson-report-data.test.ts` | 新增 | ~120 行 | 单测,vitest |
| `.claude/commands/lesson-report.md` | 新增 | ~50 行 | slash command prompt(报告生成模板) |
| `docs/lesson-reports/.gitkeep` | 新增 | 0 行 | 占位让目录存在 |
| `.gitignore` | 修改 | +1 行 | 忽略 `docs/lesson-reports/*.md`(默认不污染 repo) |

### 职责切分

- **脚本** = 确定性数据 + 可规则化判定的指标。**有单测**。
- **prompt** = 把指标 + 原始轮次组织成报告 + 提"迭代方向"建议。**LLM 判断,不强求确定性**。

设计原则:**规则可靠的事脚本干、不烧 token;判断脆弱的事 LLM 看原始数据干、不强行规则化。**

---

## 2. 脚本接口与数据结构

### CLI

```bash
pnpm tsx scripts/lesson-report-data.ts [session-id]
```

- 不传 `session-id` → 默认 `start_time DESC LIMIT 1`(最近一节)
- 输出:**JSON 到 stdout**,无任何辅助 log(slash command 解析输出会被干扰)
- 错误统一走 stderr,exit code != 0

### JSON 输出结构

```jsonc
{
  "session": {
    "id": "cf63ef96-...",
    "courseId": "transportation",
    "courseTitle": "交通工具 Transportation",  // 课程 .title
    "targetWords": ["car","bus","train","airplane","bicycle","boat"],
                                              // 课程 objectives.words[].english (小写),
                                              // 仅作为词汇掌握表的"目标词列表",不参与异常检测
    "startTime": "2026-05-02T04:17:35.501Z",
    "endTime": "2026-05-02T04:27:28.416Z",   // null 表示未结束
    "durationSec": 593,                       // null 当 endTime 为 null
    "interactionCount": 30,
    "ended": true                             // endTime 是否非 null
  },
  "tokens": {
    "llm": {
      "requests": 30, "input": 41973, "output": 3327,
      "avgInputPerRound": 1399, "maxInput": 2100
    },
    "asr": { "requests": 0, "tracked": false },
    "tts": { "requests": 0, "tracked": false }
  },
  "anomalies": {
    "highAvgInput": true,                    // avgInputPerRound > 1000
    "asrUsageNotTracked": true,
    "ttsUsageNotTracked": true,
    "tokensCorrupted": false
  },
  "interactions": [                          // 完整轮次,给 LLM 看上下文
    {
      "n": 1,
      "ts": "2026-05-02T04:17:39.219Z",
      "user": "(课堂开始)",
      "ai": "小朋友们好...",
      "actions": [{"tool":"show","params":{"image_id":"transportation_all"}}]
    }
    // ...
  ]
}
```

### 课程文件读取

- 课程定义在 `src/data/courses/<courseId>.ts`(TypeScript module,不是 JSON)
- 类型见 `src/types/course.ts`,关键字段:`title`、`objectives.words[].english`
- 脚本用动态 import 读取:`await import('../src/data/courses/' + courseId)`,取 `<courseName>Course` 或同名 default export
- 课程文件读不到时,`targetWords=[]`、`courseTitle=courseId`,词汇掌握表那一节由 prompt 标"⚠️ 课程定义缺失"跳过

### 脚本只算"规则可判定"的指标

1. **基本信息 + 时长 + 轮次**(`session.*`)
2. **课程目标词列表**(`session.targetWords`)— 给词汇掌握表当数据底
3. **Token 聚合**(`tokens.llm.{avgInputPerRound,maxInput}` 等)
4. **`highAvgInput`** — `avgInputPerRound > 1000`
5. **`asrUsageNotTracked` / `ttsUsageNotTracked`** — 对应字段 `requests === 0`
6. **`tokensCorrupted`** — `JSON.parse(token_usage)` 抛错时为 `true`,其他指标兜底为 0

> **明确不算的**:不做"AI 是否提到了未真正教的词"、"AI 是否说了课程外的词"这类**教学覆盖度/语义准确性**的检测。这些归属于"教学策略"议题(MVP 之后的设计),不是工程 bug。本工具只产出可观测的工程信号。

### 脚本不算的(交给 LLM 看 raw 轮次判断)

- ❌ **ASR 误识** — "翠翠 / Apple / The tree" 这种规则写不准,但 LLM 看上下文一眼能看出
- ❌ **教学策略卡死** — "目标词是什么"需要解析老师文本,规则化太脆弱;LLM 看连续 N 轮一模一样的话术立刻能识别

---

## 3. Slash Command Prompt 与报告结构

### `.claude/commands/lesson-report.md`

```markdown
---
description: 上完一节实测课后,生成"内部迭代向"诊断报告
argument-hint: "[session-id]"
---

# 课后报告 — 内部迭代诊断

## 流程
1. 跑 `pnpm tsx scripts/lesson-report-data.ts $ARGUMENTS`(无参 = 最近一节)
2. 解析 stdout 里的 JSON
3. 按下面模板生成 markdown 报告
4. 报告文件名:`docs/lesson-reports/<YYYY-MM-DD>-<session.id 前 8 位>.md`
   YYYY-MM-DD 用 `session.startTime` 转本地日期(不要用今天的日期)
5. Write 工具写文件 → 在对话里展开报告 → 主动问"要不要拆成 TODO 加到 docs/TODO.md?"

## 报告模板(必须包含这些 section)

### 课程基本信息
- session id / 课程(courseId + courseTitle)/ 时长 / 轮次 / LLM token 总量
- 如 `session.ended === false`,在标题下加一行:`⚠️ 课程未正常结束(end_time 为空)`

### 词汇覆盖与掌握
- 表格:课程 vocabulary 每个词 → 出现轮次数 / 学生说对过 / 卡了几轮 / 状态
- 用 ✅(掌握)/ ⚠️(勉强)/ ❌(未掌握)
- vocabulary 为空时,跳过此节并标 "⚠️ 课程定义缺失,跳过词汇分析"

### 问题诊断
对每条诊断,**严格按"现象 → 根因猜测 → 迭代方向"三段式**。
覆盖以下 4 类工程信号(每类不一定都有,但都要扫一遍 raw interactions):
1. **ASR 误识** — 看 interactions,捞出明显不像学生本意的识别(中文谐音、风马牛单词)
2. **明显的话术循环卡死** — 老师对同一对象连续 ≥3 轮重复几乎相同的话(逐字相似度高)、状态没推进。**注意**:不要去评判"该不该这么教",只汇报"循环本身"这个工程现象
3. **Token 异常** — 看 `anomalies.highAvgInput` 和具体数字
4. **埋点缺失** — `anomalies.{asrUsageNotTracked,ttsUsageNotTracked}`

> **明确不写**:"老师没教 X 却在总结里提了 X" / "老师该不该用某种话术" / "教学顺序合不合理" — 这些是教学策略议题,不是工程报告的范围。如果发现这类现象,**只在报告底部加一节"超出本报告范围的观察(供产品决策)"**,简短列出,不分析、不出建议。

### 迭代候选(可拆 TODO)
- 把诊断段落里的"迭代方向"汇总成 bullet,每条独立可拆
- 语气直接,不绕

## 写作要求
- **受众是开发者自己**,不要鼓励性语言(没有"小朋友真棒")
- **现象必须引证具体轮次或数据**(轮次号 / 原文 / 数字),不能空喊
- **建议要可落地** — 不能"需要优化 ASR",要写"在 asr-proxy 里给儿童场景换 hot_words 词表 + 加 enable_punc=false"这种程度
```

### 报告文件示例(以今天的 transportation 课为例)

```markdown
# 课后报告 — transportation (2026-05-02)

session: cf63ef96-... · 9 分 53 秒 · 30 轮 · 41973 in / 3327 out

## 词汇覆盖与掌握

| 词 | 出现 | 学生说对 | 状态 |
|---|---|---|---|
| car | 2 | ✅ | ✅ |
| airplane | 9 | ❌ | ❌ 未掌握 |
...

## 问题诊断

### 1. ASR 对儿童 + 中英混说误识严重
**现象**:轮次 6 学生说"准备好了"被识别为"翠翠";轮次 13-19 多次"airplane"被识别为 Apple / AirPods / 阿伟 / 奥利。
**根因猜测**:豆包 ASR 默认热词表偏成人通用语,对学龄前儿童发音 + L2 英语 + 中英夹杂场景没专门优化。
**迭代方向**:在 `src/lib/voice/asr-proxy.ts` 注入课程目标词作为 hot_words,并尝试关闭自动标点(`enable_punc=false`)看是否减少误切。

### 2. 话术循环卡死:airplane 8 轮重复"跟老师一起说"几乎逐字
**现象**:轮次 13-20 学生连续 8 次说错 airplane,老师每轮回复都是结构几乎一致的"哇/没关系,飞机的英文是 Airplane! 来,跟老师一起说:Airplane!"。
**根因猜测**:LLM prompt 没有"识别学生重复失败 → 切换教学输出模式"的指令。
**迭代方向**:state machine / prompt 层加规则:同目标词连续 ≥3 次失败 → 强制切到"另一种引导模式"(具体哪种由教学策略议题决定,不在本报告范围)。

### 3. Token 平均输入偏高
**现象**:30 轮 LLM 调用,平均每轮 1399 input token(`anomalies.highAvgInput=true`)。
**根因猜测**:历史对话全量带入 prompt,后期轮次膨胀严重。
**迭代方向**:加滑动窗口(只保留最近 N 轮原文 + 早期轮的摘要),或对历史对话压缩后再喂。

### 4. 埋点缺失:ASR/TTS 用量未统计
**现象**:DB `token_usage` 里 `asr.requests=0` / `tts.requests=0`。
**迭代方向**:`src/lib/logger.ts` 补 ASR session 完成、TTS 整段播完时的字符/请求计数埋点。

## 超出本报告范围的观察(供产品决策)
- 老师在结尾两次说 "...有 car, bus, train, airplane, bicycle, 还有 boat",但本节实际没 show bicycle。这属于"教学覆盖度/总结策略"议题,需产品侧单独决定。

## 迭代候选(可拆 TODO)
- [ ] asr-proxy 接入课程目标词 hot_words + 关闭 enable_punc(诊断 #1)
- [ ] 加教学卡死检测 → 强制切引导模式(诊断 #2,具体策略另立)
- [ ] LLM prompt 历史对话窗口/压缩(诊断 #3)
- [ ] logger.ts 补 ASR/TTS 埋点(诊断 #4)
```

---

## 4. 边界情况

| 情况 | 处理 |
|---|---|
| `session-id` 传入但 DB 查不到 | 脚本 stderr 报错 + 列最近 5 个 id 给参考,exit 1 |
| `end_time IS NULL`(课程没正常结束) | 仍出报告,JSON `session.ended=false`,prompt 在报告头加 ⚠️ 提示 |
| `interactions` 为空 | 仍出报告,标"零交互",anomalies 全跳过(`hallucinationCandidates=[]`) |
| `src/data/courses/<courseId>.ts` 读不到 | `targetWords=[]`、`courseTitle=courseId`,prompt 在报告里标"⚠️ 课程定义缺失,跳过词汇覆盖表" |
| 同 session 重跑(报告文件已存在) | **直接覆盖**(同 session 数据稳定,重跑应得到等价结果;改名只产生垃圾) |
| `token_usage` JSON 解析失败 | 兜底全 0,`tokensCorrupted=true`,prompt 在报告里提一句 |
| 数据库文件不存在(`db/eduagent.db`) | 脚本 stderr 报错"DB 不存在,先跑过 dev server",exit 1 |

---

## 5. 测试策略

### A. 自验证(实施时必做)

- 写完 `lesson-report-data.ts` 立即拿真 session(`cf63ef96-...`)跑一次,人眼校 JSON 结构与数字
- 写完 slash command 立即在 Claude 里 `/lesson-report` 跑一次,检查:
  - JSON 解析没问题
  - 报告 markdown 文件落到了 `docs/lesson-reports/`
  - 文件名日期来自 `session.startTime`(不是今天的日期)
  - 报告内容覆盖 5 类诊断 + 引证了具体轮次

### B. 集成自动化(进 vitest)

`scripts/lesson-report-data.test.ts` 覆盖:

1. **基础聚合正确性** — seed 假课(in-memory better-sqlite3),断言 `durationSec`、`interactionCount`、`tokens.llm.avgInputPerRound`
2. **课程目标词读取** — 给定 courseId,断言 `targetWords` 等于 `objectives.words[].english.toLowerCase()` 的列表
3. **anomaly flags**:
   - `highAvgInput`:avg=1500 → true;avg=900 → false
   - `asrUsageNotTracked`:`asr.requests=0` → true;`asr.requests=5` → false
   - `tokensCorrupted`:`token_usage="{invalid"` → true,其他指标兜底为 0
4. **边界**:
   - `endTime` 为 null → `ended=false`,`durationSec=null`,不抛
   - `interactions` 为空 → 全部 anomaly flag 为 false
   - 课程文件读不到 → `targetWords=[]`、`courseTitle=courseId`,不抛
   - DB 文件不存在 → 进程 exit 1,stderr 含可读错误

### 不测的

- LLM 生成的报告内容(主观,且每次微差)— 由人审报告把关
- 报告文件路径拼接 — 简单到不值得测
- slash command prompt 层 — 靠人审报告

---

## 6. 实施 checklist(供 plan 参考)

- [ ] `scripts/lesson-report-data.ts` 实现 + 真 session 跑通
- [ ] `scripts/lesson-report-data.test.ts` 写 case A-D + 边界 case,`pnpm test` 通过
- [ ] `.claude/commands/lesson-report.md` 编写 + 在 Claude 里 `/lesson-report` 跑通(包括默认最近一节、指定 session id 两路径)
- [ ] `docs/lesson-reports/.gitkeep` + `.gitignore` 追加 `docs/lesson-reports/*.md`
- [ ] `docs/architecture.md` 同步:加一节"课后报告工具链"或在已有 dev-tooling 节加引用(项目级 CLAUDE.md 强制 doc sync)
- [ ] `docs/TODO.md` §0 中"课程反馈分析"条目下面加一行"通过 /lesson-report 生成,详见 `docs/lesson-reports/2026-05-02-cf63ef96.md`"

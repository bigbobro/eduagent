# EduAgent TODO — 下次开发任务

## 0. 下次迭代目标:画布与教学策略重新设计(2026-05-05 记录)

> 今天完成了 P0 几项 + 第二课程设计后,实测发现画布层抽象不够,纯切图无法承担"老师教学"的职责。下一轮迭代主目标:**英文课程的"备课"与"教学策略"重新设计**。

**问题清单:**

1. **画布 ≠ 单张图** — 现在生成是单张图片,但小朋友需要同时看到:
   - 教学图(物体/场景)
   - **中文词**(标准印刷体)
   - **英文词**(标准印刷体,可能还要拼读分节、音标)
   这两类文字**不应**塞进图片生成里(字体不可控、易出错、改不了),应作为画布的**独立图层 / DOM 元素**叠加,跟图分离。

2. **教学技能层缺失** — 老师在讲解时需要的动作不止"切到下一张图":
   - 局部放大(看飞机的机翼 / 看船的船帆)
   - 高亮特定区域(指着某个部件)
   - 词卡分步出现(先出图 → 再出英文 → 再拼读)
   - 中英对照、读法标记、节奏点
   早期 spec 思考过这些 focus / annotate 动作,但当前实现里 LLM 只切图,**不知道**单张生成图上"哪个区域可放大、哪个区域是关键部件"——等于失明。

3. **生成的图缺少"教学语义元数据"** — 生成完图就完了,没有附带:
   - 关键区域 bbox(机翼在哪、船帆在哪)
   - 教学切片建议(可以从这几个角度讲)
   - 中英文对照文本(应该外挂,而非烧进图)
   导致 actions 层的 focus / zoom / annotate 都没有可操作对象。

**下一轮要回答的问题:**

- 备课产物从"一组图"升级为"教学卡片包":图 + 中英文本 + 关键区域 bbox + 教学步骤建议(谁先出、谁后出、放大哪里)。
- 画布从"换图器"升级为"分层教学舞台":图层 / 文本层 / 高亮层 / 标注层 独立可控,actions 协议要支持指挥这些层。
- LLM prompt 里要把"这张卡片可放大区域、可对比区域"作为上下文喂进去,**老师才能调用对应的教学动作**。
- 现有 focus / annotate / show 的协议是否够用?还是要扩 zoom-to-bbox / split-view / step-reveal 等新 action?

**要做的前置思考(plan 之前)**:

- [ ] 列 3-5 个真实教学场景(讲 airplane 时怎么分步、讲 boat 时怎么对比),把"理想老师动作序列"写出来作为 spec 输入
- [ ] 看现有 `lessons/*.json` 数据结构,评估扩成"教学卡片包"的成本
- [ ] 看现有 canvas 组件分层(`src/components/canvas/*`),评估文本层 / 高亮层独立化的工作量
- [ ] 决定文本层方案:静态写在课程 JSON 里 / LLM 实时生成 / 两者结合
- [ ] 决定关键区域 bbox 来源:课程里手工标 / 用图理解模型自动提 / 让生成模型同时返 bbox

**先不动:** AI 图片生成本身已经 OK,这一轮不动图生成,只动"图周围的教学骨架"。

---

## 1. 验收过程发现的待办(2026-05-01 / 2026-05-02)

- [x] **课程反馈分析 P0 第一段(2026-05-02 transportation 课观察)** — session `cf63ef96-5dd1-4f40-89a7-ad324a311680`,30 轮 / 9 分 53 秒,LLM 41,973 in / 3,327 out。已先消化其中最影响下一次判断的 3 个 P0 问题:ASR/TTS usage 埋点、当前词词汇表现追踪、总结/连续失败 prompt 硬约束。GoalPower 记录见 `docs/superpowers/specs/2026-05-04-p0-observability-teaching-loop.md`。
  1. **ASR 误识严重**(儿童 + L2 英语 + 中英夹杂硬伤):
     - "准备好了" → `翠翠`
     - "Airplane" → `Apple` / `AirPods` / `阿伟` / `奥利` / `Airplay` / `I play`
     - "Boat" → `The tree` / `Fruit`
     - 后续仍需做 ASR hotwords/context 注入,本轮未做。
  2. **LLM 幻觉**:课程结尾老师两次总结 `car, bus, train, airplane, bicycle, 还有 boat`,**bicycle 本节课从未教过**。已加 system prompt 硬约束:复习/结尾只能总结 `wordsLearned` / 已学词汇。
  3. **教学循环卡死**:Airplane 引导 8 轮全错,老师没切换策略(分音节、模仿飞机声、跳过),只机械重复"跟老师一起说"。已加当前词精确尝试判定 + 词汇表现记录 + prompt 规则:**同一目标词连续 3 次错误 → 必须切策略**。
  4. **Token 消耗偏高**:平均 1,400 input / 轮(历史对话全量带入)。后期加滑动窗口或摘要压缩。
  5. **ASR/TTS 用量未埋点**:已补。ASR 从 `LessonController` final 结果上报请求数 + 文本长度;TTS 按生成的 assistant `speech` 记录请求数 + 字符数。

  现已通过 `/lesson-report` 自动生成,后续每节实测课的反馈走该工具,详见 `docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`。


- [ ] **课程 Session resume** — 当前刷新 / 断网 / **dev server 重启** = 课程中断。每次上课应该有一个 session,断网/刷新/server 重启后能 resume 到上次的 phase / state / 已学词汇。当前 `src/lib/agent/session.ts` 的 `sessions` 是模块级 in-memory `Map`,server 一重启就丢,客户端 LessonController 仍持有旧 sessionId,POST `/api/chat?action=message` 会被 server `getSession()` 返回 undefined → 404 → 客户端报错。涉及:server 端 session 持久化(SQLite 已有 `lessons/turns/word_performance` 表可扩展)、client 端 reconnect 时拉取最新 state、UI"恢复上次进度"提示。**当前临时 mitigation**:404 时 client 提示"课程已过期,回首页重新进入"(`lesson-controller.ts:230` 附近)。
- [ ] **actions 与 TTS 时序对齐** — 现状是 LLM JSON 解析完 actions 字段就立刻 emit 到画布,但 TTS 还在慢慢播。结果"AI 还在说'这是飞机'但画布已经高亮了下一张图"。可选方案:
  - 简单:actions 等 TTS `session-finished`(整段说完)再触发 — 字幕完成度好但牺牲实时感
  - 中等:actions 跟随 TTS `TTSSentenceStart` 事件分批触发,LLM 每句对应一个 action
  - 复杂:LLM 在 speech 文本里 inline 标 anchor(如"这是 [show:boat] 船"),按文字到达 PCM 时戳触发
  - spec §6 字幕领先策略当初是接受的,但实测画布跳得太快还是别扭。

## 2. 补全 Spec 遗留功能

- [x] **词汇表现追踪** — 在 session.ts 中实现 markWordCorrect/Incorrect,每次学生说完后判断是否涉及目标词汇,写入 word_performance 表
- [ ] **完整兴趣信号检测** — 增强 memory.ts 的兴趣检测逻辑,识别更多信号类型(confusion、engagement),在 prompt 中注入更丰富的兴趣上下文
- [ ] **logger.ts** — 创建独立日志模块,统一日志格式,支持控制台 + SQLite 双输出
- [ ] **generate 的 state_update 记录** — LLM 生成新内容时,在结构化输出中记录 generated_content 字段

## 3. 画布交互优化

- [ ] **focus 动画时长** — 当前高亮/圆圈动画 2 秒自动消失太快,小朋友来不及看。改为:动画保持直到下一次 focus 或 show 切换
- [ ] **focus 视觉效果** — 线框一瞬间就过去,需要更明显的视觉反馈。改进:放大动画更平滑,发光效果更持久,加文字标签
- [ ] **annotate 持久性** — annotate 标记应该保持在画面上直到被清除,而不是随 focus 一起消失
- [ ] **图片切换动画** — show 切换时的过渡动画可以更生动(缩放+淡入,而不是简单淡入)

## 4. 课程产出 SOP(Codex skill 化,替代原"AI 图片生成"任务)

> **方向调整(2026-05-05):** 不再在 app 内做"运行时 AI 图片生成 API"。图生由 **Codex 跑 imagegen 技能**离线完成。本轮要做的是把**课程产出的标准动作**(课程设计 → 物料生成 → 落库检查)沉淀成一个 Codex skill,后续做新课程时直接在 Codex 里调用这个 skill 即可批量产出一节课的所有物料。
>
> **本轮只做 SOP / skill 本身,不做 app 内的"动态课程创建"功能。**

要交付的 Codex skill 应覆盖:

- [ ] **课程设计步骤** — 给定课程主题(如"transportation"/"animals")时,skill 引导:词汇表(中英 + 音节)、教学顺序、phase 划分、对话脚本骨架、目标 word performance 阈值。产物为一份标准结构的 `lessons/<id>.json` 草案。
- [ ] **物料生成步骤** — 调 imagegen 把每个词汇 / 场景生成对应教学图;同时生成"教学语义元数据"(关键区域 bbox、可放大区域、可对比角度——配合 §0 画布重设计)。每张图同时存"原图 + 元数据 JSON"。
- [ ] **落库检查步骤** — 把课程 JSON + 物料注入到 `lessons/` 目录 + `src/lib/courses.ts` 注册;自动跑校验:JSON schema、引用的图片是否都存在、bbox 是否在图内、中英文词汇是否齐全、phase 转移图是否闭合。校验失败 → 阻断 + 给出诊断。
- [ ] **skill 自身位置** — 放在 `~/.claude/skills/eduagent-course-author/`(或项目内 `.claude/skills/`),包含 SKILL.md(流程说明)+ 子文件(prompt 模板、schema、checklist)。
- [ ] **依赖 §0** — 课程 JSON 的 schema 升级(教学卡片包:图 + 中英文本 + bbox + 教学步骤建议)在 §0 画布重设计完成后才定稿,本任务前期可先做"现有 schema 下的 SOP",待 §0 落地后扩展。

**明确不做(本轮):**
- ❌ App 内"运行时 generate 工具"让 LLM 实时生图
- ❌ 用户在 app 里点按钮自助创建课程
- ❌ 图片缓存策略 / 动态课程内容(都是运行时功能)

## 5. 语音延迟优化(已完成 — 2026-05-01)

- [x] **流式 TTS** — 接入豆包 `seed-tts-2.0` bidirection,边合成边播
- [x] **流式 LLM** — MiMo `chat/completions` stream:true,SpeechExtractor 状态机解析
- [x] **流式 ASR** — 接入豆包 `bigmodel_async` 双向流式
- [x] **并行处理** — speech-delta 实时推 TTS,actions 等 JSON 完整后才发出

实测延迟基线见 `docs/voice-benchmarks.md`。

后续可继续优化:
- [ ] **音色微调** — 在 seed-tts-2.0 列表里挑选 / 试音色,确定最佳儿童友好女声(当前占位 `zh_female_tianmei`)
- [ ] **WebSocket 重连退避** — 当前只重连一次,可加指数退避
- [ ] **服务端 VAD 兜底** — 万一回声消除不彻底,再加一道
- [ ] **预加载开场白 TTS** — 利用豆包 cache 让首句几乎零延迟

## 6. 录音交互优化(已完成 — 2026-05-01)

- [x] **按住说话** — 桌面空格键 + 平板触屏按钮,实现 push-to-talk
- [x] **视觉反馈** — Bunny SVG 角色,4 个状态对应 idle/listening/thinking/speaking,纯 CSS 动画

后续可继续优化:
- [ ] **VAD 自动停止** — 当前依赖用户主动松手,后续可加静音检测兜底(防止小朋友按住不放)
- [ ] **连续对话模式** — Awaiting 时自动开始监听,无需手动按住

## 优先级

| 优先级 | 任务 | 原因 |
|--------|------|------|
| P0 | 画布与教学策略重新设计(§0) | 当前画布只有切图,文字 / 高亮 / 教学动作均缺失,影响教学效果 |
| P0 | 真实环境 E2E 验收(spec §11.3 12 项) | 还没人工跑过完整一轮课堂 |
| P1 | 音色微调 | `zh_female_tianmei` 是占位,需要试听后定档 |
| P1 | 画布交互优化(§3) | 视觉反馈不足 |
| P1 | 补全遗留功能(§2) | Spec 完整性 |
| P2 | 课程产出 SOP / Codex skill 化(§4) | 沉淀课程设计 + 物料生成 + 落库检查的标准动作,后续在 Codex 里跑就能产新课;依赖 §0 schema 落定 |

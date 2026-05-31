# EduAgent 项目规则

> **本文件是项目级 Claude 指南。每次进入项目时自动加载,所有协作行为以此为准。**

## 项目是什么

儿童英语教学 Agent,多模态:豆包流式 ASR / TTS + 小米 MiMo LLM 大脑 + 浏览器画布交互。

- **主入口**:`README.md`(项目介绍 + 怎么跑)
- **当前架构事实文档**:`docs/architecture.md`(living doc,master 上系统的现状)
- **第三方协议参考摘要**:`docs/DOUBAO Protocol/{asr,tts}.md`
- **后续待办**:`docs/TODO.md`
- **性能基线**:`docs/voice-benchmarks.md`

## 文档维护规则(强制)

### 改 bug / 加功能时必同步

涉及以下任一情况,必须**当次 commit 内**同步更新 `docs/architecture.md`:

- 改了模块职责、跨模块的数据流
- 改了协议适配(任何写到 `src/lib/voice/{doubao-codec,asr-proxy,tts-proxy}.ts` 的逻辑)
- 改了 `LessonController` 状态机(新增/移除状态、转移条件)
- 改了关键算法(SpeechExtractor 状态机、PCM 节奏、AudioContext 生命周期)
- 改了性能上的关键决策(prewarm、buffer、timeout 阈值)

### 不能只改代码

代码 PR 提交前 self-check:
- [ ] 这次改动是否影响 architecture.md 任何一节?如是 → 同步改
- [ ] 改了协议?同步进 `docs/DOUBAO Protocol/` 的踩坑提示(若是新踩坑)
- [ ] 改了延迟相关?跑测后追加 `docs/voice-benchmarks.md`(若有变化)
- [ ] 完成了 TODO 里的项?把它划掉/标 done

### 不能把"以后补文档"当 backlog

文档同步是 commit 的一部分,不是后置 task。"我下次再补"≈ 永远不补。代码 review 看见文档没动,直接拒。

## 协议层踩坑前查文档

碰到豆包 ASR/TTS 报错时,**第一动作不是 grep 代码**,是:
1. 看 `docs/DOUBAO Protocol/{asr,tts}.md` 找本项目协议摘要和官方链接
2. 看 user memory 里 `project_doubao_v3_{asr,tts}_protocol.md` 摘的踩坑点
3. 确认不是已知坑后,再动手调试

## 关键约束(继承自 spec)

- **密钥不出服务端。** 任何 `NEXT_PUBLIC_*` 前缀的豆包/MiMo 密钥都是 PR review 一票否决。
- **Push-to-talk 单一交互。** 不做撤回、不区分长短按。当前版本不支持打断(老师说话时空格忽略)。
- **TTS 长连复用 / ASR 按轮建连。** 详见 architecture.md。
- **VOICE_MOCK=true** 跳过豆包/MiMo,本地无网络可跑全链路(为了 CI 与离线开发)。

## 凭据(secrets)规则

**任何文档(README、spec、plan、CLAUDE.md、architecture.md、TODO、benchmarks、git commit message、PR description)中,严禁出现真实凭据值。**

包括但不限于:
- `MIMO_API_KEY`(`tp-...` 开头)、`DOUBAO_ACCESS_KEY`、`DOUBAO_APP_ID`
- 数据库连接串里的密码段
- OAuth client secret、JWT signing key

文档里需要演示 env 配置时,**只能用占位**:
```
MIMO_API_KEY=<your-mimo-api-key>
DOUBAO_ACCESS_KEY=<your-access-key>
```

**触发情况** — 一旦发现 docs / commit / PR 中含有真实凭据(即使 repo 是 private):
1. 立刻在对应控制台 **rotate**(作废 + 重生成)— 这是绝对必须的安全动作,即使后续重写 git history,旧 commit 也可能已被抓取
2. 用 `git filter-repo --replace-text` 重写 git history,把真实值替换成占位
3. force push 覆盖 GitHub
4. 排查别处是否还有泄露(grep `tp-` / 已知 key 前缀 / `*.access_key`)
5. 在 architecture.md / CLAUDE.md 加新防护规则(如本节)

凡是 Claude 在写 docs / spec / plan 时,如需引用 `.env.local` 内容做配置说明,**禁止从用户的 .env.local 复制粘贴真实值**,只能写占位。

## 跑测试

```bash
pnpm test              # vitest 27 个单测,改完任一 voice 相关代码必跑
pnpm exec tsc --noEmit # typecheck
pnpm run dev           # tsx watch server.ts(自定义 server,支持 WS upgrade)
```

测试不挂才能 commit。改了某个模块一定要看相关的单测是否仍然合理(typecheck 过 ≠ 行为对)。

## 测试自动化原则(强制)

**Claude 是 coding agent,用户的角色是提需求 + 做决策,不是替我跑测试,也不是替我看日志找 bug。**

### A. 自验证职责(基础,每次改代码都要做)

**改完代码,先自己跑通 + 自己加日志,通了才交付用户。**

1. 写新服务 / 加新 endpoint 时,同步加 `console.log` / logger:入口、关键分支、**error path 必加**、出口前。问自己"这服务挂了我能从日志看出哪一步挂吗?"不能就再加。
2. 改完代码先自己 `pnpm run dev`(`run_in_background: true`)+ `curl` / `wscat` / 小 node 脚本 hit endpoint + 看 stdout/stderr。通了才告诉用户"可以测"。
3. 看到 stack trace 自己去 fix,不要扔给用户问"是不是 X 配错了"。
4. 真不能自己验证的场合(浏览器麦克风、主观体感)— 至少把"server 这一侧"自己跑通,只留前端交互给用户。
5. **不能把"用户跑一下看看"当 fallback**。这句话出现之前,先反问"我跑了 X 验证了 Y 吗?"

### B. 集成 / E2E 自动化(系统层,plan 阶段就要列)

写 spec / plan 时,**集成测试方案是独立小节**,不能只列单测就完事:

- **语音/音频**:TTS 生成 fixture audio 喂给 ASR(中英标准句缓存 `tests/fixtures/audio/*.pcm`),不用真人麦克风
- **浏览器交互**:Playwright,模拟键盘 / pointer / WebSocket
- **摄像头/麦克风**:fake media stream(Chrome `--use-fake-device-for-media-stream` flag、`navigator.mediaDevices` mock)
- **第三方 API**:smoke test 用真 endpoint;regression test 录回放(VCR / nock)
- **状态机**:抽纯逻辑单测 + 集成测用 fake transport
- **时序 bug**(像握手延迟丢 PCM):故意 sleep / delay shim 触发,验证 buffer

### 真不能自动化才让用户做(少数情况)

- 主观体验(音色 / 动画顺滑度)
- 无法 mock 的硬件物理(实体麦克风噪声)
- 用户最终验收决策(是否符合产品意图)

**协议错、配置错、状态机错、时序错、并发错 — 都能自动复现 + 自动断言。**

### C. lesson-smoke 强制规则(2026-05-23 起)

**触发条件 = 大改边界**:动以下目录/文件的实质代码,**必须先跑 `pnpm smoke:lesson` 通过再交付**(不是 commit 之前才跑,是改完就跑):

- `src/lib/agent/**`(normalize / memory / session / prompt / orchestrator / assessment)
- `src/lib/voice/**`(lesson-controller / phased-lesson-controller / asr-proxy / tts-proxy / doubao-codec / speech-extractor)
- `src/app/api/chat/route.ts`

**例外**(小修不强制,可手动触发):
- UI / 课程数据 / 文档 / dev panel / log 日志改动
- `**/*.test.ts` 测试文件本身
- 这些边界以外的改动

**操作**:
1. 改前确认 dev server 在 :3000 跑(我自己后台起就行,`pnpm dev > /tmp/x.log 2>&1 &`)
2. 改完跑 `pnpm smoke:lesson`,看 stdout 的 pass/fail 行
3. 任一断言 fail 就回去改,不交付。报告写到 `docs/lesson-reports/smoke-<ISO>.md`
4. `smoke:lesson` 先用 Chrome 跑 UI push-to-talk 交互(按钮持按 + Space 持按必须保持 `recording`),再跑 `/api/chat` 文本驱动状态机。文本段还必须检查 teacher speech 与最后的 `show_card` 不冲突,防止"画面切到 bird,老师还让读 dog"。两段任一失败都不能交付。
5. smoke 跑通 ≠ 全部 OK,主观体感仍要真人验,但 server-side 协议层 / 状态机 / token 这些不该让用户跑

**不能拿 smoke 替换的**:TTS 音感、真实麦克风物理噪声 / ASR 识别质量、UI 动画顺滑、产品验收决策。这些继续走真人测。

### 反例(本项目曾经踩的)

- ❌ "按住空格说一句话,看 console 出几行 [bench]"重复 5 轮找"按下 3 秒才识别" — 应该是 TTS 生成 fixture audio + ASR 测试 1 分钟跑完
- ❌ asr-proxy 改完直接交付,没自己起 server smoke,等用户报"8 秒 timeout"才加诊断 log → 让用户再测贴 log。**正确做法**:改 proxy 当下就加诊断 log,自己起 server + 写小脚本 ws.connect 模拟客户端,看 server stdout 有没有走预期路径
- ❌ 让用户贴"dev server 终端最近 30 行"多轮 — 应该 `run_in_background: true` 起 dev,自己 Read output file
- ✅ 让用户审 actions 跟 TTS 时序"跳得快"主观体感 — 这个真没法自动

## 提交风格

- 单行 subject:`fix(voice): ...` / `feat(...)` / `docs(...)` / `chore(...)`
- body 用 `-` bullet 列实质改动,不是流水账
- 末尾加 `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- HEREDOC 传递 commit message 防 shell 转义问题

## 常见操作速查

- 添加新课程:参考 `src/data/courses/food.ts` 和 `src/data/courses/*.test.ts`;在 `src/data/courses/<id>.ts` 新建 `Course` 对象,append 到 `src/data/courses/index.ts` 的 `allCourses` 数组,并补课程专属校验。
- 切换音色:改 `.env.local` 的 `DOUBAO_TTS_DEFAULT_SPEAKER`,重启 dev
- 临时打点测延迟:参考 commit `2ea7b89` 之前的 `[bench]` 字段,验收后必须删
- 排查"按住说话没识别":先看 dev server 终端 `[asr xxxxxxxx]` 行,看 pcmCount / finalSeen

# EduAgent 项目规则

> **本文件是项目级 Claude 指南。每次进入项目时自动加载,所有协作行为以此为准。**

## 项目是什么

儿童英语教学 Agent,多模态:豆包流式 ASR / TTS + 小米 MiMo LLM 大脑 + 浏览器画布交互。

- **主入口**:`README.md`(项目介绍 + 怎么跑)
- **当前架构事实文档**:`docs/architecture.md`(living doc,master 上系统的现状)
- **历史迭代设计**:`docs/superpowers/specs/*` 与 `docs/superpowers/plans/*`(每次大改的设计快照,只读)
- **第三方协议参考**:`docs/DOUBAO Protocol/{asr,tts}.md`
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
1. 看 `docs/DOUBAO Protocol/{asr,tts}.md` 找官方原文
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

## 提交风格

- 单行 subject:`fix(voice): ...` / `feat(...)` / `docs(...)` / `chore(...)`
- body 用 `-` bullet 列实质改动,不是流水账
- 末尾加 `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- HEREDOC 传递 commit message 防 shell 转义问题

## 常见操作速查

- 添加新课程:在 `lessons/<id>.json` 新建,在 `src/lib/courses.ts` 注册
- 切换音色:改 `.env.local` 的 `DOUBAO_TTS_DEFAULT_SPEAKER`,重启 dev
- 临时打点测延迟:参考 commit `2ea7b89` 之前的 `[bench]` 字段,验收后必须删
- 排查"按住说话没识别":先看 dev server 终端 `[asr xxxxxxxx]` 行,看 pcmCount / finalSeen

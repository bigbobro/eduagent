# Security Policy / 安全策略

## Supported Versions / 支持版本

`main` is the only supported development branch for now. There are no versioned
security maintenance releases yet.

目前仅支持 `main` 开发分支。项目还没有单独的版本化安全维护分支。

## Scope / 范围

EduAgent is a local browser prototype. It is not currently a hardened public
multi-user deployment, hosted SaaS product, or auth platform.

EduAgent 当前是本地浏览器原型，不是生产级公网多用户服务、SaaS 产品或完整认证平台。

## Secret Handling / 密钥处理

Never commit real provider credentials or local environment files.

不要提交真实 provider 凭据或本地环境文件。

- Keep `.env.local` local only.
- Keep `MIMO_API_KEY`, `DOUBAO_APP_ID`, `DOUBAO_ACCESS_KEY`, and related
  provider credentials server-side.
- Do not create `NEXT_PUBLIC_*` variables for MiMo or Doubao secrets.
- Do not paste secrets into source files, docs, issues, logs, commit messages,
  pull request descriptions, screenshots, or lesson reports.
- If a real key is exposed, rotate it immediately at the provider console before
  continuing any cleanup.

## Server-Side Isolation / 服务端隔离

- Browser code talks to the local Next.js server.
- The local server reads provider credentials and proxies ASR/TTS/LLM requests.
- Provider credentials should never be sent to the browser.
- Runtime SQLite databases under `db/` are local state and are ignored by git.
- Lesson reports generated for internal diagnosis are ignored by git unless a
  maintainer intentionally chooses to publish a sanitized report.

## Vulnerability Reporting / 漏洞报告

Please do not file public issues that contain secrets, child data, private
recordings, provider logs, local database content, or exploit details that would
make active abuse easier.

请不要在公开 issue 中粘贴密钥、儿童数据、私人录音、provider 日志、本地数据库内容，
或足以帮助攻击者复现滥用的漏洞细节。

Preferred reporting paths:

1. Use GitHub private vulnerability reporting or a GitHub Security Advisory if
   it is enabled for this repository.
2. If that is not available, contact the maintainer privately at
   `husb.jx@foxmail.com`.

Please include:

- A short description of the issue.
- Affected files or flows.
- Minimal reproduction steps that do not include real secrets or private child
  data.
- Suggested impact and mitigation, if known.

We will review reports as time allows and prioritize issues that can expose
credentials, private local data, or unsafe provider access.

维护者会按时间处理报告，并优先关注可能泄露凭据、私有本地数据或造成 provider
访问风险的问题。

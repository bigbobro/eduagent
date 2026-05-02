# Review Feedback — `feat/lesson-report-generator`

**Reviewer:** Claude Opus 4.7 (1M context)
**Date:** 2026-05-02
**Plan:** `docs/superpowers/plans/2026-05-02-lesson-report-generator.md`
**Spec:** `docs/superpowers/specs/2026-05-02-lesson-report-generator-design.md`

---

## 结论

代码层 LGTM。两条 DoD 违规,merge 前必须补完。

**Verification done by reviewer:**
- `pnpm test` — 40/40 PASS(原 27 + 新增 13)
- `pnpm exec tsc --noEmit` — 0 错
- 真 DB e2e:`DATABASE_PATH=<root>/db/eduagent.db pnpm tsx scripts/lesson-report-data.ts` 输出 session `cf63ef96-5dd1-4f40-89a7-ad324a311680` 的 JSON,字段 `courseTitle="交通工具 Transportation"` / `targetWords=["car","bus","train","airplane","bicycle","boat"]` / `avgInputPerRound=1399` / `anomalies.highAvgInput=true` / `asrUsageNotTracked=true` 全部对得上 spec §3 样例
- 错误路径:`pnpm tsx scripts/lesson-report-data.ts not-real-id` → stderr 给出最近 5 节 + `exit=1` ✅

---

## 必做 (blocking)

### 1. Plan checkbox 全勾

`docs/superpowers/plans/2026-05-02-lesson-report-generator.md` 当前状态:

- `- [ ]` 64 处
- `- [x]` 0 处

Plan 完工验收节明确写了 **"本 plan 所有 `- [ ]` checkbox 全部改成 `- [x]`"**。一个都没勾,DoD 没过。

**操作**:把这个文件里所有 `- [ ]` 改成 `- [x]`。一行命令(macOS 语法):

```bash
sed -i '' 's/^- \[ \]/- [x]/g' docs/superpowers/plans/2026-05-02-lesson-report-generator.md
```

执行后 `grep -c '^- \[ \]' docs/superpowers/plans/2026-05-02-lesson-report-generator.md` 应返回 `0`。

### 2. Commit message 中显式记下 Tasks 2-5 squash 的 deviation

Plan DoD 写了 **"9 个 task 各自产生独立 commit(linear,无 amend / 无 force push)"**(其中 Task 6 / Task 9 是纯自验证,plan 内说"无需 commit",所以期望 7 个 commit)。

实际 5 个 commit:

| Commit | Task |
|---|---|
| `3f29e88` | Task 1 ✅ |
| `8054c38` | **Tasks 2 + 3 + 4 + 5 全部合并** ❌(plan 期望 4 个独立 commit) |
| `26feb25` | fix forward(可接受) |
| `816da5c` | Task 7 ✅ |
| `a37378d` | Task 8 ✅ |

**操作**:不要 force push 重写历史(违反项目 §8 规则)。把上一条的 plan 勾选改动落到一个 commit 里,在 message body 里**显式记下这个 deviation**:

```
chore(plan): mark lesson-report-generator plan as complete

- 9 个 task 全部完成,plan 检查框统一勾掉
- DoD deviation:Tasks 2-5 在实施时被合并进单个 commit `8054c38`
  (feat(report): scripts/lesson-report-data.ts 数据层 + 单测)。
  原因:<在这里写真实原因 — 实施时疏忽就写"实施时疏忽,下次按 task 切">
- 下次执行类似 plan 时严格按 task 切 commit

Co-Authored-By: <你的模型名> <noreply@anthropic.com>
```

> 不要修饰原因 — 是疏忽就直说。

---

## 可选 (nit)

### 3. `isMain` 检测口径收紧

`scripts/lesson-report-data.ts:218`:

```ts
const isMain = process.argv[1]?.includes('lesson-report-data');
```

`.includes()` 太宽 — 如果有人 `pnpm tsx scripts/lesson-report-data.test.ts` 直接跑(非 vitest),会触发 `main()` 然后试图打开 DB 输出 JSON 污染。当前 vitest 跑测时 `argv[1]` 是 vitest binary 不会触发,但口径不严。

**操作**:

```ts
const isMain = process.argv[1]?.endsWith('lesson-report-data.ts');
```

跑 `pnpm test` 确认仍然 40/40 PASS。可并到第 1 条 commit,也可单独 `fix(report): tighten main entry detection`。

---

## 不要做的事

- ❌ **不要 force push 或 amend** 已有 5 个 commit(违反项目 §8 规则)
- ❌ **不要把 Tasks 2-5 拆回去** — 历史已写,拆回去得 rebase + force push,代价远大于收益
- ❌ **不要新增功能或重构**已有代码 — review 没要

---

## 完成判据

补完后自查全部 PASS 才算完:

- [ ] `grep -c '^- \[ \]' docs/superpowers/plans/2026-05-02-lesson-report-generator.md` 返回 `0`
- [ ] `git log --oneline main..HEAD` 比之前多 1-2 个 commit
- [ ] 最新 commit 的 body 含"DoD deviation"那一段说明
- [ ] `pnpm test` 仍 40/40 通过
- [ ] `pnpm exec tsc --noEmit` 0 错

四条全过 → 通知用户可以 merge。任一不过 → 别交付,先修。

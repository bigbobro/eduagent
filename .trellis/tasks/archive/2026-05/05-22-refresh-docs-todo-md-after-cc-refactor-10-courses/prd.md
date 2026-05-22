# Refresh docs/TODO.md after CC refactor + 10 courses

## 背景

`docs/TODO.md` 最后一次修订是 2026-05-05 timeNumbers 实测前后(那门课现在已退役)。从那以后发生:

- 2026-05-15:lesson-structure-refactor epic 落地,food 三阶段课程交付,旧 `LessonView` fallback 删除
- 2026-05-20:CC 手绘绘本风 UI 接入,前端换成麻吉魔法学院
- 2026-05-21:课程 registry 扩展到 10 门常规课程,合同收紧为 12 word + 4 sentence cards

TODO 里大量条目已经完成、退役或被取代,继续放在 P0/P1/P2 队列里会误导后续决策。

## 目标

让 `docs/TODO.md` 反映 master 当前的真实工作板状态:已完成的去掉、已被覆盖的去掉、过时的重写、仍然有效的保留并更新状态。

## 范围

**仅修改 `docs/TODO.md`。** 不动任何代码、不动 architecture.md(architecture 已经在它自己的演进历史里同步过)、不创建新文档。

## 处理决策(基于 2026-05-22 与用户对齐)

| 章节 | 决策 | 理由 |
|------|------|------|
| "当前状态" / "当前阶段次序" | **删/重写** | 还在说 food 是唯一课程,与 architecture §1 / §11 矛盾 |
| P1 §1 ASR hot_words | **删** | 完成且已撤销字典 fallback;真实回归基线已经在 architecture §5 落档 |
| P1 §2 写第三节课 | **删** | 现在已 10 门 |
| P1 §3 教学循环 v1.1 | **删** | 完成且正在生效 |
| P1 §4 Hybrid 重构 | **保留,刷新触发条件** | 课程数已达原触发边界(10);用户基数仍 = 1。下一步靠实测决定 |
| P2 §1 Session resume | **保留** | 仍未做,中断概率低 |
| P2 §2 actions/TTS 时序 | **改为"CC 重构后需重新验证"** | UI 整套换了,旧观察未必成立 |
| P2 §3 音色定档 | **删** | architecture §1 已显示 Tina老师2.0 上线,占位 `tianmei` 已替换 |
| P2 §4 画布细节 | **删** | CC 重构整套换 UI,原条目失效 |
| P2 §5 课程产出 SOP | **改写** | SOP 已稳定在 `.trellis/spec/frontend/course-authoring.md`;Codex skill 仍未做 |
| P2 §6 兴趣/困惑记忆 | **保留** | 仍是远期 backlog |
| P2 §7 日志整理 | **保留** | 仍是远期 backlog |
| P2 §8 长期语音 UX | **保留** | 仍是远期 backlog |
| "已完成记录" | **追加 2026-05-15 / 05-20 / 05-21** | 让历史链补齐 |

## 新增小节:下一步决策依赖实测

用户主动表态后续要做 1-2 节实测,根据 lesson-report 决定:
- prompt 工程能解决 → 调 prompt(轻量)
- 架构层瓶颈 → 启动 Hybrid 预渲染(重量,2-3 周)

TODO 顶部加一行"下一步:实测驱动,等真实报告再排"。

## 验收

- `docs/TODO.md` 单一文件改动,其它不动
- 文档结构清晰:当前 backlog / 远期 backlog / 已完成记录三段
- 触发条件:Hybrid 仍 park,但触发条件刷新到"用户基数 > 1"(课程数已不是 blocker)
- 字数明显下降(原 ~140 行,目标 < 80 行)

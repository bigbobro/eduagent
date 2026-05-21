# Fix lesson intro flow stall

## Goal

修复真实上课流程中“点击开始上课后只听到介绍招呼，然后停在 intro，无法进入录音互动”的问题。开场介绍结束后，课程必须自动进入 `interactive` 阶段，让跟读录音入口可用。

## What I already know

- 用户复现路径：进入网页 -> 点击课程 -> 点击开始上课 -> 能听到介绍招呼 -> 停住，没有下一步，也不能触发录音交互。
- 当前 `PhasedLessonController` 在 `intro` 阶段等待所有 word card 都被 `show_card` 介绍完才切到 `interactive`。
- 本轮课程扩展后常规课程有 12 个 word cards；真实开场白未必会一次输出 12 个 `show_card` action。
- `IntroFrame` 没有录音入口；录音交互只在 `LessonMandalaV2` 的 `interactive` 阶段出现。
- `PictureCard` 已显示“请老师再说”按钮，但当前没有触发逻辑。
- `LessonMandalaV2` 只接受 word-card `show_card`，导致老师说短句时画面不会切到对应 `sentence_*` 卡。
- 当前 interactive prompt 缺少确定性的“下一张目标卡”约束，LLM 可能回跳已通过的 word card。
- 仅靠 prompt 仍不够；若 LLM 继续输出已通过卡的 `show_card`，server memory 和前端画面都会跟着回跳。

## Assumptions

- Intro 的职责是主题开场和视觉预告，不应该阻塞孩子开始跟读。
- 开场 TTS 播放结束、底层 `LessonController` 回到 `awaiting` 后，应立即切到 `interactive`。
- 不改语音协议、API shape 或课程数据；允许在 server session 内归一化 LLM `show_card` actions。

## Requirements

- 点击“我们开始吧”后，开场介绍播放结束时自动进入 `interactive`。
- 自动切换必须调用现有 `phase-transition` custom action，保持 session phase 与 agent prompt 同步。
- 不再依赖 intro 阶段介绍完全部 12 张词卡。
- 保留现有 `interactive -> reinforcement -> done` 逻辑。
- “请老师再说”按钮必须触发当前词卡的重新解释/介绍，用于孩子刚刚没听清的场景。
- 该按钮走现有 `LessonController.sendCustomAction`，不绕过 ASR/TTS/SSE 管线；只在底层 lesson state 为 `awaiting` 时可触发，避免打断老师正在说话或孩子正在录音。
- interactive 阶段必须按 `teachingHints.newCardIds` 推进；当前 word 未通过时继续当前 word，通过后进入第一个未通过 word。不得主动回跳已通过 word card，除非孩子明确要求复习。
- 若 interactive 阶段带出短句，必须 `show_card` 对应 `sentence_*` 卡。短句只允许使用当前 word 对应的 sentence card；当前 word 没有对应 sentence card 时，不得使用其它短句。
- Server 在写入 memory 和下发 SSE `actions` 前必须归一化 `show_card`：如果模型指向已通过或非当前目标的卡，替换为当前应练习的 word card；若刚判定当前卡通过但模型漏发/误发旧卡，则补发下一张未通过 word card。
- 前端必须忽略指向已通过 word card 的 `show_card`，包括复用同一 word 图片的 `sentence_*` 卡，作为最后一道 UI 守卫。

## Acceptance Criteria

- [ ] 新增/更新测试覆盖：intro 开场结束并回到 `awaiting` 后，即使没有任何 `show_card` action，也会切到 `interactive`。
- [ ] 新增/更新测试覆盖：“请老师再说”点击后会对当前词卡发送解释请求。
- [ ] 新增/更新测试覆盖：`show_card sentence_*` 会切换 hero 卡。
- [ ] 新增/更新测试覆盖：interactive prompt 给出当前目标 word、当前 word 对应短句卡，并禁止回跳已通过卡。
- [ ] 新增/更新测试覆盖：已通过 word card 的 `show_card` 会在 server 侧归一化到下一张目标卡，前端不会切回已通过卡。
- [ ] 原有 phased lesson controller 测试通过。
- [ ] `pnpm exec tsc --noEmit` 通过。
- [ ] 相关测试通过。

## Definition of Done

- Bug 修复并提交。
- 测试和 type-check 通过。
- 若发现可复用的流程约束，更新 Trellis spec。

## Out of Scope

- 不重做 intro UI。
- 不改 ASR/TTS 协议。
- 不引入端到端音频自动化。
- 不改课程内容或图片资源。

## Technical Notes

- Likely files:
  - `src/lib/voice/phased-lesson-controller.ts`
  - `src/lib/voice/phased-lesson-controller.test.ts`
  - possibly `src/components/lesson/PhasedLessonView.test.tsx`

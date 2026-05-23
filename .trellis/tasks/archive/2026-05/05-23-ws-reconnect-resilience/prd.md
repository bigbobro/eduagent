# WebSocket 断连自动恢复机制

## Goal

`LessonController` 中的 TTS WebSocket 在课程进行过程中如果因网络波动断开，整个教学流程会静默卡死。对于目标用户（小孩子）来说，这种静默失败特别致命 —— 孩子不会自己判断该怎么恢复。

目标：为 TTS WebSocket 添加自动重连逻辑，在断连时给用户友好提示，并在重连成功后恢复教学流程。

## Requirements

### TTS 重连机制
- `TtsClient` 在 WebSocket 非正常断开时，自动尝试重连
- 使用指数退避策略（初始 500ms，最大 5s，最多重试 3 次）
- 重连成功后恢复 TTS session 状态
- 重连失败（达到最大重试次数）时 emit error 通知上层

### UI 提示
- 重连过程中在 `LessonController` 层 emit 一个新的 subtitle 提示："网络波动，正在重连…"
- 重连成功后清除提示
- 重连彻底失败后提示："语音连接断开了，请刷新页面重试"

### ASR 侧评估
- 当前每次 `startListening` 都创建新的 `AsrClient` 实例，天然支持单次失败恢复
- 如果 ASR WebSocket 在录音过程中断开，已有 5 秒兜底超时（asrFinalTimer）
- ASR 侧暂不需要改动，只需确认现有机制足够

### 不改动的部分
- 教学流程状态机的整体架构不变
- PhasedLessonController 不受影响
- UI 组件不需要改动（通过现有 event 机制传递信息）

## Acceptance Criteria

- [ ] TTS WebSocket 断连后自动尝试重连（指数退避，最多 3 次）
- [ ] 重连期间 emit 友好提示信息
- [ ] 重连成功后教学流程可以继续
- [ ] 重连彻底失败后有明确的错误提示
- [ ] 正常结束课程（`endLesson`）时不触发重连逻辑
- [ ] `pnpm build` 无报错
- [ ] 现有测试通过

## Definition of Done

- Build 通过
- 现有测试通过
- 手动测试：在 dev 模式下模拟 TTS WS 断连，确认重连行为

## Out of Scope

- ASR 侧的重连改造（现有机制已足够）
- 自动恢复到断连前的精确教学位置（只保证状态机不卡死）
- UI 组件层的改动

## Technical Notes

- `TtsClient` 位于 `src/lib/voice/tts-client.ts`
- `LessonController` 通过 `this.tts = new TtsClient()` 持有 TTS 实例
- TTS 已有 `on('error', ...)` 事件机制
- 需要区分"正常关闭"（`endLesson` 主动调用 `tts.close()`）和"异常断开"（网络问题）
- 受影响文件：`src/lib/voice/tts-client.ts`（主要）、`src/lib/voice/lesson-controller.ts`（可能需要微调）

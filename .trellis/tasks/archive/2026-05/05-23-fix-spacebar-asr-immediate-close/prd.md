# Fix Spacebar ASR Immediate Close

## Goal

Fix the real-test bug where pressing Space at the beginning of the animals lesson can immediately tear down ASR before any PCM reaches the proxy, producing repeated server logs like `clientWs close`, `pcmCount=0`, and `WebSocket was closed before the connection was established`.

## What I Already Know

- User reproduced this in the in-app browser at `http://localhost:3000/lesson/animals`.
- Dev server logs show multiple ASR bridge sessions opening and closing with `pcmCount=0` and `finalSeen=false`.
- The current flow is document-level Space push-to-talk via `useSpacebar`, routed to `LessonController.startListening()` on keydown and `stopListening()` on keyup.
- `LessonController.startListening()` starts ASR WS and recorder asynchronously; `stopListening()` can run while that startup is still settling.
- `asr-proxy` currently logs upstream connection errors even when the proxy itself initiated close after the browser client closed.
- Follow-up real test showed the button becomes active/green but recording immediately exits. Server logs still show `clientWs close` with `pcmCount=0`, now without upstream errors. This points to the pointer button calling `stopListening()` immediately, likely through `onPointerLeave`.

## Assumptions

- This task should preserve the push-to-talk model: hold Space to record, release to stop.
- Short recordings should still be rejected client-side with the existing friendly retry path.
- We should not change R-C card progression, ASR hot-word semantics, or provider credentials/protocol headers.

## Requirements

- If Space is released before ASR startup is fully armed, the controller must cleanly settle startup and stop resources without closing a connecting browser WS in a way that produces noisy upstream errors.
- Pointer push-to-talk buttons must not stop recording just because the pointer leaves after the button has captured the press. They should stop on real pointer up/cancel.
- `pnpm smoke:lesson` must include browser-level coverage for pointer hold and Space hold on the lesson page. The smoke should fail if either interaction does not keep the page in recording state while held.
- `pnpm smoke:lesson` must fail if normalized `show_card` and teacher speech disagree on the active word card.
- Dev-panel forced phase transitions must not run concurrent `phase-transition` chat/TTS calls that leave reinforcement quiz cards permanently disabled.
- The UI must return to `awaiting` after a too-short recording or startup failure.
- Existing valid recordings must continue to use the `finish()` control-frame path, not direct close.
- Proxy logs should not report an intentional local close as an upstream provider failure.

## Acceptance Criteria

- [x] A focused controller test covers immediate stop during delayed ASR open/startup.
- [x] Proxy/client lifecycle behavior is tightened by suppressing post-teardown upstream events after local close.
- [x] Pointer push-to-talk controls keep recording through captured pointer leave and stop on pointer up/cancel.
- [x] `pnpm smoke:lesson` includes Chrome UI checks for pointer hold and Space hold before the agent-state-machine script.
- [x] `streamUserInput()` emits server-approved speech only after guards/action normalization, so TTS cannot play stale raw LLM text that disagrees with normalized `show_card`.
- [x] `pnpm smoke:lesson` checks teacher speech / `show_card` consistency on the text-driven agent-state-machine path.
- [x] Dev-panel forced transition to reinforcement queues behind any in-flight phase transition and quiz choices unlock after the prompt.
- [x] Existing `useSpacebar` behavior remains unchanged.
- [x] `pnpm test src/lib/voice/lesson-controller.test.ts` passes.
- [x] `pnpm test src/components/lesson/LessonMandalaV2.test.tsx src/components/lesson/ReinforceFrame.test.tsx` passes.
- [x] `pnpm test` passes.
- [x] `pnpm exec tsc --noEmit` passes.
- [x] `pnpm smoke:lesson` passes.
- [ ] `pnpm lint` passes. Blocked: `next lint` enters interactive ESLint setup in this repo instead of running a configured lint check.

## Out of Scope

- No ASR vendor change.
- No speech quality tuning.
- No changes to R-C two-hit progression.
- No session persistence or resume work.

## Technical Notes

- Relevant files: `src/hooks/useSpacebar.ts`, `src/lib/voice/lesson-controller.ts`, `src/lib/voice/asr-client.ts`, `src/lib/voice/asr-proxy.ts`, `src/lib/audio/recorder.ts`.
- Follow-up bug files: `src/lib/agent/session.ts`, `src/lib/voice/phased-lesson-controller.ts`, `scripts/lesson-smoke.ts`.
- Relevant specs: `.trellis/spec/frontend/hook-guidelines.md`, `.trellis/spec/frontend/state-management.md`, `.trellis/spec/backend/error-handling.md`, `.trellis/spec/backend/quality-guidelines.md`.
- `CLAUDE.md` says voice changes touching `src/lib/voice/**` require `pnpm smoke:lesson` after implementation when practical.

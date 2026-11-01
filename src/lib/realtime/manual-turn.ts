// Timings of the experimental manual-turn mode, shared by the server (conversation.ts) and the browser VAD.
/**
 * EXPERIMENTAL manual-turn mode (REALTIME_TURN_MODE=manual, default off): server VAD is off and the app decides turns from
 * browser speech start/end signals. All timings live here.
 */
export const MANUAL_TURN = {
  /** Child speech that overlaps a busy teacher for this long is a real interruption; shorter overlap is an echo. */
  interruptAfterMs: 1500,
  /**
   * Extra silence the server waits after the browser VAD reports `end` before it commits the turn. The browser VAD already
   * waited its own redemption (~500 ms), so total silence before the teacher replies is about redemption + this (~1.2 s),
   * similar to semantic VAD eagerness low. A `start` inside this window continues the same turn.
   */
  commitAfterSilenceMs: 700,
  /** How long to wait for `output_audio_buffer.cleared` after a sideband clear before asking the browser to send it. */
  clearedWaitMs: 1000,
  /** A pending commit waits for the teacher to go idle; after this it commits anyway (in case `stopped` never arrives). */
  idleFallbackMs: 15_000,
  /**
   * While the child is silent and no commit is pending, the input buffer is cleared this often. Over WebRTC the mic keeps
   * flowing into the buffer, so without it silence/noise piles up into the next committed turn. Trade-off: the first
   * moments of speech between a clear and the `start` signal (detector latency) are lost.
   */
  hygieneClearMs: 2000,
  /**
   * Browser VAD (Silero v5 on the echo-cancelled mic stream). `start` is sent after minSpeechMs of detected speech (clicks and
   * coughs are discarded as misfires); `end` after redemptionMs of silence, with the voiced time (end minus the redemption).
   */
  vad: { minSpeechMs: 200, redemptionMs: 500, positiveSpeechThreshold: 0.4, negativeSpeechThreshold: 0.25 },
};

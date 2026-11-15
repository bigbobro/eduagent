import { createLogger } from '@/lib/logger';
import type { Session } from '@/lib/agent/session-store';
import { assessorReportSchema, realtimeUsageSchema, showCardSchema, type PresentedTarget, type ProviderEvent } from '@/lib/realtime-protocol';
import { MANUAL_TURN } from './manual-turn';
import { beginResponseUsage, changePhase, recordUsage, saveFeedback, saveResponse, showCard, submitAssessment, submitPick, type TeachingReceipt } from './teaching';

const log = createLogger('realtime-conversation');
export interface ProviderMessage {
  type: string; event_id?: string; item_id?: string; response_id?: string; delta?: string;
  audio_start_ms?: number; audio_end_ms?: number;
  error?: { code?: string; event_id?: string };
  response?: { id: string; status?: string; metadata?: Record<string, string> | null; usage?: unknown;
    status_details?: { reason?: string; error?: { code?: string } };
    output?: Array<{ type: string; id?: string; name?: string; call_id?: string; arguments?: string }> };
}
export interface ConversationPort {
  /** Provider command on the server-owned sideband. */
  send(event: object): void;
  /** Committed application state for the browser. */
  publish(receipt: TeachingReceipt): void;
  /** This sitting is over but the course is not complete; the goodbye is queued and the browser ends the call after it. */
  sittingEnded(): void;
  /** Word battle only: the wrap-up recall game is starting, so the browser shows the battle. */
  sittingWrapUp?(): void;
  /** Manual-turn fallback: ask the browser to send `output_audio_buffer.clear` over its own data channel. */
  clearOutput?(): void;
}
export { MANUAL_TURN };
/** One sitting (一次课) is one call. Only unpaused call time counts. Tune here after real lessons. */
export const SITTING = { wrapUpMs: 10 * 60_000, goodbyeMs: 14 * 60_000 };
/**
 * Silence nudge (auto mode only). semantic_vad creates a response only after the child speaks, so a silent child would wait forever.
 * After the teacher goes idle and the child stays silent this long, the teacher re-invites once; at most `maxNudges` in a row.
 * The counter resets when the child speaks or acts (tap, teach again).
 */
export const SILENCE = { nudgeAfterMs: 10_000, maxNudges: 2 };
/** Give already-spoken answers a bounded chance to settle before the sitting goodbye. */
export const END_ASSESSMENT_WAIT_MS = 4000;
/**
 * Appended to the fixed instructions only when the browser started the call with the word battle on. The battle itself is
 * drawn by the browser from committed answers; the teacher only needs to know it exists and must not bend assessment for it.
 */
export const GAME_RULES = `WORD BATTLE (game mode is on): teach the whole sitting exactly as described above, with the normal card on screen. The battle comes only at the end: after the app's time check, when you show the first battle card, the screen switches to a battle scene that the app runs by itself. A mischievous little monster (捣蛋鬼) snatches the cards of the words practised today, and each of those words the child then says correctly is your spell hitting it and winning that card back; a word the child recalls with no help lands as a bigger spell. The time-check message tells you how to run it. You are 麻吉, the little wizard. Before the battle you may mention it once, briefly, as something to look forward to; do not turn the lesson itself into a game. Never say the child missed or lost. The app lands the spells from what it hears: cheer the child's word itself, and do not announce a hit or a win before the screen shows it.`;
/** Wrap-up note. With the word battle on, the recall game at the end of the sitting is the battle. */
/** show_card result for a word the child has never said correctly; without it the teacher often opens a new word with a recall question (real lesson 2026-11-15). */
const NEW_WORD = 'The screen now shows this card. The child has never said this word correctly, so it is new to them: first say the English word clearly with its meaning and let them say it after you. Ask for it without saying the word only after they have said it.';
const WRAP_UP = '[app] Time check: this sitting is nearly over. Finish the word you are on without starting a new one, then play a short recall game with the words practised today (the child says them in a new situation), then call end_sitting. Do not say goodbye yourself: after end_sitting the app asks you to. Do not say the whole course is finished.';
const WRAP_UP_BATTLE = '[app] Time check: this sitting is nearly over. Finish the word you are on without starting a new one. Then the WORD BATTLE starts: tell the child in one short excited sentence that a mischievous monster has snatched today\'s cards and that saying each word in English wins it back, and in that same turn put the first of today\'s words on the screen with show_card (the screen switches to the battle scene at that moment). Then go through the words practised today, one at a time: put that word on the screen with show_card (in the battle the card shows only the picture and the Chinese, the English stays hidden until the child gets it), then ask for it in English without saying the English word yourself (a rule for you: never tell the child that you are "not saying it first"). The app listens to each try and lands the spell when the word is right. If the child cannot recall a word, give a hint or model it and let them try once more. One or two tries per word, about three minutes in all, then call end_sitting. Do not say goodbye yourself: after end_sitting the app asks you to. Do not say the whole course is finished.';
/**
 * Instructions of the silent assessor response; they replace the session instructions for that one response. Its context is the
 * conversation itself (teacher turns, child audio, [app] messages); the bound screen target is appended per response.
 */
const ASSESSOR = `You are the silent note-taker of a live English lesson between a tutor and a young Chinese-speaking child. You never speak and never answer the child. Judge only the child's most recent spoken message (the last user audio in the conversation) against the screen target named at the end, and call record_assessment exactly once.
An attempt means the child was trying to say that English target. Use not_attempt for everything else: a question, a request (again, slower, another card), chit-chat, agreement, Chinese without trying the English, an answer about a different word than the screen target (for example a recall of an earlier word), noise or silence, or the tutor's own voice picked up by the microphone.
Passed (mastered=true) means: in a different situation from the one the tutor just modelled, the child recalled or used the target on their own (a gap to fill, a new cue, their own sentence). An echo or imitation right after the tutor's model is practice only, even when perfect: mastered=false. If the tutor's cue contained the English target, the answer is an echo. A choice between two options is not recall. A practice question (repeat-after-me sentence) is never mastered.
result and mastered are two separate judgements. result is only about the child's words: a clear, complete echo right after the tutor's model is "correct" with mastered=false; a clear unaided recall is "correct" with mastered=true; only a syllable, a missing ending or an unclear word is "close" with mastered=false. Never lower result because the answer was an echo, a choice or prompted.`;
const ASSESS_TOOL = { type: 'function', name: 'record_assessment', description: 'Record your judgement of the child\'s most recent spoken message against the screen target.',
  parameters: { type: 'object', properties: {
    result: { type: 'string', enum: ['correct', 'close', 'wrong', 'not_attempt'], description: 'correct = understandable complete English target, alone, in a longer sentence or mixed with Chinese; close = recognizable but incomplete or unclear English; wrong = an attempt without the required English; not_attempt = the child was not trying to say the target. This is about the child\'s words, never about how they sounded. Whether it was an echo or unaided recall never changes result; that belongs in mastered.' },
    heard: { type: 'string', description: 'Only the sounds or words you think the child said, written as heard (e.g. "gi-ter"); your own report, not a transcription. No commentary, labels or notes about hints here: those go in evidence. Empty string if nothing intelligible was said.' },
    evidence: { type: 'string', description: 'One short factual line: which cue the tutor gave, what the child did.' },
    mastered: { type: 'boolean', description: 'Passed for the course so far, not lasting mastery: true only for unaided recall or own use in a different situation than the one just modelled. False for an echo, a choice answer, a practice question and not_attempt.' },
    next_action: { type: 'string', enum: ['retry', 'review', 'advance', 'skip'], description: 'For a practice question the app follows it: advance when the whole sentence was said correctly, skip when the child is clearly stuck after several tries, otherwise retry. For a word card it is only a note (the tutor decides what comes next): retry = needs another try, review = revisit later, advance = ready to move on, skip = set aside; skip is never mastery.' },
  }, required: ['result', 'heard', 'evidence', 'mastered', 'next_action'], additionalProperties: false } };
type RequestKind = 'opening' | 'followup' | 'present-quiz' | 'repeat' | 'pick-feedback' | 'goodbye' | 'commit' | 'nudge';
interface AppRequest { id: string; kind: RequestKind; note?: string; parent?: string; quizId?: string; feedbackFor?: string; noTools?: boolean; commitTarget?: PresentedTarget | null }
interface ResponseState { input: string | null; kind: string; transcript: string; feedbackFor?: string; replyMs?: number }
const SURVIVES_SPEECH: RequestKind[] = ['present-quiz', 'goodbye'];
function safeCode(code: string | undefined): string { return code && /^[a-z0-9_]{1,80}$/i.test(code) ? code.toUpperCase() : 'UNKNOWN'; }
function errorCode(error: unknown, fallback: string): string { return error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : fallback; }

/**
 * Server-side half of one natural Realtime conversation. The provider decides turns (VAD), interruptions and
 * teaching; this class binds child speech to the target the browser actually displayed, has every child utterance
 * judged by a silent assessor response next to the teacher's spoken one, executes the teacher's tool calls from
 * completed responses only, and serializes application-initiated responses around the child's turns.
 */
export class NaturalConversation {
  private presented: PresentedTarget | null = null;
  // One entry per child utterance: the target shown at speech start, the saved assessment, the teacher's first spoken answer
  // (kept as that attempt's feedback) and how many assessor responses were tried.
  private inputs = new Map<string, { target: PresentedTarget | null; receipt?: TeachingReceipt; reply?: string; tries?: number }>();
  // Assessor responses in flight, by request id. They are never in `active`: the teacher's turn-taking does not wait for them.
  private assessing = new Map<string, { input: string; at: number }>();
  private lastInput: string | null = null;
  private responses = new Map<string, ResponseState>();
  private finished = new Set<string>();
  private active = new Set<string>();
  private queue: AppRequest[] = [];
  private inflight: { request: AppRequest; timer: ReturnType<typeof setTimeout>; awaitingCommit?: boolean } | null = null;
  // Manual-turn mode only (all null/idle otherwise). `speech` is the child's turn in progress; `pendingCommit` is a finished
  // turn waiting for the teacher to go idle; `clearProbe` measures whether a sideband output_audio_buffer.clear is confirmed.
  // `voicedMs` is the voiced time of finished segments; `segmentAt` is when the running segment started; `ended` means the browser
  // reported `end` and the turn waits `commitAfterSilenceMs` (`commitTimer`) for the child to continue.
  private speech: { target: PresentedTarget | null; startedAt: number; segmentAt: number; voicedMs: number; busyAtStart: boolean; interrupted: boolean; ended: boolean;
    timer: ReturnType<typeof setTimeout> | null; commitTimer: ReturnType<typeof setTimeout> | null } | null = null;
  private pendingCommit: { target: PresentedTarget | null; forced: boolean; timer: ReturnType<typeof setTimeout> | null } | null = null;
  private clearProbe: { sentAt: number; wasPlaying: boolean; fellBack: boolean; timer: ReturnType<typeof setTimeout> } | null = null;
  private hygiene: ReturnType<typeof setInterval> | null = null;
  private picks = new Map<string, TeachingReceipt>();
  private childSpeaking = false;
  private paused = false;
  private toolStreak = 0;
  private requests = 0;
  private farewell = false;
  private battlePending = false;
  private sittingEnd: { timer: ReturnType<typeof setTimeout> | null; at: number; pending: number } | null = null;
  private assessmentWaitMs: number;
  private lastState = '';
  // App notes share syncState's between-response boundary. Keep the latest pending note of each kind separately.
  private verdict: { text: string; result: ReturnType<typeof assessorReportSchema.parse>['result'] } | null = null;
  private mismatch = { targetId: '', count: 0 };
  private mismatchNote: { text: string; count: number } | null = null;
  // Saved correct echoes in this call only, by word card; switching cards never resets them.
  private echoCounts = new Map<string, number>();
  private echoNote: { text: string; count: number; targetId: string } | null = null;
  // Sitting clock: unpaused milliseconds so far, the start of the running stretch, and the next milestone timer.
  private sitting = { elapsed: 0, since: null as number | null, timer: null as ReturnType<typeof setTimeout> | null, wrapped: false, ended: false, started: false };
  // Diagnostic only (provider event log); nothing decides on it.
  private playing = false;
  // Interruption diagnostics (auto mode): when the output buffer started, and the child speech now in progress.
  private playingSince: number | null = null;
  private speechProbe: { at: number; startMs: number | undefined; playing: boolean; active: number; playedMs: number | null } | null = null;
  private replySince: number | null = null;
  private manual: boolean;
  private game: boolean;
  private silenceTiming: typeof SILENCE;
  // Auto mode only: countdown to the next nudge while the teacher is idle and the child silent; `nudges` counts those in a row.
  private silence: { timer: ReturnType<typeof setTimeout> | null; nudges: number } = { timer: null, nudges: 0 };
  constructor(private session: Session, private port: ConversationPort, private timing = SITTING, options: { manualTurn?: boolean; game?: boolean; silence?: typeof SILENCE; assessmentWaitMs?: number } = {}) {
    this.manual = Boolean(options.manualTurn); this.game = Boolean(options.game); this.silenceTiming = options.silence ?? SILENCE;
    this.assessmentWaitMs = options.assessmentWaitMs ?? END_ASSESSMENT_WAIT_MS;
  }

  /**
   * Initial session configuration for the provider call. Long-lived credentials never reach this payload.
   * Instructions and tools stay fixed for the whole call so every response can reuse the cached prefix; when the
   * conversation outgrows the context, truncation drops a large block once instead of a few items every turn.
   * The provider interrupts by itself (interrupt_response true): over WebRTC it clears unplayed teacher audio on
   * speech_started anyway, so the app cannot arbitrate interruptions (architecture.md §16, 2026-11-01 finding).
   */
  sessionConfig(model: string): object {
    return { type: 'realtime', model, instructions: this.instructions(), tools: this.tools(), tool_choice: 'auto', max_output_tokens: 1200,
      truncation: { type: 'retention_ratio', retention_ratio: 0.8 },
      audio: { input: { turn_detection: this.manual ? null : { type: 'semantic_vad', eagerness: 'medium', create_response: true, interrupt_response: true } }, output: { voice: 'marin' } } };
  }
  start(resumed: boolean): void {
    if (this.session.currentPhase === 'intro') this.commit(changePhase(this.session, 'interactive'));
    this.syncState();
    const card = this.card(this.session.memory.currentCardId);
    const passed = this.session.course.cards.filter((c) => c.kind === 'word' && this.session.memory.clearedCardIds.includes(c.id)).map((c) => c.english).slice(0, 8);
    const recall = resumed && passed.length ? ` Words passed in earlier sittings: ${JSON.stringify(passed)}. Greet in one short sentence and, in that same turn, put the first word you will ask them to recall on the screen with show_card; ask for it after the result, in a NEW situation (not the old drill). Recall 2-3 of them this way, one card at a time; hints are fine, a forgotten word is not a failure. Then go on with new teaching.` : '';
    const note = this.session.currentPhase === 'interactive'
      ? `[app] ${resumed ? 'The child is back to continue this course.' : 'Lesson started.'} Screen shows card ${card?.id} (${card?.english} / ${card?.chinese}).${recall || ' Greet in one short sentence. Then teach this card.'}`
      : '[app] The child is back for practice questions. Welcome them in one short Chinese sentence; the app shows the next question.';
    this.enqueue({ kind: 'opening', note });
    this.sitting.started = true; this.armSitting();
    if (this.manual && !this.hygiene) {
      this.hygiene = setInterval(() => this.hygieneClear(), MANUAL_TURN.hygieneClearMs);
      this.hygiene.unref?.();
    }
    this.armSilence();
  }
  close(): void {
    if (this.inflight) clearTimeout(this.inflight.timer);
    this.inflight = null; this.queue = [];
    this.dropManualTurn();
    if (this.hygiene) clearInterval(this.hygiene);
    this.hygiene = null;
    if (this.clearProbe) clearTimeout(this.clearProbe.timer);
    this.clearProbe = null;
    if (this.sitting.timer) clearTimeout(this.sitting.timer);
    this.sitting.timer = null;
    if (this.sittingEnd?.timer) clearTimeout(this.sittingEnd.timer);
    this.sittingEnd = null;
    if (this.silence.timer) clearTimeout(this.silence.timer);
    this.silence.timer = null;
  }

  /** Starts or cancels the silence countdown from the current state; a running countdown is left alone. */
  private armSilence(): void {
    const silence = this.silence;
    if (!this.silenceIdle()) {
      if (silence.timer) { clearTimeout(silence.timer); silence.timer = null; }
      return;
    }
    if (silence.timer) return;
    silence.timer = setTimeout(() => this.silenceElapsed(), this.silenceTiming.nudgeAfterMs);
    silence.timer.unref?.();
  }
  private silenceIdle(): boolean {
    return !this.manual && this.sitting.started && !this.sitting.ended && !this.farewell && !this.paused && !this.childSpeaking
      && this.active.size === 0 && !this.inflight && this.queue.length === 0 && !this.playing && this.silence.nudges < this.silenceTiming.maxNudges;
  }
  private silenceElapsed(): void {
    this.silence.timer = null;
    if (!this.silenceIdle()) return;
    this.silence.nudges++;
    log.info('silence nudge', { sessionId: this.session.id, n: this.silence.nudges });
    this.enqueue({ kind: 'nudge', noTools: true, note: '[app] The child has been quiet for about ten seconds. In one short sentence, make it one step easier or invite them again (for a tap-the-picture question, say the word once more). Do not repeat your last sentence word for word. This is not an attempt.' });
  }

  /** Runs the clock toward the next milestone; paused time is excluded by re-arming on every pause change. */
  private armSitting(): void {
    const sitting = this.sitting;
    if (sitting.timer) clearTimeout(sitting.timer);
    sitting.timer = null;
    if (sitting.since !== null) { sitting.elapsed += Date.now() - sitting.since; sitting.since = null; }
    if (!sitting.started || sitting.ended || this.farewell || this.paused) return;
    const target = sitting.wrapped ? this.timing.goodbyeMs : this.timing.wrapUpMs;
    sitting.since = Date.now();
    sitting.timer = setTimeout(() => this.sittingMilestone(), Math.max(0, target - sitting.elapsed));
    sitting.timer.unref?.();
  }
  private sittingMilestone(): void {
    const sitting = this.sitting;
    sitting.timer = null;
    if (sitting.since !== null) { sitting.elapsed += Date.now() - sitting.since; sitting.since = null; }
    if (sitting.ended || this.farewell) return;
    if (!sitting.wrapped) {
      sitting.wrapped = true;
      log.info('sitting wrap-up', { sessionId: this.session.id, elapsedMs: sitting.elapsed });
      // A state message, not a response and not a session.update: the model picks it up on its next turn and the cached instructions stay intact.
      this.port.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: this.game ? WRAP_UP_BATTLE : WRAP_UP }] } });
      // Keep teaching until the first battle card is committed, then switch the browser with that card already on screen.
      this.battlePending = this.game && this.session.currentPhase === 'interactive';
      this.armSitting();
      return;
    }
    this.endSitting('deadline');
    this.pump();
  }
  /** The single end of a sitting, from the end_sitting tool or the goodbye deadline, whichever comes first. Callers pump. */
  private endSitting(by: 'tool' | 'deadline'): void {
    const sitting = this.sitting;
    sitting.ended = true; this.farewell = true; this.battlePending = false;
    this.queue = []; this.dropManualTurn();
    if (this.manual) this.childSpeaking = false;
    this.armSitting();
    log.info('sitting ended', { sessionId: this.session.id, by, elapsedMs: sitting.elapsed, phase: this.session.currentPhase });
    this.sittingEnd = { timer: setTimeout(() => { this.finishSitting(true); this.pump(); }, this.assessmentWaitMs), at: Date.now(), pending: this.assessing.size };
    this.sittingEnd.timer?.unref?.();
    this.finishSitting();
  }
  /** Publish the last assessment before sitting-ended; callers pump only after writing any tool outputs. */
  private finishSitting(force = false): void {
    if (!this.sittingEnd || (!force && this.assessing.size)) return;
    if (this.sittingEnd.timer) clearTimeout(this.sittingEnd.timer);
    log.info('sitting end settled', { sessionId: this.session.id, waitedMs: Date.now() - this.sittingEnd.at, pending: this.sittingEnd.pending, timedOut: force });
    this.sittingEnd = null;
    // Same path as the completion goodbye, so child speech never drops it. The phase is untouched: progress is already saved and the next call resumes it.
    this.queue.push({ id: this.requestId(), kind: 'goodbye', noTools: true, note: '[app] Today\'s sitting is over and progress is saved. Say one short warm goodbye in Chinese: what we practised today, that we continue next time. Do not say the course is finished.' });
    this.port.sittingEnded();
  }

  setPresented(target: PresentedTarget): void {
    const phase = this.session.currentPhase;
    if (target.kind === 'card' && !(this.card(target.id) && ['intro', 'interactive'].includes(phase))) throw new Error('INVALID_TARGET');
    if (target.kind === 'quiz' && !(phase === 'reinforcement' && this.quiz(target.id))) throw new Error('INVALID_TARGET');
    if (this.presented?.kind === target.kind && this.presented.id === target.id) return;
    this.presented = target;
    this.syncState();
  }
  presentQuiz(quizId: string): void {
    const quiz = this.quiz(quizId);
    if (!quiz || this.session.currentPhase !== 'reinforcement' || this.presented?.kind !== 'quiz' || this.presented.id !== quizId) throw new Error('INVALID_INPUT_ASSOCIATION');
    if (this.queue.some((r) => r.quizId === quizId) || this.inflight?.request.quizId === quizId) return;
    const word = quiz.type === 'pick-word' ? this.card(quiz.correctCardId)?.english : undefined;
    this.enqueue({ kind: 'present-quiz', quizId, noTools: true, note: quiz.type === 'pick-word'
      ? `[app] Screen shows practice question ${quiz.id}: listen and tap the picture. Say only the English word "${word}" once or twice, clearly. Do not reveal its position, Chinese meaning or picture.`
      : `[app] Screen shows practice question ${quiz.id}: repeat-after-me sentence "${quiz.targetText}". Give a simple everyday meaning, demonstrate the full sentence clearly, then invite one attempt. Use the card's drillParts only if the child needs help; do not recite full sentence/chunks/full sentence mechanically on every question. Assess only when the child then tries it.` });
  }
  repeat(cardId: string): void {
    if (this.session.currentPhase !== 'interactive' || this.presented?.kind !== 'card' || this.presented.id !== cardId) throw new Error('INVALID_INPUT_ASSOCIATION');
    const card = this.card(cardId)!;
    this.silence.nudges = 0;
    this.enqueue({ kind: 'repeat', noTools: true, note: `[app] The child tapped "teach again" for ${card.english} / ${card.chinese}. Explain and demonstrate it again briefly. This is not an attempt.` });
  }
  pick(turnId: string, quizId: string, cardId: string): TeachingReceipt {
    const previous = this.picks.get(turnId);
    if (previous) return previous;
    this.silence.nudges = 0;
    if (this.presented?.kind !== 'quiz' || this.presented.id !== quizId) throw new Error('INVALID_INPUT_ASSOCIATION');
    const receipt = submitPick(this.session, { id: turnId, targetId: quizId, kind: 'pick', picked: cardId });
    this.picks.set(turnId, receipt);
    this.commit(receipt);
    this.enqueue({ kind: 'pick-feedback', feedbackFor: turnId, noTools: true, note: `[app] The child tapped a picture for question ${quizId}; the app checked it: ${receipt.quiz?.correct ? 'correct' : 'not correct'}. Give one short Chinese feedback sentence. Do not reveal where the right picture is.` });
    return receipt;
  }
  changePhase(to: Session['currentPhase']): TeachingReceipt {
    const receipt = changePhase(this.session, to);
    this.commit(receipt);
    this.syncState(); this.pump();
    return receipt;
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.armSitting();
    if (paused) {
      // Question prompts and the goodbye wait for resume; chatty follow-ups are dropped.
      this.queue = this.queue.filter((request) => SURVIVES_SPEECH.includes(request.kind));
      if (this.active.size) this.port.send({ type: 'response.cancel' });
      if (this.manual) { this.dropManualTurn(); this.childSpeaking = false; }
    } else this.pump();
    this.armSilence();
  }

  handle(event: ProviderMessage): void {
    // DEBUG=true: event order without content, for diagnosing turn-taking against the real provider.
    if (!event.type.endsWith('.delta')) log.debug('provider event', { sessionId: this.session.id, type: event.type, responseId: event.response?.id ?? event.response_id, itemId: event.item_id, status: event.response?.status, active: this.active.size, playing: this.playing, childSpeaking: this.childSpeaking });
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.childSpeaking = true; this.replySince = null; this.silence.nudges = 0;
        if (!this.manual) { const now = Date.now(); this.speechProbe = { at: now, startMs: event.audio_start_ms, playing: this.playing, active: this.active.size, playedMs: this.playingSince ? now - this.playingSince : null }; }
        // Bind the input to what the browser had rendered at speech start, not to later server state.
        if (event.item_id && !this.inputs.has(event.item_id)) this.inputs.set(event.item_id, { target: this.presented });
        this.queue = this.queue.filter((request) => SURVIVES_SPEECH.includes(request.kind));
        break;
      case 'input_audio_buffer.speech_stopped':
        this.childSpeaking = false;
        if (!this.manual && this.speechProbe) {
          const probe = this.speechProbe; const now = Date.now(); this.speechProbe = null;
          const durationMs = typeof event.audio_end_ms === 'number' && typeof probe.startMs === 'number' ? event.audio_end_ms - probe.startMs : now - probe.at;
          this.replySince = probe.at + durationMs;
          log.info('child speech', { sessionId: this.session.id, durationMs, vadWaitMs: Math.max(0, now - this.replySince), teacherPlaying: probe.playing, teacherActive: probe.active, playedMs: probe.playedMs });
        }
        break;
      case 'input_audio_buffer.committed':
        if (this.manual) { this.committed(event); break; }
        this.childSpeaking = false;
        if (event.item_id) { if (!this.inputs.has(event.item_id)) this.inputs.set(event.item_id, { target: this.presented }); this.lastInput = event.item_id; this.assess(event.item_id); }
        break;
      case 'output_audio_buffer.started':
        this.playing = true; this.playingSince ??= Date.now();
        if (!this.manual && this.replySince !== null) {
          const replyMs = Math.max(0, Date.now() - this.replySince); this.replySince = null;
          log.info('reply wait', { sessionId: this.session.id, replyMs });
          const started = event.response_id ? this.responses.get(event.response_id) : undefined;
          if (started) started.replyMs = replyMs;
        }
        break;
      case 'output_audio_buffer.stopped': this.playing = false; this.playingSince = null; break;
      case 'output_audio_buffer.cleared':
        this.playing = false; this.playingSince = null;
        if (this.clearProbe) {
          log.info('output clear confirmed', { sessionId: this.session.id, afterMs: Date.now() - this.clearProbe.sentAt, via: this.clearProbe.fellBack ? 'browser-fallback' : 'sideband' });
          clearTimeout(this.clearProbe.timer); this.clearProbe = null;
        }
        break;
      case 'response.created': if (event.response?.metadata?.kind === 'assess') beginResponseUsage(this.session); else this.created(event); break;
      case 'response.output_audio_transcript.delta': {
        const response = event.response_id ? this.responses.get(event.response_id) : undefined;
        if (response && response.transcript.length < 4000) response.transcript += event.delta ?? '';
        break;
      }
      case 'response.done':
        if (event.response?.metadata?.kind === 'assess') { this.assessed(event); this.finishSitting(); } else this.done(event);
        this.syncState(); break;
      case 'error': {
        const code = safeCode(event.error?.code);
        log.warn('provider event error', { sessionId: this.session.id, code });
        const refused = event.error?.event_id ? this.assessing.get(event.error.event_id) : undefined;
        if (refused) {
          // The provider refused the assessor request itself: same single retry as a response that produced no report.
          this.assessing.delete(event.error!.event_id!);
          const tries = this.inputs.get(refused.input)?.tries ?? 0;
          log.warn('assessment failed', { sessionId: this.session.id, code, tries });
          if (tries < 2) this.assess(refused.input);
          this.finishSitting();
        }
        const request = this.inflight?.request;
        if (request && (event.error?.event_id === request.id || (request.kind === 'commit' && event.error?.event_id === `${request.id}_commit`))) {
          clearTimeout(this.inflight!.timer); this.inflight = null;
          // A VAD response won the race; the child's turn now owns the conversation. A failed manual commit is dropped.
          if (code === 'CONVERSATION_ALREADY_HAS_ACTIVE_RESPONSE' && request.kind !== 'followup' && request.kind !== 'commit') this.queue.unshift(request);
        }
        break;
      }
    }
    this.pump();
    this.armSilence();
  }

  /** Provider events the browser needs for conversation state and subtitles. */
  static forBrowser(event: ProviderMessage): ProviderEvent | null {
    const forwarded = ['input_audio_buffer.speech_started', 'input_audio_buffer.speech_stopped', 'response.created', 'response.done',
      'response.output_audio_transcript.delta', 'output_audio_buffer.started', 'output_audio_buffer.stopped', 'output_audio_buffer.cleared'];
    // The silent assessor is not the teacher: the browser must not count it as teacher activity (speaker mode would close the mic).
    if (!forwarded.includes(event.type) || event.response?.metadata?.kind === 'assess') return null;
    return { type: event.type, response_id: event.response_id, item_id: event.item_id, delta: event.delta?.slice(0, 20_000),
      response: event.response ? { id: event.response.id, status: event.response.status, metadata: event.response.metadata ?? null } : undefined };
  }

  private created(event: ProviderMessage): void {
    const response = event.response; if (!response) return;
    const metadata = response.metadata ?? null;
    if (metadata?.request && this.inflight?.request.id === metadata.request) { clearTimeout(this.inflight.timer); this.inflight = null; }
    const request = metadata?.kind as RequestKind | undefined;
    const parent = metadata?.parent ? this.responses.get(metadata.parent) : undefined;
    // A VAD-created response answers the latest committed input; app responses only inherit their parent's input.
    const input = request ? request === 'followup' ? parent?.input ?? null : request === 'commit' ? this.lastInput : null : this.lastInput;
    if (!request || request === 'commit') this.lastInput = null;
    this.responses.set(response.id, { input, kind: request ?? 'speech', transcript: '', feedbackFor: metadata?.feedback_for });
    this.active.add(response.id);
    beginResponseUsage(this.session);
  }
  private done(event: ProviderMessage): void {
    const response = event.response; if (!response) return;
    // A completed response interrupted during playback is reported again as cancelled; it was already settled.
    if (this.finished.has(response.id)) return;
    this.finished.add(response.id); this.active.delete(response.id);
    const usage = realtimeUsageSchema.safeParse(response.usage);
    recordUsage(this.session, usage.success ? usage.data : null);
    const state = this.responses.get(response.id);
    saveResponse(this.session, { kind: state?.kind ?? 'unknown', status: response.status ?? 'unknown', text: state?.transcript ?? '',
      tools: (response.output ?? []).filter((item) => item.type === 'function_call').map((item) => {
        if (item.name !== 'show_card') return item.name ?? '';
        let cardId: unknown;
        try { cardId = JSON.parse(item.arguments ?? '').card_id; } catch { /* invalid arguments */ }
        return `show_card(${typeof cardId === 'string' && this.card(cardId) ? cardId : '?'})`;
      }).join(','), replyMs: state?.replyMs });
    if (state?.feedbackFor && state.transcript && response.status === 'completed') saveFeedback(this.session, state.feedbackFor, state.transcript);
    // The teacher's first completed spoken answer to a child utterance is that attempt's feedback; it is stored once the assessor has saved the attempt.
    const answered = state?.input ? this.inputs.get(state.input) : undefined;
    if (answered && !answered.reply && state?.transcript && response.status === 'completed') {
      answered.reply = state.transcript;
      if (answered.receipt) saveFeedback(this.session, state.input!, state.transcript);
    }
    if (response.status !== 'completed') {
      if (!this.manual) log.info('response ended early', { sessionId: this.session.id, status: response.status, reason: safeCode(response.status_details?.reason), kind: state?.kind ?? 'unknown', hadSpeech: Boolean(state?.transcript) });
      if (response.status === 'failed') log.warn('response failed', { sessionId: this.session.id, code: safeCode(response.status_details?.error?.code ?? response.status_details?.reason) });
      return;
    }
    // Tools in cancelled responses are never executed: an interruption discards operations that were not committed.
    const calls = (response.output ?? []).filter((item) => item.type === 'function_call');
    if (!calls.length) { this.toolStreak = 0; return; }
    let sittingEnded = false;
    for (const call of calls) {
      const result = this.execute(call.name ?? '', call.arguments ?? '');
      if (result.sittingEnded) sittingEnded = true;
      if (call.call_id) this.port.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result.output) } });
    }
    this.toolStreak++;
    this.syncState();
    // end_sitting queued the goodbye, which is its follow-up: no extra tool follow-up response.
    if (!this.childSpeaking && !this.pendingCommit && !sittingEnded && !this.sitting.ended) this.queue.unshift({ id: this.requestId(), kind: 'followup', parent: response.id, noTools: this.toolStreak >= 3 });
  }

  /**
   * Every committed child utterance gets one silent out-of-band response (conversation "none", text only, forced tool call) that
   * judges it against the target bound at speech start. It runs next to the teacher's spoken response, adds nothing to the
   * conversation, and neither child speech nor response.cancel stops it (measured 2026-11-11, docs/voice-benchmarks.md).
   */
  private assess(input: string): void {
    const record = this.inputs.get(input);
    if (!record?.target || record.receipt || this.farewell || this.sitting.ended) return;
    const quiz = record.target.kind === 'quiz' ? this.quiz(record.target.id) : undefined;
    const card = record.target.kind === 'card' ? this.card(record.target.id) : undefined;
    // Tap-the-picture questions are checked by the app; speech during them is never an attempt.
    const target = quiz?.type === 'repeat-after-me' ? `practice question ${quiz.id}, repeat the whole sentence "${quiz.targetText}"`
      : card && this.session.currentPhase === 'interactive' ? `card ${card.id}, the English ${card.kind === 'word' ? 'word' : 'sentence'} "${card.english}" (${card.chinese})` : null;
    if (!target) return;
    record.tries = (record.tries ?? 0) + 1;
    const id = `assess_${(++this.requests).toString(36)}`;
    this.assessing.set(id, { input, at: Date.now() });
    this.port.send({ type: 'response.create', event_id: id, response: { conversation: 'none', output_modalities: ['text'], metadata: { kind: 'assess', request: id, input },
      instructions: `${ASSESSOR}\nScreen target when the child spoke: ${target}.`, tools: [ASSESS_TOOL], tool_choice: 'required' } });
  }
  /** Settles one assessor response: saves a real attempt once, publishes it, and retries a response that produced no usable report once. */
  private assessed(event: ProviderMessage): void {
    const response = event.response; if (!response || this.finished.has(response.id)) return;
    this.finished.add(response.id);
    const usage = realtimeUsageSchema.safeParse(response.usage);
    recordUsage(this.session, usage.success ? usage.data : null);
    const request = response.metadata?.request ?? '';
    const pending = this.assessing.get(request); this.assessing.delete(request);
    const call = (response.output ?? []).find((item) => item.type === 'function_call' && item.name === 'record_assessment');
    const input = pending?.input ?? response.metadata?.input;
    const record = input ? this.inputs.get(input) : undefined;
    // The assessor's row keeps its report (the tool arguments) as text: it is what this response produced.
    saveResponse(this.session, { kind: 'assess', status: response.status ?? 'unknown', text: (call?.arguments ?? '').slice(0, 4000),
      tools: call ? record?.target ? `record_assessment(${record.target.id})` : 'record_assessment' : '' });
    if (!input || !record?.target) return;
    let report: ReturnType<typeof assessorReportSchema.parse> | undefined;
    let code = response.status !== 'completed' ? safeCode(response.status) : call ? '' : 'NO_TOOL_CALL';
    if (!code) { try { report = assessorReportSchema.parse(JSON.parse(call!.arguments ?? '')); } catch { code = 'INVALID_ARGUMENTS'; } }
    if (!report) {
      log.warn('assessment failed', { sessionId: this.session.id, code, tries: record.tries ?? 0 });
      if ((record.tries ?? 0) < 2) this.assess(input);
      return;
    }
    const ms = pending ? Date.now() - pending.at : null;
    if (!record.receipt && record.target.kind === 'card') {
      const card = this.card(record.target.id);
      if (card) {
        const heard = JSON.stringify(report.heard.slice(0, 80));
        this.verdict = { result: report.result, text: report.result === 'not_attempt'
          ? `[app] Heard: the child's last message was not a try at the screen card ${card.english} (heard ${heard}).`
          : `[app] Heard: on the card ${card.english} the app judged the child's last answer as ${report.result} (heard ${heard}).` };
        if (this.mismatch.targetId !== card.id || report.result !== 'not_attempt') this.mismatch = { targetId: card.id, count: 0 };
        if (report.result === 'not_attempt' && ++this.mismatch.count === 3) this.mismatchNote = { count: this.mismatch.count,
          text: `[app] The child's last 3 messages were not tries at the screen card ${card.english}. If you are practising a different word or one of the course sentences, first put that card on the screen with show_card so the screen matches what you ask; otherwise come back to the screen card.` };
      }
    }
    if (report.result === 'not_attempt' || record.receipt) { log.info('assessment', { sessionId: this.session.id, result: report.result, mastered: false, saved: false, ms }); return; }
    try {
      // For a word card next_action is only a note; a contradictory note (mastered with skip) must not cost the child the attempt.
      const next_action = report.mastered && report.next_action === 'skip' ? 'advance' : report.next_action;
      const receipt = submitAssessment(this.session, { id: input, targetId: record.target.id, kind: 'audio' }, { ...report, next_action, target_id: record.target.id, next_card_id: null, next_phase: null });
      record.receipt = receipt;
      const card = record.target.kind === 'card' ? this.card(record.target.id) : undefined;
      if (card?.kind === 'word' && report.result === 'correct' && !report.mastered) {
        const count = (this.echoCounts.get(card.id) ?? 0) + 1;
        this.echoCounts.set(card.id, count);
        if (count % 2 === 0 && !this.session.memory.clearedCardIds.includes(card.id)) this.echoNote = { count, targetId: card.id,
          text: `[app] The child has now said ${card.english} correctly ${count} times right after your model. Next, ask for it once with a cue that does not contain the English word (the Chinese meaning or a situation) and stop to listen. If they cannot recall it, give one different kind of help and one more chance; if it still does not come, leave this word for now, move on to another word and come back to it later.` };
      }
      this.commit(receipt);
      if (record.reply) saveFeedback(this.session, input, record.reply);
      log.info('assessment', { sessionId: this.session.id, result: report.result, mastered: report.mastered, saved: true, ms });
    } catch (error) {
      log.warn('assessment rejected', { sessionId: this.session.id, code: errorCode(error, 'INVALID_ASSESSMENT'), targetId: record.target.id });
    }
  }
  private execute(name: string, raw: string): { output: object; sittingEnded?: boolean } {
    const reject = (code: string) => {
      log.warn('tool rejected', { sessionId: this.session.id, tool: ['show_card', 'start_practice', 'end_sitting'].includes(name) ? name : 'unknown', code });
      return { output: { ok: false, error: code, note: 'Nothing changed. Do not tell the child about tools, IDs or errors. Retry once with corrected arguments if that makes sense, otherwise carry on teaching with what is on screen.' } };
    };
    let args: unknown;
    try { args = JSON.parse(raw); } catch { return reject('INVALID_ARGUMENTS'); }
    try {
      if (this.sitting.ended && (name === 'show_card' || name === 'start_practice')) throw new Error('SITTING_ENDED');
      if (name === 'show_card') {
        const { card_id } = showCardSchema.parse(args);
        if (this.session.currentPhase !== 'interactive') throw new Error('INVALID_PHASE');
        const receipt = showCard(this.session, card_id); this.commit(receipt);
        if (this.battlePending) {
          this.battlePending = false;
          log.info('battle started', { sessionId: this.session.id, elapsedMs: this.sitting.elapsed + (this.sitting.since === null ? 0 : Date.now() - this.sitting.since) });
          this.port.sittingWrapUp?.();
        }
        // After the time check the cards are recall cards (word battle or recall game): no model-first note there.
        const card = this.card(card_id);
        const unsaid = card?.kind === 'word' && !this.sitting.wrapped && !this.session.memory.wordPerformance.get(card.english)?.correct;
        return { output: { ok: true, displayed_card: card_id, note: unsaid ? NEW_WORD : 'The screen now shows this card.' } };
      }
      if (name === 'start_practice') {
        if (this.session.currentPhase !== 'interactive') throw new Error('INVALID_PHASE');
        const receipt = changePhase(this.session, 'reinforcement'); this.commit(receipt);
        return { output: { ok: true, phase: receipt.progress.currentPhase } };
      }
      if (name === 'end_sitting') {
        // Only after the wrap-up time check, and only while the sitting is still running (not ended, course not complete).
        if (!this.sitting.wrapped || this.sitting.ended || this.farewell) throw new Error('SITTING_NOT_ENDING');
        this.endSitting('tool');
        return { output: { ok: true, note: 'The app now asks you to say goodbye. Say nothing else.' }, sittingEnded: true };
      }
      return reject('UNKNOWN_TOOL');
    } catch (error) {
      return reject(errorCode(error, 'INVALID_ARGUMENTS'));
    }
  }
  /** Publishes committed state; reaching done (by tool or by app action) always schedules one goodbye. */
  private commit(receipt: TeachingReceipt): void {
    this.port.publish(receipt);
    if (receipt.progress.currentPhase === 'done' && !this.farewell) {
      this.farewell = true;
      // Queued behind any tool follow-up; callers pump once their provider items are written.
      this.queue.push({ id: this.requestId(), kind: 'goodbye', noTools: true, note: '[app] The lesson is complete and saved. Say one short warm goodbye in Chinese.' });
    }
  }
  private enqueue(request: Omit<AppRequest, 'id'>): void { if (this.sitting.ended) return; this.queue.push({ ...request, id: this.requestId() }); this.pump(); this.armSilence(); }
  private requestId(): string { return `app_${(++this.requests).toString(36)}`; }
  private pump(): void {
    if (this.paused || this.childSpeaking || this.active.size || this.inflight) return;
    // A finished child turn goes before queued app speech, once the teacher's audio has drained (or the fallback fired).
    if (this.manual && this.pendingCommit) { if (!this.playing || this.pendingCommit.forced) this.startCommit(); return; }
    if (!this.queue.length) return;
    const request = this.queue.shift()!;
    if (request.note) this.port.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: request.note }] } });
    this.inflight = { request, timer: this.inflightTimer(request) };
    this.createResponse(request);
  }
  /** A request that never produced response.created must not block later app requests forever. */
  private inflightTimer(request: AppRequest): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => { if (this.inflight?.request === request) { this.inflight = null; this.pump(); } }, 10_000);
    timer.unref?.();
    return timer;
  }
  private createResponse(request: AppRequest): void {
    const metadata: Record<string, string> = { kind: request.kind, request: request.id };
    if (request.parent) metadata.parent = request.parent;
    if (request.quizId) metadata.quiz_id = request.quizId;
    if (request.feedbackFor) metadata.feedback_for = request.feedbackFor;
    this.port.send({ type: 'response.create', event_id: request.id, response: { metadata, ...(request.noTools ? { tool_choice: 'none' } : {}) } });
  }

  // ---- Experimental manual-turn mode (server VAD off; the app owns turns). ----------------------------------------------
  // Official WebRTC push-to-talk procedure: input_audio_buffer.clear drops old input, .commit when the child's speech ends,
  // then response.create; to stop the teacher: response.cancel (if generating) then output_audio_buffer.clear.

  /**
   * The single entry for child speech boundaries (browser or test script). `start`: the child begins talking; `end`: they
   * stopped. Rejected outside manual mode.
   */
  childSpeech(phase: 'start' | 'end', voicedMs?: number): void {
    if (!this.manual) throw new Error('NOT_FOUND');
    if (this.paused || this.farewell) { log.info('child speech ignored', { sessionId: this.session.id, phase, paused: this.paused }); return; }
    if (phase === 'start') this.speechStart(); else this.speechEnd(voicedMs);
  }
  private teacherBusy(): boolean { return this.active.size > 0 || this.playing; }
  private speechStart(): void {
    const resumed = this.speech;
    if (resumed && !resumed.ended) { log.warn('child speech start while speaking', { sessionId: this.session.id }); return; }
    const busy = this.teacherBusy();
    if (resumed) {
      // The child continued inside the pause window: same turn, same target, and the overlap clock keeps its voiced time.
      if (resumed.commitTimer) clearTimeout(resumed.commitTimer);
      resumed.commitTimer = null; resumed.ended = false; resumed.segmentAt = Date.now();
      log.info('child speech resumed', { sessionId: this.session.id, voicedMs: resumed.voicedMs, teacherBusy: busy });
      if (busy && !resumed.interrupted) this.armOverlap(resumed);
      return;
    }
    this.childSpeaking = true;
    this.queue = this.queue.filter((request) => SURVIVES_SPEECH.includes(request.kind));
    // Bind to what the browser showed when speech began (a still-pending earlier turn keeps its own, earlier target).
    const now = Date.now();
    const speech = { target: this.pendingCommit ? this.pendingCommit.target : this.presented, startedAt: now, segmentAt: now, voicedMs: 0, busyAtStart: busy, interrupted: false, ended: false,
      timer: null as ReturnType<typeof setTimeout> | null, commitTimer: null as ReturnType<typeof setTimeout> | null };
    this.speech = speech;
    log.info('child speech start', { sessionId: this.session.id, teacherBusy: busy });
    if (busy) this.armOverlap(speech);
  }
  /** Overlap clock: counts voiced time only, so pauses between segments of one turn do not count toward an interruption. */
  private armOverlap(speech: NonNullable<NaturalConversation['speech']>): void {
    if (speech.timer) clearTimeout(speech.timer);
    speech.timer = setTimeout(() => this.overlapElapsed(speech), Math.max(0, MANUAL_TURN.interruptAfterMs - speech.voicedMs));
    speech.timer.unref?.();
  }
  private overlapElapsed(speech: NonNullable<NaturalConversation['speech']>): void {
    if (this.speech !== speech) return;
    speech.timer = null;
    const durationMs = speech.voicedMs + Date.now() - speech.segmentAt;
    if (!this.teacherBusy()) { log.info('overlap decision', { sessionId: this.session.id, durationMs, interrupted: false, reason: 'teacher already idle' }); return; }
    speech.interrupted = true;
    log.info('overlap decision', { sessionId: this.session.id, durationMs, interrupted: true });
    if (this.active.size) this.port.send({ type: 'response.cancel' });
    if (this.clearProbe) clearTimeout(this.clearProbe.timer);
    const probe = { sentAt: Date.now(), wasPlaying: this.playing, fellBack: false,
      timer: setTimeout(() => {
        probe.fellBack = true;
        log.warn('output clear not confirmed, asking the browser', { sessionId: this.session.id, afterMs: Date.now() - probe.sentAt, wasPlaying: probe.wasPlaying });
        this.port.clearOutput?.();
      }, MANUAL_TURN.clearedWaitMs) };
    probe.timer.unref?.();
    this.clearProbe = probe;
    this.port.send({ type: 'output_audio_buffer.clear' });
  }
  /** `voicedMs` (browser-measured, without the detector's end hangover) replaces start-to-end when given. */
  private speechEnd(voicedMs?: number): void {
    const speech = this.speech;
    if (!speech) { log.warn('child speech end without start', { sessionId: this.session.id }); return; }
    if (speech.ended) return;
    if (speech.timer) clearTimeout(speech.timer);
    speech.timer = null; speech.ended = true;
    const segment = Date.now() - speech.segmentAt;
    speech.voicedMs += typeof voicedMs === 'number' && Number.isFinite(voicedMs) ? Math.max(0, Math.min(voicedMs, segment)) : segment;
    log.info('child speech end', { sessionId: this.session.id, voicedMs: speech.voicedMs, waitMs: MANUAL_TURN.commitAfterSilenceMs });
    speech.commitTimer = setTimeout(() => this.speechFinished(speech), MANUAL_TURN.commitAfterSilenceMs);
    speech.commitTimer.unref?.();
  }
  /** The pause window passed without the child continuing: the turn is over. */
  private speechFinished(speech: NonNullable<NaturalConversation['speech']>): void {
    if (this.speech !== speech) return;
    this.speech = null; this.childSpeaking = false;
    const busy = this.teacherBusy();
    if (speech.busyAtStart && !speech.interrupted) log.info('overlap decision', { sessionId: this.session.id, durationMs: speech.voicedMs, interrupted: false });
    log.info('child turn finished', { sessionId: this.session.id, voicedMs: speech.voicedMs, teacherBusy: busy });
    if (!this.pendingCommit) this.pendingCommit = { target: speech.target, forced: false, timer: null };
    if (busy) {
      log.info('commit deferred until teacher idle', { sessionId: this.session.id });
      if (!this.pendingCommit.timer) {
        const pending = this.pendingCommit;
        pending.timer = setTimeout(() => { pending.forced = true; log.warn('commit forced, teacher never reported idle', { sessionId: this.session.id }); this.pump(); }, MANUAL_TURN.idleFallbackMs);
        pending.timer.unref?.();
      }
    } else log.info('commit immediate', { sessionId: this.session.id });
    this.pump();
  }
  /** Sends the commit; the response is created once the provider confirms it, so the new item can be bound to its target. */
  private startCommit(): void {
    const pending = this.pendingCommit!;
    if (pending.timer) clearTimeout(pending.timer);
    this.pendingCommit = null;
    const request: AppRequest = { id: this.requestId(), kind: 'commit', commitTarget: pending.target };
    this.inflight = { request, timer: this.inflightTimer(request), awaitingCommit: true };
    log.info('commit sent', { sessionId: this.session.id, forced: pending.forced });
    this.port.send({ type: 'input_audio_buffer.commit', event_id: `${request.id}_commit` });
  }
  private committed(event: ProviderMessage): void {
    const inflight = this.inflight;
    if (!inflight?.awaitingCommit || !event.item_id) { log.debug('unexpected committed', { sessionId: this.session.id }); return; }
    inflight.awaitingCommit = false;
    this.inputs.set(event.item_id, { target: inflight.request.commitTarget ?? null });
    this.lastInput = event.item_id;
    this.assess(event.item_id);
    this.createResponse(inflight.request);
  }
  private hygieneClear(): void {
    if (this.speech || this.pendingCommit || this.inflight?.request.kind === 'commit') return;
    this.port.send({ type: 'input_audio_buffer.clear' });
  }
  private dropManualTurn(): void {
    if (this.speech?.timer) clearTimeout(this.speech.timer);
    if (this.speech?.commitTimer) clearTimeout(this.speech.commitTimer);
    if (this.pendingCommit?.timer) clearTimeout(this.pendingCommit.timer);
    this.speech = null; this.pendingCommit = null;
  }
  /**
   * Committed lesson state is appended as an [app] message instead of rewriting the instructions: changing the
   * instructions busts the prompt cache for the whole conversation after them. Written only between responses and
   * only when it changed; a change during a response is written once that response settles. Pending verdicts, mismatch and echo
   * reminders use the same boundary, even when the lesson state is unchanged.
   */
  private syncState(): void {
    if (this.active.size) return;
    const verdict = this.verdict; this.verdict = null;
    if (verdict) {
      this.port.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: verdict.text }] } });
      log.info('app note', { sessionId: this.session.id, kind: 'verdict', result: verdict.result });
    }
    const mismatch = this.mismatchNote; this.mismatchNote = null;
    if (mismatch) {
      this.port.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: mismatch.text }] } });
      log.info('app note', { sessionId: this.session.id, kind: 'mismatch', count: mismatch.count });
    }
    const echo = this.echoNote; this.echoNote = null;
    if (echo && !this.session.memory.clearedCardIds.includes(echo.targetId)) {
      this.port.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: echo.text }] } });
      log.info('app note', { sessionId: this.session.id, kind: 'echo', count: echo.count });
    }
    const s = this.session; const screen = this.presented ?? (s.currentPhase === 'interactive' ? { kind: 'card', id: s.memory.currentCardId } : null);
    const card = screen?.kind === 'card' ? this.card(screen.id) : undefined;
    const performance = card ? s.memory.wordPerformance.get(card.english) : undefined;
    const practice = card ? { card_id: card.id, attempts: performance?.attempts ?? 0, correct: performance?.correct ?? 0 } : null;
    const text = `[app] State: phase ${s.currentPhase}; screen ${screen ? `${screen.kind} ${screen.id}` : 'loading'}. Words not yet passed in the WHOLE course: ${JSON.stringify(this.remaining())}. This sitting covers only about 4-6 of them; do not rush to finish them today and do not silently drop any (unfinished words continue in the next sitting). Passed word cards so far in this course (not lasting mastery): ${JSON.stringify(s.memory.clearedCardIds)}. Current word practice: ${JSON.stringify(practice)}. Passed questions: ${JSON.stringify(s.memory.passedQuizIds)}.`;
    if (text === this.lastState) return;
    this.lastState = text;
    this.port.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] } });
  }
  private card(id: string) { return this.session.course.cards.find((card) => card.id === id); }
  private quiz(id: string) { return this.session.course.phases.reinforcement.quizzes.find((quiz) => quiz.id === id); }
  private remaining() { return this.session.course.cards.filter((c) => c.kind === 'word' && !this.session.memory.clearedCardIds.includes(c.id)).map(({ id, english }) => ({ id, english })); }
  private tools(): object[] {
    return [
      { type: 'function', name: 'show_card', description: 'Display a course card to teach, explain or review it, including when the child asks for one, and to move on to the next word.',
        parameters: { type: 'object', properties: { card_id: { type: 'string', enum: this.session.course.cards.map((c) => c.id) } }, required: ['card_id'], additionalProperties: false } },
      { type: 'function', name: 'start_practice', description: 'Move from the word lesson to the practice questions once every word of the course was taught (passed, or deliberately deferred). Never to finish early because the sitting is long.',
        parameters: { type: 'object', properties: {}, additionalProperties: false } },
      { type: 'function', name: 'end_sitting', description: 'Only after the app\'s time check: call it once the current word is finished and the short recall game is done, instead of saying goodbye yourself. The app then asks you to say goodbye. Rejected before the time check.',
        parameters: { type: 'object', properties: {}, additionalProperties: false } },
    ];
  }
  private instructions(): string {
    const s = this.session;
    return `You are 麻吉老师, a warm and patient English tutor for a young Chinese-speaking child in a live voice lesson. Speak simple Chinese with clear, unhurried English demonstrations. Make one small teaching move and invite at most one response per turn, then listen. Keep every turn short: one or two short sentences, about five seconds of speech; a scaffold that needs more is split over several turns. The child may talk at any time, including while you speak; answer what they actually said. No professional pronunciation scores.
The screen shows one course card or practice question at a time; [app] messages and tool results tell you what is on screen and which words the child has passed. Course: ${JSON.stringify({ title: s.course.title, opening: s.course.teachingHints.opening, sentences: s.course.objectives.sentences })}. Learning targets: ${JSON.stringify(s.course.cards.map(({ id, english, chinese, kind, drillParts }) => ({ id, english, chinese, kind, drillParts })))}. Use these learning targets; brief familiar context and answers to the child's questions are welcome, without adding unrelated learning goals.
SITTING: The course is taught over several short sittings. This sitting is about 10-15 minutes and covers about 4-6 new words; the rest wait for next time, and progress is saved. Never rush to finish the course. If about 4-6 words have been taught and the app's time check has not arrived yet, do not tell the child the lesson is stopping, do not go idle and do not start many more words: keep working with these same words in new situations, have the child recall them without your model first (a gap to fill, a new cue; a choice between two is not recall), and bring in the course's target sentences. This holds only while words remain: when [app] State shows no words left to pass in the whole course, do not keep recalling them; call start_practice right away, whatever the time. When an [app] message says the time is nearly up, finish the current word, run a short recall game with today's words, then call end_sitting. Do not say goodbye before the app asks you to.
TEACHING: Build 2-3 related words into one small situation (e.g. at the park: run, jump, walk), chosen on the spot from the words still to pass. Keep the child mostly speaking and doing. Move each word up and down this ladder by how the child responds: understand it from the situation, choose between two ("is the dog running or sleeping?"), echo it, fill a gap ("the dog sees the ball and ... ?"), use it freely or in a short sentence ("I can run!"). If the child succeeds, go up; if stuck or silent, go down one step instead of repeating the same question. Chinese is a help, not a ritual announcement on every card. Once words are familiar, weave in the course's target sentences. Never reuse one fixed praise-then-model-then-repeat template.
PASSING A WORD: The app listens to every answer itself and keeps the records; you never record, score or save anything. It marks a word as passed when, in a different situation from the one just modelled, the child recalled or used the word on their own (gap or own use); [app] State then lists it as passed. An echo right after your model, even perfect, is practice: ask for the word again in a new situation without handing the answer over. A child who already uses the word independently passes at once; do not drill what they already know. When you ask the child to recall a word, your cue must not contain that English word, not even as "say X": give the situation or the Chinese and stop (e.g. "草丛里跳出一只小猫，它是？"). A cue that contains the word only gets an echo.
NEW WORDS: a word the child has never said correctly is new to them and is taught before it is asked. Once its card is on the screen, say the English word clearly with its meaning (split a long word with its drillParts) and let the child say it after you; only after they have said it do you ask for it with a cue that does not contain the word. Never open a new word by asking what it is in English: the child cannot know it yet. The show_card result tells you when a card is such a word, and so does "correct":0 in the current word practice of [app] State.
EACH TURN: Do one thing: one model or one question, then stop and wait; the question or the model itself hands the turn over. Do not close turns with a fixed handover phrase such as 轮到你了, and do not open two turns in a row with the same words (很好 / 太好了 / 没关系). Never narrate what you are about to do ("我们换个方式来试试", "让我想一想", "现在我们来..."): just do it. If the child stays silent, go one step easier (offer two choices, give the first sound, show the situation again), not the same question again. Wait patiently when the child pauses mid-answer.
FEEDBACK: Be specific and tied to meaning ("the dog is running!"), not generic praise every time. If the child's try is not quite right, say the correct version naturally once and continue, without saying "wrong". If the child answers in Chinese, first confirm the meaning is right, then give the English ("对，就是跑！英文是 run"). After two tries with the same kind of help, change the help (situation, splitting the sound with the card's drillParts, two choices).
CHILD TALKS: If the child interrupts, asks something or shares their own story, answer that first, then connect back to the word. If they are tired or bored, offer a choice (another game, a short break) or defer the word without awarding mastery (skip); never push. Do not say goodbye on your own: a parent can end the lesson early, otherwise the app tells you when the sitting ends. The child may speak at any time; when they do, you stop and their words come next: answer what they said, keeping it short (one sentence of guidance). If their input was a try at the English target, respond to the try (see ANSWERING A TRY); if it was only agreement, just continue. You have audio and card metadata, not a camera: never claim to see the child or their room.
RETURNING: When the child comes back to a course, first help them recall 2-3 words passed before, in a new situation and gently (hints are fine, forgetting is not failure). Recall answers do not remove a passed word. Show the card of each word you ask them to recall first (see SCREEN FIRST).
SUMMARY: At the end of a sitting, after end_sitting the app asks for the goodbye; say only what we practised today and what comes next time, never "you have learned everything" and never that the course is complete unless the app says so. For sentence practice, teach its meaning and invite the full sentence; use chunks only when needed. Partial sentences still need support. In practice the app moves to the next question by itself once the child has said the whole sentence, and tells you what is on screen: after a try, react in one short sentence, and if it was not the whole sentence yet, help and invite another try.
Tools: show_card to teach, explain or review a card (when the child asks about another card, e.g. "猫那个再讲一下", show that card) and to move on to the next word. start_practice only once every word of the course has been taught. end_sitting only after the app's time check (see SITTING). Decide yourself, from the child's needs, when to stay on a word, come back to it later or move on; do not drill one word forever. Practice pick-word questions are answered by tapping; the app checks them.
ANSWERING A TRY: when the child tried the English target, answer at once in one turn: a short specific reaction that is only about the child's words ("对，dog！", "差一点，是 gui-tar。"), then your next cue or question. Never describe your own process or plan, in any language (no "让我听一下", "我来看看", "let me check", "我记一下", "然后我们继续", "让我想一想"). To move on to another card, say the short reaction, call show_card in that same turn, and introduce the new card after its result. For any other tool use (a card the child asked for, start_practice, end_sitting) call the tool first with no words before it, then speak after its result. ok:false means nothing changed: after the result, correct course without mentioning it.
NO BOOKKEEPING TALK: never tell the child about passing or not passing, counting, scores, attempts, saving, or that practice "doesn't count". Just teach and give the next cue. Never say 目标词 (target word) to the child, and never comment on whether a hint or help was involved; those are your notes, not things to say.
SCREEN FIRST: the app judges every answer against the card on the screen, and the child is looking at that card. So the answer you ask for must always be the card on the screen. Before you ask for anything else (an earlier word to recall, another word from the same situation, a course sentence), put that card on the screen with show_card in that same turn and ask after its result. Never ask for one word while another card is showing. Mentioning other words while you explain or set a scene is fine; asking the child to say them is not.
SENTENCES: The course's target sentences have their own cards (kind "sentence" in the learning targets). To practise one as a whole sentence, show its sentence card first (see SCREEN FIRST), then model it and invite it. A child who puts the screen word into a sentence of their own is welcome and needs no correction of the rest of that sentence. A sentence that is not one of the course's target sentences is only a model for meaning: say it once if it helps, and never ask the child to repeat it in full or to fix its small words.
APP VERDICT: after each thing the child says, the app tells you in an [app] Heard message how it judged that answer against the screen card; it usually arrives just after you have already replied. Never read it aloud or mention it. In your next turn stay consistent with it: do not praise as right an answer it judged wrong or not a try, and do not correct an answer it judged correct. If your last reply said the opposite, simply carry on from the app's verdict without apologising or explaining.
TOOL RECOVERY: Internal tool errors are not the child's mistake. Never mention system errors, card IDs or tool details to the child. If a tool keeps failing, carry on teaching with what is on screen; if the lesson cannot continue, briefly ask a parent for help.
Lesson state (phase, what is on screen, words not yet passed, passed words, passed questions) arrives in [app] State messages; the most recent one is current.${this.game ? `
${GAME_RULES}` : ''}`;
  }
}

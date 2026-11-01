import { createLogger } from '@/lib/logger';
import type { Session } from '@/lib/agent/session-store';
import { realtimeAssessmentSchema, realtimeUsageSchema, showCardSchema, type PresentedTarget, type ProviderEvent } from '@/lib/realtime-protocol';
import { beginResponseUsage, changePhase, recordUsage, saveFeedback, showCard, snapshot, submitAssessment, submitPick, type TeachingReceipt } from './teaching';

const log = createLogger('realtime-conversation');
export interface ProviderMessage {
  type: string; event_id?: string; item_id?: string; response_id?: string; delta?: string;
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
  /** Ask the browser to clear unplayed teacher audio (only the WebRTC peer can; the sideband cannot). */
  interruptPlayback(): void;
}
/** One sitting (一次课) is one call. Only unpaused call time counts. Tune here after real lessons. */
export const SITTING = { wrapUpMs: 10 * 60_000, goodbyeMs: 14 * 60_000 };
/** Child speech over the teacher interrupts only if it lasts this long; shorter echoes and "mm" do not stop the model. */
export const INTERRUPT_AFTER_MS = 1500;
/** A child input committed while the teacher was idle gets this long to receive the provider's own response. */
const REPLY_GRACE_MS = 800;
type RequestKind = 'opening' | 'followup' | 'present-quiz' | 'repeat' | 'pick-feedback' | 'goodbye' | 'reply';
interface AppRequest { id: string; kind: RequestKind; note?: string; parent?: string; quizId?: string; feedbackFor?: string; noTools?: boolean; inputId?: string }
interface ResponseState { input: string | null; kind: string; transcript: string; feedbackFor?: string }
const SURVIVES_SPEECH: RequestKind[] = ['present-quiz', 'goodbye'];
function safeCode(code: string | undefined): string { return code && /^[a-z0-9_]{1,80}$/i.test(code) ? code.toUpperCase() : 'UNKNOWN'; }
function errorCode(error: unknown, fallback: string): string { return error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : fallback; }

/**
 * Server-side half of one natural Realtime conversation. The provider decides turns (VAD), interruptions and
 * teaching; this class binds child speech to the target the browser actually displayed, executes tool calls
 * from completed responses only, and serializes application-initiated responses around the child's turns.
 */
export class NaturalConversation {
  private presented: PresentedTarget | null = null;
  private inputs = new Map<string, { target: PresentedTarget | null; receipt?: TeachingReceipt }>();
  private lastInput: string | null = null;
  private responses = new Map<string, ResponseState>();
  private finished = new Set<string>();
  private active = new Set<string>();
  private queue: AppRequest[] = [];
  private inflight: { request: AppRequest; timer: ReturnType<typeof setTimeout> } | null = null;
  private picks = new Map<string, TeachingReceipt>();
  private childSpeaking = false;
  private paused = false;
  private toolStreak = 0;
  private requests = 0;
  private farewell = false;
  private lastState = '';
  // Sitting clock: unpaused milliseconds so far, the start of the running stretch, and the next milestone timer.
  private sitting = { elapsed: 0, since: null as number | null, timer: null as ReturnType<typeof setTimeout> | null, wrapped: false, ended: false, started: false };
  private playing = false;
  // Child speech that began while the teacher was busy; decides interruption after INTERRUPT_AFTER_MS.
  private overlap: { inputId: string; startedAt: number; timer: ReturnType<typeof setTimeout> | null; interrupted: boolean } | null = null;
  // The latest committed child input that no response has been created for yet (see replyRequest).
  private unanswered: { inputId: string; readyAt: number; skipped: boolean } | null = null;
  private replyTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private session: Session, private port: ConversationPort, private timing = SITTING) {}

  /**
   * Initial session configuration for the provider call. Long-lived credentials never reach this payload.
   * Instructions and tools stay fixed for the whole call so every response can reuse the cached prefix; when the
   * conversation outgrows the context, truncation drops a large block once instead of a few items every turn.
   * The provider never interrupts by itself (interrupt_response false): short echoes must not cut the model's
   * demonstration, so handle() decides interruptions from how long the child keeps speaking.
   */
  sessionConfig(model: string): object {
    return { type: 'realtime', model, instructions: this.instructions(), tools: this.tools(), tool_choice: 'auto', max_output_tokens: 1200,
      truncation: { type: 'retention_ratio', retention_ratio: 0.8 },
      audio: { input: { turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: true, interrupt_response: false } }, output: { voice: 'marin' } } };
  }
  start(resumed: boolean): void {
    if (this.session.currentPhase === 'intro') this.commit(changePhase(this.session, 'interactive'));
    this.syncState();
    const card = this.card(this.session.memory.currentCardId);
    const passed = this.session.course.cards.filter((c) => c.kind === 'word' && this.session.memory.clearedCardIds.includes(c.id)).map((c) => c.english).slice(0, 8);
    const recall = resumed && passed.length ? ` Words passed in earlier sittings: ${JSON.stringify(passed)}. Before new teaching, in a NEW situation (not the old drill) help the child recall 2-3 of them; hints are fine, a forgotten word is not a failure.` : '';
    const note = this.session.currentPhase === 'interactive'
      ? `[app] ${resumed ? 'The child is back to continue this course.' : 'Lesson started.'} Screen shows card ${card?.id} (${card?.english} / ${card?.chinese}). Greet in one short sentence.${recall || ' Then teach this card.'}`
      : '[app] The child is back for practice questions. Welcome them in one short Chinese sentence; the app shows the next question.';
    this.enqueue({ kind: 'opening', note });
    this.sitting.started = true; this.armSitting();
  }
  close(): void {
    if (this.inflight) clearTimeout(this.inflight.timer);
    this.inflight = null; this.queue = [];
    for (const timer of [this.sitting.timer, this.replyTimer, this.overlap?.timer]) if (timer) clearTimeout(timer);
    this.sitting.timer = null; this.replyTimer = null; this.overlap = null; this.unanswered = null;
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
      this.port.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text:
        '[app] Time check: this sitting is nearly over. Finish the word you are on without starting a new one, then play a short recall game with the words practised today (the child says them in a new situation), then say goodbye. Do not say the whole course is finished.' }] } });
      this.armSitting();
      return;
    }
    sitting.ended = true; this.farewell = true;
    log.info('sitting ended', { sessionId: this.session.id, elapsedMs: sitting.elapsed, phase: this.session.currentPhase });
    // Same path as the completion goodbye, so child speech never drops it. The phase is untouched: progress is already saved and the next call resumes it.
    this.queue.push({ id: this.requestId(), kind: 'goodbye', noTools: true, note: '[app] Today\'s sitting is over and progress is saved. Say one short warm goodbye in Chinese: what we practised today, that we continue next time. Do not say the course is finished.' });
    this.port.sittingEnded();
    this.pump();
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
    this.enqueue({ kind: 'repeat', noTools: true, note: `[app] The child tapped "teach again" for ${card.english} / ${card.chinese}. Explain and demonstrate it again briefly. This is not an attempt.` });
  }
  pick(turnId: string, quizId: string, cardId: string): TeachingReceipt {
    const previous = this.picks.get(turnId);
    if (previous) return previous;
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
      this.unanswered = null;
      if (this.active.size) this.port.send({ type: 'response.cancel' });
    } else this.pump();
  }

  handle(event: ProviderMessage): void {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.childSpeaking = true;
        // Bind the input to what the browser had rendered at speech start, not to later server state.
        if (event.item_id && !this.inputs.has(event.item_id)) this.inputs.set(event.item_id, { target: this.presented });
        this.queue = this.queue.filter((request) => SURVIVES_SPEECH.includes(request.kind));
        this.speechOverTeacher(event.item_id ?? '');
        break;
      case 'input_audio_buffer.speech_stopped':
        this.childSpeaking = false; this.speechOverTeacherEnded();
        // A newer utterance just ended: its commit (and the provider's own response to it) is about to supersede the older unanswered input.
        if (this.unanswered && event.item_id !== this.unanswered.inputId) this.unanswered = { ...this.unanswered, skipped: false, readyAt: Date.now() + REPLY_GRACE_MS };
        break;
      case 'input_audio_buffer.committed':
        this.childSpeaking = false; this.speechOverTeacherEnded();
        if (event.item_id) {
          if (!this.inputs.has(event.item_id)) this.inputs.set(event.item_id, { target: this.presented });
          this.lastInput = event.item_id;
          // A newer input supersedes an older unanswered one. If a response is active the provider cannot answer
          // this input (error or silent skip), so it is due as soon as the teacher is idle; otherwise the provider
          // should create a response within moments and the grace window waits for it.
          this.unanswered = { inputId: event.item_id, readyAt: Date.now() + REPLY_GRACE_MS, skipped: this.active.size > 0 };
        }
        break;
      case 'output_audio_buffer.started': this.playing = true; break;
      case 'output_audio_buffer.stopped': case 'output_audio_buffer.cleared': this.playing = false; break;
      case 'response.created': this.created(event); break;
      case 'response.output_audio_transcript.delta': {
        const response = event.response_id ? this.responses.get(event.response_id) : undefined;
        if (response && response.transcript.length < 4000) response.transcript += event.delta ?? '';
        break;
      }
      case 'response.done': this.done(event); this.syncState(); break;
      case 'error': {
        const code = safeCode(event.error?.code);
        log.warn('provider event error', { sessionId: this.session.id, code });
        const request = this.inflight?.request;
        if (request && event.error?.event_id === request.id) {
          clearTimeout(this.inflight!.timer); this.inflight = null;
          // A VAD response won the race; the child's turn now owns the conversation. A lost reply needs no retry:
          // whichever response is active already sees the input, and unanswered clears when it was created.
          if (code === 'CONVERSATION_ALREADY_HAS_ACTIVE_RESPONSE' && request.kind !== 'followup' && request.kind !== 'reply') this.queue.unshift(request);
        } else if (code === 'CONVERSATION_ALREADY_HAS_ACTIVE_RESPONSE' && this.unanswered) this.unanswered.skipped = true;
        break;
      }
    }
    this.pump();
  }

  private teacherBusy(): boolean { return this.active.size > 0 || this.playing; }
  /**
   * Child speech while the teacher talks or audio is still playing: wait INTERRUPT_AFTER_MS; only a child who
   * is still speaking then stops the teacher (cancel the generation, and the browser clears unplayed audio).
   * Every such overlap is logged without content so the threshold can be tuned from real lessons.
   */
  private speechOverTeacher(inputId: string): void {
    if (!this.teacherBusy() || this.overlap) return;
    const overlap = { inputId, startedAt: Date.now(), timer: null as ReturnType<typeof setTimeout> | null, interrupted: false };
    this.overlap = overlap;
    overlap.timer = setTimeout(() => {
      overlap.timer = null;
      if (this.overlap !== overlap || !this.childSpeaking || !this.teacherBusy()) return;
      overlap.interrupted = true;
      // response.cancel errors when nothing is generating (audio only); skip it then. Tools of a cancelled response are discarded in done().
      if (this.active.size) this.port.send({ type: 'response.cancel' });
      this.port.interruptPlayback();
    }, INTERRUPT_AFTER_MS);
    overlap.timer.unref?.();
  }
  private speechOverTeacherEnded(): void {
    const overlap = this.overlap;
    if (!overlap) return;
    if (overlap.timer) clearTimeout(overlap.timer);
    this.overlap = null;
    log.info('child spoke during teacher', { sessionId: this.session.id, inputId: overlap.inputId, durationMs: Date.now() - overlap.startedAt, interrupted: overlap.interrupted });
  }
  /** Provider events the browser needs for conversation state and subtitles. */
  static forBrowser(event: ProviderMessage): ProviderEvent | null {
    const forwarded = ['input_audio_buffer.speech_started', 'input_audio_buffer.speech_stopped', 'response.created', 'response.done',
      'response.output_audio_transcript.delta', 'output_audio_buffer.started', 'output_audio_buffer.stopped', 'output_audio_buffer.cleared'];
    if (!forwarded.includes(event.type)) return null;
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
    const input = request ? request === 'followup' ? parent?.input ?? null : request === 'reply' ? metadata?.input ?? null : null : this.lastInput;
    if (!request) this.lastInput = null;
    // Any response created after the commit sees the input in its context: it is answered, exactly once.
    this.unanswered = null;
    this.responses.set(response.id, { input, kind: request ?? 'speech', transcript: '', feedbackFor: metadata?.feedback_for ?? parent?.feedbackFor });
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
    if (state?.feedbackFor && state.transcript && response.status === 'completed') saveFeedback(this.session, state.feedbackFor, state.transcript);
    if (response.status !== 'completed') {
      if (response.status === 'failed') log.warn('response failed', { sessionId: this.session.id, code: safeCode(response.status_details?.error?.code ?? response.status_details?.reason) });
      return;
    }
    // Tools in cancelled responses are never executed: an interruption discards operations that were not committed.
    const calls = (response.output ?? []).filter((item) => item.type === 'function_call');
    if (!calls.length) { this.toolStreak = 0; return; }
    // Tool-first is model-led; record violations (no content) so the order stays observable. The model imitates
    // its own earlier preambles, so a preamble is removed from the conversation context once its turn is settled.
    if (state?.transcript) {
      log.warn('speech before tool', { sessionId: this.session.id, tools: calls.map((c) => c.name).join(',') });
      for (const item of response.output ?? []) if (item.type === 'message' && item.id) this.port.send({ type: 'conversation.item.delete', item_id: item.id });
    }
    let feedbackFor: string | undefined;
    for (const call of calls) {
      const result = this.execute(call.name ?? '', call.arguments ?? '', state?.input ?? null);
      if (result.feedbackFor) feedbackFor = result.feedbackFor;
      if (call.call_id) this.port.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result.output) } });
    }
    this.toolStreak++;
    this.syncState();
    if (!this.childSpeaking) this.queue.unshift({ id: this.requestId(), kind: 'followup', parent: response.id, feedbackFor, noTools: this.toolStreak >= 3 });
  }
  private execute(name: string, raw: string, input: string | null): { output: object; feedbackFor?: string } {
    const target = input ? this.inputs.get(input)?.target : null;
    const quiz = target?.kind === 'quiz' ? this.quiz(target.id) : undefined;
    const reject = (code: string) => {
      log.warn('tool rejected', { sessionId: this.session.id, tool: ['record_assessment', 'show_card', 'start_practice'].includes(name) ? name : 'unknown', code, inputId: input, targetId: target?.id ?? null });
      return { output: { ok: false, error: code,
        expected_target: target ? { id: target.id, text: quiz?.type === 'repeat-after-me' ? quiz.targetText : this.card(target.id)?.english } : null,
        note: 'Internal tool failure. Do not tell the child about saving, IDs or tools, or ask them to repeat because of this failure. For an argument or target error, reassess the existing audio against expected_target and retry once with corrected arguments before speaking. Never claim success without ok:true. If recovery fails, briefly say the teacher needs a moment and ask a parent for help.' } };
    };
    let args: unknown;
    try { args = JSON.parse(raw); } catch { return reject('INVALID_ARGUMENTS'); }
    try {
      if (name === 'show_card') {
        const { card_id } = showCardSchema.parse(args);
        if (this.session.currentPhase !== 'interactive') throw new Error('INVALID_PHASE');
        const receipt = showCard(this.session, card_id); this.commit(receipt);
        return { output: { ok: true, displayed_card: card_id, note: 'The screen now shows this card.' } };
      }
      if (name === 'start_practice') {
        if (this.session.currentPhase !== 'interactive') throw new Error('INVALID_PHASE');
        const receipt = changePhase(this.session, 'reinforcement'); this.commit(receipt);
        return { output: { ok: true, phase: receipt.progress.currentPhase } };
      }
      if (name !== 'record_assessment') return reject('UNKNOWN_TOOL');
      if (!input) return reject('NO_CHILD_INPUT');
      const record = this.inputs.get(input);
      if (record?.receipt) return { output: { ...this.summary(record.receipt), duplicate: true } };
      if (!record?.target) return reject('NO_PRESENTED_TARGET');
      const assessment = realtimeAssessmentSchema.parse(args);
      // The prompt contains course card IDs, while practice uses question IDs. Only the
      // bound question's explicit card relation is an alias; never retarget another sentence.
      if (quiz?.type === 'repeat-after-me' && assessment.target_id === quiz.cardId
        && this.card(quiz.cardId)?.english === quiz.targetText) {
        log.info('assessment target normalized', { sessionId: this.session.id, inputId: input, cardId: quiz.cardId, targetId: quiz.id });
        assessment.target_id = quiz.id;
      }
      if (assessment.target_id !== record.target.id) {
        return reject('INVALID_INPUT_ASSOCIATION');
      }
      const receipt = submitAssessment(this.session, { id: input, targetId: record.target.id, kind: 'audio' }, assessment);
      record.receipt = receipt;
      this.commit(receipt);
      return { output: this.summary(receipt), feedbackFor: input };
    } catch (error) {
      const code = errorCode(error, 'INVALID_ARGUMENTS');
      return reject(code);
    }
  }
  private summary(receipt: TeachingReceipt): object {
    return { ok: true, saved: true, result: receipt.assessment?.result, mastered: receipt.assessment?.mastered, quiz: receipt.quiz,
      phase: receipt.progress.currentPhase, displayed_card: receipt.progress.currentPhase === 'interactive' ? receipt.cardId : undefined,
      remaining_words: this.remaining() };
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
  private enqueue(request: Omit<AppRequest, 'id'>): void { this.queue.push({ ...request, id: this.requestId() }); this.pump(); }
  private requestId(): string { return `app_${(++this.requests).toString(36)}`; }
  /**
   * One response for the latest child input that got none (the provider skipped it because a response was
   * active, or never answered). Due when idle and either known skipped or the grace window passed without a
   * response.created. Because response.created of ANY response clears `unanswered`, a provider response that did
   * arrive can never be followed by a second one for the same input.
   */
  private replyRequest(): AppRequest | null {
    const u = this.unanswered;
    if (!u || this.sitting.ended || !this.inputs.has(u.inputId)) return null;
    if (!u.skipped && Date.now() < u.readyAt) {
      if (!this.replyTimer) {
        this.replyTimer = setTimeout(() => { this.replyTimer = null; this.pump(); }, Math.max(0, u.readyAt - Date.now()) + 5);
        this.replyTimer.unref?.();
      }
      return null;
    }
    this.unanswered = null;
    log.info('reply to unanswered child input', { sessionId: this.session.id, inputId: u.inputId, skipped: u.skipped });
    return { id: this.requestId(), kind: 'reply', inputId: u.inputId };
  }
  private pump(): void {
    if (this.paused || this.childSpeaking || this.active.size || this.inflight) return;
    const request = this.queue.shift() ?? this.replyRequest();
    if (!request) return;
    if (request.note) this.port.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: request.note }] } });
    const metadata: Record<string, string> = { kind: request.kind, request: request.id };
    if (request.parent) metadata.parent = request.parent;
    if (request.quizId) metadata.quiz_id = request.quizId;
    if (request.feedbackFor) metadata.feedback_for = request.feedbackFor;
    if (request.inputId) metadata.input = request.inputId;
    // A request that never produced response.created must not block later app requests forever.
    const timer = setTimeout(() => { if (this.inflight?.request === request) { this.inflight = null; this.pump(); } }, 10_000);
    timer.unref?.();
    this.inflight = { request, timer };
    this.port.send({ type: 'response.create', event_id: request.id, response: { metadata, ...(request.noTools ? { tool_choice: 'none' } : {}) } });
  }
  /**
   * Committed lesson state is appended as an [app] message instead of rewriting the instructions: changing the
   * instructions busts the prompt cache for the whole conversation after them. Written only between responses and
   * only when it changed; a change during a response is written once that response settles.
   */
  private syncState(): void {
    if (this.active.size) return;
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
      { type: 'function', name: 'show_card', description: 'Display a course card to teach, explain or review it, including when the child asks for one. Not an assessment.',
        parameters: { type: 'object', properties: { card_id: { type: 'string', enum: this.session.course.cards.map((c) => c.id) } }, required: ['card_id'], additionalProperties: false } },
      { type: 'function', name: 'record_assessment', description: 'Record the child\'s actual attempt to say the displayed English target. The application returns what was actually saved.',
        parameters: { type: 'object', properties: {
          target_id: { type: 'string', description: 'Use the screen ID in the latest [app] State: card ID for word teaching, question ID (e.g. q5) for practice, NOT the sentence card ID.' },
          result: { type: 'string', enum: ['correct', 'close', 'wrong'], description: 'correct = understandable complete English target, alone, in a longer sentence or mixed with Chinese; close = recognizable but incomplete or unclear English; wrong = an attempt without the required English. This is about the child\'s words, never about how they sounded.' },
          heard: { type: 'string', description: 'What you think the child said; your own report, not a transcription.' }, evidence: { type: 'string', description: 'One short factual line: which cue you gave, what the child did.' },
          mastered: { type: 'boolean', description: 'Passed for the course so far, not lasting mastery: true only when the child recalled or used the word on their own in a different situation than the one you just modelled (fill-in-the-blank, own sentence, answer to a new cue). A correct echo or imitation is practice only: keep false. A choice answer alone is not recall. Put the situation and what the child did in evidence.' },
          next_action: { type: 'string', enum: ['retry', 'review', 'advance', 'skip'], description: 'retry = same word, easier or different help; review = revisit later in another situation; advance = move on; skip is never mastery.' },
          next_card_id: { type: ['string', 'null'], description: 'For advance/skip in the word lesson: another card to show next. Null for retry/review and for practice questions.' },
          next_phase: { type: ['string', 'null'], enum: ['reinforcement', null], description: 'reinforcement only when every word of the course has been passed or deliberately deferred; null otherwise, including when this sitting is just ending.' },
        }, required: ['target_id', 'result', 'heard', 'evidence', 'mastered', 'next_action', 'next_card_id', 'next_phase'], additionalProperties: false } },
      { type: 'function', name: 'start_practice', description: 'Move from the word lesson to the practice questions once every word of the course was taught (passed, or deliberately deferred). Never to finish early because the sitting is long.',
        parameters: { type: 'object', properties: {}, additionalProperties: false } },
    ];
  }
  private instructions(): string {
    const s = this.session;
    return `You are 麻吉老师, a warm and patient English tutor for a young Chinese-speaking child in a live voice lesson. Speak simple Chinese with clear, unhurried English demonstrations. Make one small teaching move and invite at most one response per turn, then listen; a brief scaffold may take more than two sentences. The child may talk at any time, including while you speak; answer what they actually said. No professional pronunciation scores.
The screen shows one course card or practice question at a time; [app] messages and tool results tell you what is on screen and what was actually saved. Course: ${JSON.stringify({ title: s.course.title, opening: s.course.teachingHints.opening, sentences: s.course.objectives.sentences })}. Learning targets: ${JSON.stringify(s.course.cards.map(({ id, english, chinese, kind, drillParts }) => ({ id, english, chinese, kind, drillParts })))}. Use these learning targets; brief familiar context and answers to the child's questions are welcome, without adding unrelated learning goals.
SITTING: The course is taught over several short sittings. This sitting is about 10-15 minutes and covers about 4-6 new words; the rest wait for next time, and progress is saved. Never rush to finish the course. When an [app] message says the time is nearly up, finish the current word, run a short recall game with today's words, and say goodbye.
TEACHING: Build 2-3 related words into one small situation (e.g. at the park: run, jump, walk), chosen on the spot from the words still to pass. Keep the child mostly speaking and doing. Move each word up and down this ladder by how the child responds: understand it from the situation, choose between two ("is the dog running or sleeping?"), echo it, fill a gap ("the dog sees the ball and ... ?"), use it freely or in a short sentence ("I can run!"). If the child succeeds, go up; if stuck or silent, go down one step instead of repeating the same question. Chinese is a help, not a ritual announcement on every card. Once words are familiar, weave in the course's target sentences. Never reuse one fixed praise-then-model-then-repeat template.
PASSING A WORD: Passed (mastered=true) means: in a different situation from the one just modelled, the child recalled or used the word on their own (gap or own use). An echo right after your model, even perfect, is practice: record it with mastered=false and next_action retry, then ask for the word again in a new situation without handing the answer over. A child who already uses the word independently can pass immediately; do not drill what they already know.
EACH TURN: Do one thing: one model or one question, then hand over the turn clearly ("your turn") and stop to wait. If the child stays silent, go one step easier (offer two choices, give the first sound, show the situation again), not the same question again. Wait patiently when the child pauses mid-answer.
FEEDBACK: Be specific and tied to meaning ("the dog is running!"), not generic praise every time. If the child's try is not quite right, say the correct version naturally once and continue, without saying "wrong". If the child answers in Chinese, first confirm the meaning is right, then give the English ("对，就是跑！英文是 run"). After two tries with the same kind of help, change the help (situation, splitting the sound with the card's drillParts, two choices).
CHILD TALKS: If the child interrupts, asks something or shares their own story, answer that first, then connect back to the word. If they are tired or bored, offer a choice (another game, a break), defer the word without awarding mastery (skip), or wrap up early with a normal goodbye; never push. The child may speak over you: a short echo or "mm" while you demonstrate does not stop you, and you get their words afterwards. If their input was a try at the English target, treat it as an attempt and assess it; if it was only agreement, just continue. You have audio and card metadata, not a camera: never claim to see the child or their room.
RETURNING: When the child comes back to a course, first help them recall 2-3 words passed before, in a new situation and gently (hints are fine, forgetting is not failure). Recall answers do not remove a passed word.
SUMMARY: Say only what we practised today and what comes next time, never "you have learned everything" and never that the course is complete unless the app says so. For sentence practice, teach its meaning and invite the full sentence; use chunks only when needed. Partial sentences still need support. The practice quiz may pass on a correct full repetition.
Tools: show_card to teach, explain or review a card (when the child asks about another card, e.g. "猫那个再讲一下", show that card). record_assessment ONLY when the child actually tried to say the displayed English target: questions, requests (again, slower, another card), chit-chat, Chinese without trying the English, and silence are not attempts; just respond to them. Decide mastery and retry/review/advance/skip yourself from the child's needs; do not drill one word forever. start_practice only once every word of the course has been taught. Practice pick-word questions are answered by tapping; the app checks them. For repeat-after-me questions assess the whole sentence; next_card_id and next_phase stay null.
ORDER RULE: when a tool is needed, the tool call is the very first thing in your response, with no words before it: no preamble, no "let me listen", no "我先听一下/我来看看". Speak only after its result, then give the actual feedback directly. Never claim something was saved, mastered or completed before a result says ok:true; ok:false means nothing changed.
TOOL RECOVERY: Internal tool errors are not the child's mistake. Never mention saving, system errors, target IDs or tool details to the child. On an argument/target error, use expected_target to reassess the SAME existing audio and retry once before speaking; do not ask the child to repeat to fix bookkeeping. Do not invent an attempt when there is no associated input. If recovery fails, do not claim a pass; briefly ask a parent for help. After success, simply give learning feedback, without announcing that data was saved.
Lesson state (phase, what is on screen, words not yet passed, passed words, passed questions) arrives in [app] State messages; the most recent one is current.`;
  }
}

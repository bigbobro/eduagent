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
}
type RequestKind = 'opening' | 'followup' | 'present-quiz' | 'repeat' | 'pick-feedback' | 'goodbye';
interface AppRequest { id: string; kind: RequestKind; note?: string; parent?: string; quizId?: string; feedbackFor?: string; noTools?: boolean }
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
  constructor(private session: Session, private port: ConversationPort) {}

  /** Initial session configuration for the provider call. Long-lived credentials never reach this payload. */
  sessionConfig(model: string): object {
    return { type: 'realtime', model, instructions: this.instructions(), tools: this.tools(), tool_choice: 'auto', max_output_tokens: 1200,
      audio: { input: { turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: true, interrupt_response: true } }, output: { voice: 'marin' } } };
  }
  start(resumed: boolean): void {
    if (this.session.currentPhase === 'intro') { this.commit(changePhase(this.session, 'interactive')); this.refresh(); }
    const card = this.card(this.session.memory.currentCardId);
    const note = this.session.currentPhase === 'interactive'
      ? `[app] ${resumed ? 'The child is back to continue this lesson.' : 'Lesson started.'} Screen shows card ${card?.id} (${card?.english} / ${card?.chinese}). Greet in one short sentence, then teach this card.`
      : '[app] The child is back for practice questions. Welcome them in one short Chinese sentence; the app shows the next question.';
    this.enqueue({ kind: 'opening', note });
  }
  close(): void { if (this.inflight) clearTimeout(this.inflight.timer); this.inflight = null; this.queue = []; }

  setPresented(target: PresentedTarget): void {
    const phase = this.session.currentPhase;
    if (target.kind === 'card' && !(this.card(target.id) && ['intro', 'interactive'].includes(phase))) throw new Error('INVALID_TARGET');
    if (target.kind === 'quiz' && !(phase === 'reinforcement' && this.quiz(target.id))) throw new Error('INVALID_TARGET');
    if (this.presented?.kind === target.kind && this.presented.id === target.id) return;
    this.presented = target;
    this.refresh();
  }
  presentQuiz(quizId: string): void {
    const quiz = this.quiz(quizId);
    if (!quiz || this.session.currentPhase !== 'reinforcement' || this.presented?.kind !== 'quiz' || this.presented.id !== quizId) throw new Error('INVALID_INPUT_ASSOCIATION');
    if (this.queue.some((r) => r.quizId === quizId) || this.inflight?.request.quizId === quizId) return;
    const word = quiz.type === 'pick-word' ? this.card(quiz.correctCardId)?.english : undefined;
    this.enqueue({ kind: 'present-quiz', quizId, noTools: true, note: quiz.type === 'pick-word'
      ? `[app] Screen shows practice question ${quiz.id}: listen and tap the picture. Say only the English word "${word}" once or twice, clearly. Do not reveal its position, Chinese meaning or picture.`
      : `[app] Screen shows practice question ${quiz.id}: repeat-after-me sentence "${quiz.targetText}". Demonstrate the full sentence, then slower short chunks, then the full sentence, and invite the child to say it. Assess only when the child then tries it.` });
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
    this.refresh(); this.pump();
    return receipt;
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      // Question prompts and the goodbye wait for resume; chatty follow-ups are dropped.
      this.queue = this.queue.filter((request) => SURVIVES_SPEECH.includes(request.kind));
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
        break;
      case 'input_audio_buffer.speech_stopped': this.childSpeaking = false; break;
      case 'input_audio_buffer.committed':
        this.childSpeaking = false;
        if (event.item_id) { if (!this.inputs.has(event.item_id)) this.inputs.set(event.item_id, { target: this.presented }); this.lastInput = event.item_id; }
        break;
      case 'response.created': this.created(event); break;
      case 'response.output_audio_transcript.delta': {
        const response = event.response_id ? this.responses.get(event.response_id) : undefined;
        if (response && response.transcript.length < 4000) response.transcript += event.delta ?? '';
        break;
      }
      case 'response.done': this.done(event); break;
      case 'error': {
        const code = safeCode(event.error?.code);
        log.warn('provider event error', { sessionId: this.session.id, code });
        const request = this.inflight?.request;
        if (request && event.error?.event_id === request.id) {
          clearTimeout(this.inflight!.timer); this.inflight = null;
          // A VAD response won the race; the child's turn now owns the conversation.
          if (code === 'CONVERSATION_ALREADY_HAS_ACTIVE_RESPONSE' && request.kind !== 'followup') this.queue.unshift(request);
        }
        break;
      }
    }
    this.pump();
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
    const input = request ? request === 'followup' ? parent?.input ?? null : null : this.lastInput;
    if (!request) this.lastInput = null;
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
    this.refresh();
    if (!this.childSpeaking) this.queue.unshift({ id: this.requestId(), kind: 'followup', parent: response.id, feedbackFor, noTools: this.toolStreak >= 3 });
  }
  private execute(name: string, raw: string, input: string | null): { output: object; feedbackFor?: string } {
    let args: unknown;
    try { args = JSON.parse(raw); } catch { return { output: { ok: false, error: 'INVALID_ARGUMENTS' } }; }
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
      if (name !== 'record_assessment') return { output: { ok: false, error: 'UNKNOWN_TOOL' } };
      if (!input) return { output: { ok: false, error: 'NO_CHILD_INPUT', note: 'Only a real child attempt can be assessed.' } };
      const record = this.inputs.get(input);
      if (record?.receipt) return { output: { ...this.summary(record.receipt), duplicate: true } };
      if (!record?.target) return { output: { ok: false, error: 'NO_PRESENTED_TARGET' } };
      const assessment = realtimeAssessmentSchema.parse(args);
      if (assessment.target_id !== record.target.id) {
        return { output: { ok: false, error: 'INVALID_INPUT_ASSOCIATION', note: `The child was looking at ${record.target.id} when speaking; nothing was saved.` } };
      }
      const receipt = submitAssessment(this.session, { id: input, targetId: record.target.id, kind: 'audio' }, assessment);
      record.receipt = receipt;
      this.commit(receipt);
      return { output: this.summary(receipt), feedbackFor: input };
    } catch (error) {
      const code = errorCode(error, 'INVALID_ARGUMENTS');
      log.warn('tool rejected', { sessionId: this.session.id, tool: name, code });
      return { output: { ok: false, error: code, note: 'Nothing changed.', displayed: snapshot(this.session).cardId } };
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
  private pump(): void {
    if (this.paused || this.childSpeaking || this.active.size || this.inflight || !this.queue.length) return;
    const request = this.queue.shift()!;
    if (request.note) this.port.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: request.note }] } });
    const metadata: Record<string, string> = { kind: request.kind, request: request.id };
    if (request.parent) metadata.parent = request.parent;
    if (request.quizId) metadata.quiz_id = request.quizId;
    if (request.feedbackFor) metadata.feedback_for = request.feedbackFor;
    // A request that never produced response.created must not block later app requests forever.
    const timer = setTimeout(() => { if (this.inflight?.request === request) { this.inflight = null; this.pump(); } }, 10_000);
    timer.unref?.();
    this.inflight = { request, timer };
    this.port.send({ type: 'response.create', event_id: request.id, response: { metadata, ...(request.noTools ? { tool_choice: 'none' } : {}) } });
  }
  private refresh(): void { this.port.send({ type: 'session.update', session: { type: 'realtime', instructions: this.instructions() } }); }
  private card(id: string) { return this.session.course.cards.find((card) => card.id === id); }
  private quiz(id: string) { return this.session.course.phases.reinforcement.quizzes.find((quiz) => quiz.id === id); }
  private remaining() { return this.session.course.cards.filter((c) => c.kind === 'word' && !this.session.memory.clearedCardIds.includes(c.id)).map(({ id, english }) => ({ id, english })); }
  private tools(): object[] {
    return [
      { type: 'function', name: 'show_card', description: 'Display a course card to teach, explain or review it, including when the child asks for one. Not an assessment.',
        parameters: { type: 'object', properties: { card_id: { type: 'string', enum: this.session.course.cards.map((c) => c.id) } }, required: ['card_id'], additionalProperties: false } },
      { type: 'function', name: 'record_assessment', description: 'Record the child\'s actual attempt to say the displayed English target. The application returns what was actually saved.',
        parameters: { type: 'object', properties: {
          target_id: { type: 'string', description: 'Displayed card id, or displayed repeat-after-me question id.' },
          result: { type: 'string', enum: ['correct', 'close', 'wrong'], description: 'correct = understandable complete English target, alone, in a longer sentence or mixed with Chinese; close = recognizable incomplete or unclear English attempt; wrong = attempt without the required English.' },
          heard: { type: 'string', description: 'What you think the child said; your own report, not a transcription.' }, evidence: { type: 'string' },
          mastered: { type: 'boolean', description: 'Your judgment that the child can now say it; no fixed hit count.' },
          next_action: { type: 'string', enum: ['retry', 'review', 'advance', 'skip'], description: 'skip is never mastery.' },
          next_card_id: { type: ['string', 'null'], description: 'For advance/skip in the word lesson: another card to show next. Null for retry/review and for practice questions.' },
          next_phase: { type: ['string', 'null'], enum: ['reinforcement', null], description: 'reinforcement only when all remaining words are taught; null otherwise.' },
        }, required: ['target_id', 'result', 'heard', 'evidence', 'mastered', 'next_action', 'next_card_id', 'next_phase'], additionalProperties: false } },
      { type: 'function', name: 'start_practice', description: 'Move from the word lesson to the practice questions once every remaining word was taught (mastered, or deliberately deferred).',
        parameters: { type: 'object', properties: {}, additionalProperties: false } },
    ];
  }
  private instructions(): string {
    const s = this.session; const screen = this.presented ?? (s.currentPhase === 'interactive' ? { kind: 'card', id: s.memory.currentCardId } : null);
    return `You are 麻吉老师, a warm and patient English tutor for a young Chinese-speaking child in a live voice lesson. Speak simple Chinese with clear English demonstrations. Keep each turn short (one or two short sentences), then stop and listen. The child may talk at any time, including while you speak; answer what they actually said. No professional pronunciation scores.
The screen shows one course card or practice question at a time; [app] messages and tool results tell you what is on screen and what was actually saved. Teach only this course: ${JSON.stringify(s.course.cards.map(({ id, english, chinese, kind }) => ({ id, english, chinese, kind })))}.
Tools: show_card to teach, explain or review a card (when the child asks about another card, e.g. "猫那个再讲一下", show that card). record_assessment ONLY when the child actually tried to say the displayed English target: questions, requests (again, slower, another card), chit-chat, Chinese without trying the English, and silence are not attempts; just respond to them. Decide mastery and retry/review/advance/skip yourself from the child's needs; do not drill one word forever. start_practice once all remaining words have been taught. Practice pick-word questions are answered by tapping; the app checks them. For repeat-after-me questions assess the whole sentence; next_card_id and next_phase stay null.
ORDER RULE: when a tool is needed, the tool call is the very first thing in your response, with no words before it: no preamble, no "let me listen", no "我先听一下/我来看看". Speak only after its result, then give the actual feedback directly. Never claim something was saved, mastered or completed before a result says ok:true; ok:false means nothing changed.
State: phase ${s.currentPhase}; screen ${screen ? `${screen.kind} ${screen.id}` : 'loading'}. Remaining word goals (teach each, do not silently drop any): ${JSON.stringify(this.remaining())}. Mastered: ${JSON.stringify(s.memory.clearedCardIds)}. Passed questions: ${JSON.stringify(s.memory.passedQuizIds)}.`;
  }
}

import { createLogger } from '@/lib/logger';
import { getConfig, getRealtimeTurnMode } from '@/lib/config';
import { createSession, createSessionFromSnapshot } from '@/lib/agent/session';
import { isResumableProgress, resolveResumeCardId } from '@/lib/agent/course-progress';
import { getCourseProgress } from '@/lib/db/queries';
import { getLearner } from '@/lib/db/learners';
import { getCourseById } from '@/data/courses';
import type { MockUtterance, PresentedTarget, RealtimeEvent } from '@/lib/realtime-protocol';
import type { ResumeInfo } from '@/lib/lesson-protocol';
import type { PhaseName } from '@/types/course';
import { sessionStore, type Session } from '@/lib/agent/session-store';
import { MockRealtimeCall } from './mock';
import { openAiCallFactory, type CallFactory, type RealtimeCall } from './call';
import { NaturalConversation, SITTING, type ProviderMessage } from './conversation';
import { markUsageIncomplete, requireOwner, type TeachingReceipt } from './teaching';

const log = createLogger('realtime-classroom');
const IDLE_MS = 10 * 60_000;
// Browser smoke only: REALTIME_TEST_SITTING_MS="wrapUpMs,goodbyeMs" shortens the FIRST sitting of this server process, so a
// later sitting of the same smoke can run its full length. It also applies to a caller-owned live test server (a short paid
// sitting); the packaged app never sets it.
const testSitting = globalThis as typeof globalThis & { __eduagentTestSittingUsed?: boolean };
function sittingTiming(): typeof SITTING {
  const raw = process.env.REALTIME_TEST_SITTING_MS;
  if (!raw || testSitting.__eduagentTestSittingUsed) return SITTING;
  const [wrapUpMs, goodbyeMs] = raw.split(',').map(Number);
  if (!(wrapUpMs > 0) || !(goodbyeMs > wrapUpMs)) return SITTING;
  testSitting.__eduagentTestSittingUsed = true;
  log.info('test sitting timing', { wrapUpMs, goodbyeMs });
  return { wrapUpMs, goodbyeMs };
}
export class RealtimeClassroomSession {
  readonly session: Session;
  readonly resume: ResumeInfo | null;
  readonly transport: 'webrtc' | 'mock';
  readonly turnMode = getRealtimeTurnMode();
  private conversation: NaturalConversation;
  private call: RealtimeCall | null = null;
  private push: ((event: RealtimeEvent) => void) | null = null;
  private connecting = false;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private expired = false;
  constructor(courseId: string, learnerId: string, fresh = false, private callFactory?: CallFactory) {
    const course = getCourseById(courseId);
    if (!course || !getLearner(learnerId)) throw new Error('NOT_FOUND');
    const progress = !fresh ? getCourseProgress(courseId, learnerId) : undefined;
    const resumed = progress && isResumableProgress(progress);
    this.session = resumed ? createSessionFromSnapshot(course, progress, learnerId, 'realtime') : createSession(course, learnerId, 'realtime');
    if (!this.session.memory.currentCardId) {
      const card = course.cards.find((item) => item.kind === 'word');
      this.session.memory.currentCardId = card?.id ?? ''; this.session.memory.currentWord = card?.english ?? '';
    }
    this.resume = resumed ? { resumed: true, phase: this.session.currentPhase, clearedCardIds: [...this.session.memory.clearedCardIds],
      passedQuizIds: [...this.session.memory.passedQuizIds], resumeCardId: resolveResumeCardId(course, this.session.memory) } : null;
    if (this.resume?.resumeCardId) {
      this.session.memory.currentCardId = this.resume.resumeCardId;
      this.session.memory.currentWord = course.cards.find((c) => c.id === this.resume!.resumeCardId)?.english ?? '';
    }
    this.session.tokenUsage.realtime = { model: getConfig().realtimeModel, usage: [], complete: true };
    this.transport = callFactory || !getConfig().voiceMock ? 'webrtc' : 'mock';
    this.conversation = new NaturalConversation(this.session, {
      send: (event) => this.call?.send(event),
      publish: (receipt) => this.emit({ type: 'receipt', receipt }),
      sittingEnded: () => this.emit({ type: 'sitting-ended' }),
      clearOutput: () => this.emit({ type: 'clear-output' }),
    }, sittingTiming(), { manualTurn: this.turnMode === 'manual' });
    this.session.lifetime.signal.addEventListener('abort', () => this.close(), { once: true });
    this.armIdle();
  }
  /** Creates the provider call once and returns its SDP answer; receipts and provider state then stream to `push`. */
  async connect(sdp: string | null, push: (event: RealtimeEvent) => void): Promise<string | null> {
    this.require();
    if (this.connecting || this.call) throw new Error('CALL_EXISTS');
    this.connecting = true; this.push = push;
    const onEvent = (event: ProviderMessage) => this.provider(event);
    const onClose = (code: string) => { log.warn('provider closed', { sessionId: this.session.id, code }); this.fail(code); };
    const options = { sdp, session: this.conversation.sessionConfig(getConfig().realtimeModel), signal: this.session.lifetime.signal, onEvent, onClose };
    const factory: CallFactory = this.callFactory ?? (this.transport === 'mock'
      ? async () => ({ answer: null, call: new MockRealtimeCall(this.session, { onEvent, session: options.session }) })
      : openAiCallFactory(getConfig().openaiApiKey));
    let opened: Awaited<ReturnType<CallFactory>>;
    try { opened = await factory(options); } finally { this.connecting = false; }
    const { answer, call } = opened;
    if (this.expired) { call.close(); throw new Error('SESSION_EXPIRED'); }
    this.call = call;
    log.info('call connected', { sessionId: this.session.id, transport: this.transport });
    this.conversation.start(Boolean(this.resume));
    return answer;
  }
  presented(target: PresentedTarget): void { this.require(); this.conversation.setPresented(target); }
  presentQuiz(quizId: string): void { this.require(); this.conversation.presentQuiz(quizId); }
  repeat(cardId: string): void { this.require(); this.conversation.repeat(cardId); }
  pick(turnId: string, quizId: string, cardId: string): TeachingReceipt { this.require(); return this.conversation.pick(turnId, quizId, cardId); }
  phase(to: PhaseName): TeachingReceipt { this.require(); return this.conversation.changePhase(to); }
  pause(paused: boolean): void { this.require(); this.conversation.setPaused(paused); }
  /** Experimental manual-turn mode: the child started or stopped speaking (NOT_FOUND outside that mode). */
  speech(phase: 'start' | 'end', voicedMs?: number): void { this.require(); this.conversation.childSpeech(phase, voicedMs); }
  mockSpeech(utterance: MockUtterance): void {
    this.require();
    if (!(this.call instanceof MockRealtimeCall)) throw new Error('NOT_FOUND');
    this.call.speak(utterance);
  }
  close(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null; this.expired = true; this.conversation.close();
    // Responses still open at the end never reported usage; their pending marks keep the estimate incomplete.
    this.call?.close(); this.call = null; this.push = null;
  }
  expire(): void {
    this.close(); this.session.lifetime.abort(); sessionStore.delete(this.session.id);
  }
  private provider(event: ProviderMessage): void {
    if (this.expired) return;
    this.armIdle();
    this.conversation.handle(event);
    const forwarded = NaturalConversation.forBrowser(event);
    if (forwarded) this.emit({ type: 'provider', event: forwarded });
  }
  private fail(code: string): void {
    if (this.expired) return;
    try { markUsageIncomplete(this.session); } catch { /* The session may already be revoked by a newer lesson. */ }
    this.emit({ type: 'error', code, message: '实时老师断开了，请重新进入课堂，从已保存的进度继续。' });
    this.expire();
  }
  private emit(event: RealtimeEvent): void { this.push?.(event); }
  private require(): void {
    requireOwner(this.session.id, this.session.learnerId);
    if (this.expired) throw new Error('SESSION_EXPIRED');
    this.armIdle();
  }
  private armIdle() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => { log.info('idle expiry', { sessionId: this.session.id }); this.fail('SESSION_IDLE'); }, IDLE_MS);
    this.idle.unref?.();
  }
}

// Used by HTTP routes only; provider sockets never cross the client boundary.
const globals = globalThis as typeof globalThis & { __eduagentRealtime?: Map<string, RealtimeClassroomSession> };
export const realtimeClassrooms = globals.__eduagentRealtime ??= new Map<string, RealtimeClassroomSession>();
export function registerClassroom(classroom: RealtimeClassroomSession): void {
  realtimeClassrooms.set(classroom.session.id, classroom);
  classroom.session.lifetime.signal.addEventListener('abort', () => realtimeClassrooms.delete(classroom.session.id), { once: true });
}

import { createLogger } from '@/lib/logger';
import { createHash } from 'node:crypto';
import { getConfig } from '@/lib/config';
import { createSession, createSessionFromSnapshot } from '@/lib/agent/session';
import { isResumableProgress, resolveResumeCardId } from '@/lib/agent/course-progress';
import { getCourseProgress } from '@/lib/db/queries';
import { getLearner } from '@/lib/db/learners';
import { getCourseById } from '@/data/courses';
import type { RealtimeEvent, RealtimeIntent } from '@/lib/realtime-protocol';
import type { ResumeInfo } from '@/lib/lesson-protocol';
import { sessionStore, type Session } from '@/lib/agent/session-store';
import { MockRealtimeProvider } from './mock';
import { RealtimeConnection, type RealtimeProvider } from './connection';
import { beginResponseUsage, changePhase, recordUsage, saveFeedback, requireOwner, showCard, snapshot, submitAssessment, submitPick, type InputTurn, type TeachingReceipt } from './teaching';

const log = createLogger('realtime-classroom');
interface TurnState { fingerprint: string; input?: InputTurn; receipt?: TeachingReceipt; complete?: boolean }
export class RealtimeClassroomSession {
  readonly session: Session;
  readonly resume: ResumeInfo | null;
  private provider: RealtimeProvider | null = null;
  private turns = new Map<string, TurnState>();
  private busy = false;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private expired = false;
  private presentedQuizId: string | null = null;
  private failedTurnId: string | null = null;
  constructor(courseId: string, learnerId: string, fresh = false,
    private providerFactory: (session: Session) => RealtimeProvider = (session) => getConfig().voiceMock ? new MockRealtimeProvider(session) : new RealtimeConnection(getConfig().openaiApiKey, getConfig().realtimeModel, session.lifetime.signal)) {
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
    this.session.lifetime.signal.addEventListener('abort', () => this.close(), { once: true });
    this.armIdle();
  }
  close(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null; this.expired = true; this.provider?.close(); this.provider = null;
  }
  expire(): void {
    this.close(); this.session.lifetime.abort(); sessionStore.delete(this.session.id);
  }
  private armIdle() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.expire(), 120_000);
    this.idle.unref?.();
  }
  async turn(turnId: string, intent: RealtimeIntent, emit: (event: RealtimeEvent) => void, signal: AbortSignal): Promise<void> {
    requireOwner(this.session.id, this.session.learnerId);
    if (this.expired) throw new Error('SESSION_EXPIRED');
    if (this.busy) throw new Error('TURN_BUSY');
    if (this.failedTurnId && this.failedTurnId !== turnId) throw new Error('SESSION_EXPIRED');
    if (this.turns.size >= 1000) throw new Error('SESSION_LIMIT');
    // The PCM is held only for the active request, not retained in the idempotency ledger.
    const fingerprint = createHash('sha256').update(JSON.stringify(intent)).digest('hex');
    let turn = this.turns.get(turnId);
    if (turn && turn.fingerprint !== fingerprint) throw new Error('TURN_REUSED');
    turn ??= { fingerprint };
    this.turns.set(turnId, turn);
    if (turn.complete && intent.kind === 'phase') { emit({ type: 'receipt', receipt: snapshot(this.session) }); emit({ type: 'done' }); return; }
    this.busy = true;
    if (this.idle) clearTimeout(this.idle);
    const activeSignal = AbortSignal.any([signal, this.session.lifetime.signal]);
    try {
      let receipt = turn.receipt ?? turn.input?.receipt;
      const pcm = intent.kind === 'audio' ? decodeAudio(intent.pcm) : undefined;
      if (intent.kind === 'audio' && !receipt) {
        validateAudioTarget(this.session, intent.targetId);
        if (this.session.currentPhase === 'reinforcement' && this.presentedQuizId !== intent.targetId) throw new Error('INVALID_INPUT_ASSOCIATION');
      }
      if (pcm?.every((byte) => byte === 0)) { emit({ type: 'done' }); turn.complete = true; return; }
      let task = '';
      if (intent.kind === 'phase') {
        receipt ??= changePhase(this.session, intent.to); turn.receipt = receipt;
        emit({ type: 'receipt', receipt }); emit({ type: 'done' }); turn.complete = true; return;
      }
      if (intent.kind === 'intro-card' || intent.kind === 'repeat') {
        receipt ??= showCard(this.session, intent.cardId); turn.receipt = receipt;
        const card = this.session.course.cards.find((c) => c.id === intent.cardId)!;
        task = `Explain the displayed card ${card.english} / ${card.chinese} briefly in Chinese, clearly demonstrate its English, invite repetition. Do not assess any child input or change cards.`;
      } else if (intent.kind === 'opening') {
        task = this.session.currentPhase === 'intro'
          ? `Give ONE short warm Chinese introduction, at most 25 Chinese characters and at most two English word examples from: ${this.session.course.cards.filter((c) => c.kind === 'word').map((c) => c.english).join(', ')}. No assessment; no claims that anything is mastered.`
          : 'Welcome the child back briefly in Chinese. Mention the current target only if interactive. No assessment.';
      } else if (intent.kind === 'present-quiz') {
        if (this.session.currentPhase !== 'reinforcement') throw new Error('INVALID_PHASE');
        const quiz = this.session.course.phases.reinforcement.quizzes.find((q) => q.id === intent.quizId);
        if (!quiz) throw new Error('INVALID_TARGET');
        this.presentedQuizId = quiz.id;
        task = quiz.type === 'pick-word'
          ? `Listen-and-pick-picture question: say only the English word ${this.session.course.cards.find((c) => c.id === quiz.correctCardId)!.english}. Do not reveal positions, Chinese translations or picture descriptions.`
          : `Demonstrate the exact sentence ${quiz.targetText}: full sentence, then slower short chunks, then full sentence. No child input or assessment exists.`;
      } else if (intent.kind === 'pick') {
        if (this.presentedQuizId !== intent.quizId) throw new Error('INVALID_INPUT_ASSOCIATION');
        turn.input ??= { id: turnId, targetId: intent.quizId, kind: 'pick', picked: intent.cardId };
        receipt ??= submitPick(this.session, turn.input); turn.receipt = receipt;
        task = `The application has checked the child's picture choice. Actual committed result: ${JSON.stringify(receipt.quiz)}. Give brief Chinese feedback; do not change the result or reveal a wrong answer's picture position. No speech assessment.`;
      } else if (intent.kind === 'audio') {
        turn.input ??= { id: turnId, targetId: intent.targetId, kind: 'audio' };
        task = assessmentInstructions(this.session, intent.targetId);
      }
      if (receipt) emit({ type: 'receipt', receipt });
      this.provider ??= this.providerFactory(this.session);
      let toolFailed = false;
      let feedback = '';
      await this.provider.turn({ turnId, targetId: intent.kind === 'audio' ? intent.targetId : undefined, signal: activeSignal,
        instructions: `${baseInstructions(this.session)}\n${receipt && intent.kind === 'audio' ? `This input is ALREADY COMMITTED. Do not assess again. Give brief feedback only for this receipt: ${JSON.stringify(receipt)}.` : task}`,
        pcm: receipt ? undefined : pcm,
        assess: intent.kind === 'audio' && !receipt ? (args) => {
          activeSignal.throwIfAborted();
          try {
            receipt = submitAssessment(this.session, turn!.input!, args);
            turn!.receipt = receipt;
            emit({ type: 'receipt', receipt });
            return receipt;
          } catch (error) {
            const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : 'ASSESSMENT_NOT_SAVED';
            log.warn('tool rejected', { sessionId: this.session.id, turnId, code });
            toolFailed = true;
            return { ...snapshot(this.session), ok: false, error: 'ASSESSMENT_NOT_SAVED' };
          }
        } : undefined,
        audio: (audio) => { activeSignal.throwIfAborted(); emit({ type: 'audio', pcm: audio.toString('base64') }); },
        transcript: (text) => { activeSignal.throwIfAborted(); feedback += text; emit({ type: 'transcript', text }); },
        started: () => beginResponseUsage(this.session),
        usage: (usage) => recordUsage(this.session, usage),
      });
      if (toolFailed) throw new Error('ASSESSMENT_NOT_SAVED');
      if (receipt?.assessment || receipt?.quiz) saveFeedback(this.session, turnId, feedback);
      turn.complete = true; this.failedTurnId = null;
      log.info('turn complete', { sessionId: this.session.id, turnId, intent: intent.kind });
      emit({ type: 'done' });
    } catch (error) {
      // A broken provider is never silently replaced or switched to Doubao. The UI restarts from its checkpoint.
      this.provider?.close(); this.provider = null; this.failedTurnId = turnId; throw error;
    } finally { this.busy = false; if (!this.expired) this.armIdle(); }
  }
}
function decodeAudio(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('INVALID_PCM');
  const pcm = Buffer.from(value, 'base64');
  if (pcm.length < 4800 || pcm.length > 1_440_000 || pcm.length % 2) throw new Error('INVALID_PCM');
  return pcm;
}
function validateAudioTarget(session: Session, targetId: string): void {
  if (session.currentPhase === 'interactive' && session.memory.currentCardId === targetId && session.course.cards.some((c) => c.id === targetId)) return;
  const quiz = session.course.phases.reinforcement.quizzes.find((q) => q.id === targetId);
  if (session.currentPhase === 'reinforcement' && quiz?.type === 'repeat-after-me') return;
  throw new Error('INVALID_TARGET');
}
function baseInstructions(session: Session): string {
  return `You are a kind English tutor for a Chinese-speaking child. Speak briefly in Chinese with clear English examples. No professional pronunciation scores. The application alone executes and saves operations. Never claim progress saved before a successful tool receipt. An unsuccessful receipt means nothing was saved. For audio assessment, do not greet, teach another target, or announce a new phase in the feedback: the screen changes after playback and a separate demonstration follows. Current phase: ${session.currentPhase}; current card: ${session.memory.currentCardId}. Only use this course: ${JSON.stringify(session.course.cards.map(({ id, english, kind }) => ({ id, english, kind })))}. Remaining WORD goals (must teach each; do not silently omit untouched goals): ${JSON.stringify(session.course.cards.filter((c) => c.kind === 'word' && !session.memory.clearedCardIds.includes(c.id)).map(({id, english}) => ({id, english})))}. Mastered cards: ${JSON.stringify(session.memory.clearedCardIds)}. Passed quizzes: ${JSON.stringify(session.memory.passedQuizIds)}.`;
}
function assessmentInstructions(session: Session, targetId: string): string {
  const quiz = session.course.phases.reinforcement.quizzes.find((q) => q.id === targetId);
  const target = quiz?.type === 'repeat-after-me' ? quiz.targetText : session.course.cards.find((c) => c.id === targetId)?.english;
  return `Assess ONLY current user audio for target ${target} (target_id ${targetId}). correct = understandable complete English target, alone or within a longer sentence or Chinese-English mix; close = recognizable incomplete or unclear English attempt; wrong = audible answer without required English; off_topic = unrelated comment/request; silence = no audible speech. Audible Chinese or unclear speech is not silence. heard is tentative model self-report, never verified transcription. Do not guess words from the target. Decide mastery independently, and retry/review/advance/skip based on the child's needs; no fixed hit count. Skip is not mastery. For interactive words you may select any course card next; only once all remaining word goals have been taught and mastered (or you explicitly decided to defer a struggling current goal), propose next_phase reinforcement. For a retry/review keep next_card_id null; for advance/skip choose a different appropriate card or next_phase reinforcement. For a repeat-after-me quiz next_card_id and next_phase must be null; decide retry/review or advance/skip, and report correct only if the whole intended target is understandable. Call record_assessment exactly once. After its receipt give a single short Chinese feedback sentence about this attempt, not the next target.`;
}

// Used by HTTP routes only; provider sockets never cross the client boundary.
const globals = globalThis as typeof globalThis & { __eduagentRealtime?: Map<string, RealtimeClassroomSession> };
export const realtimeClassrooms = globals.__eduagentRealtime ??= new Map<string, RealtimeClassroomSession>();
export function registerClassroom(classroom: RealtimeClassroomSession): void {
  realtimeClassrooms.set(classroom.session.id, classroom);
  classroom.session.lifetime.signal.addEventListener('abort', () => realtimeClassrooms.delete(classroom.session.id), { once: true });
}

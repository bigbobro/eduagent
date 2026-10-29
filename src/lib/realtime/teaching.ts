import { getSession } from '@/lib/agent/session';
import type { Session } from '@/lib/agent/session-store';
import { serializeProgress, isCourseComplete } from '@/lib/agent/course-progress';
import { getDb } from '@/lib/db';
import { insertInteraction, touchLessonLog, updateRealtimeFeedback, upsertCourseProgress, upsertWordPerformance } from '@/lib/db/queries';
import { realtimeAssessmentSchema, type RealtimeAssessment, type RealtimeUsage } from '@/lib/realtime-protocol';
import type { LessonProgressSnapshot } from '@/lib/lesson-protocol';
import type { PhaseName } from '@/types/course';
import type { QuizResult } from '@/lib/voice/classroom';

export interface TeachingReceipt {
  ok: boolean;
  error?: string;
  progress: LessonProgressSnapshot;
  cardId: string;
  quiz?: QuizResult;
  assessment?: RealtimeAssessment;
}
export interface InputTurn {
  id: string; targetId: string; kind: 'audio' | 'pick';
  picked?: string; receipt?: TeachingReceipt;
}
export function requireOwner(sessionId: string, learnerId: string): Session {
  const session = getSession(sessionId);
  if (!session || session.learnerId !== learnerId || session.mode !== 'realtime') throw new Error('SESSION_EXPIRED');
  return session;
}
export function snapshot(session: Session): TeachingReceipt {
  return { ok: true, cardId: session.memory.currentCardId, progress: {
    clearedCardIds: [...session.memory.clearedCardIds],
    totalAttempts: Array.from(session.memory.wordPerformance.values()).reduce((n, word) => n + word.attempts, 0),
    currentPhase: session.currentPhase,
  } };
}
function persist(session: Session, memory: Session['memory'], phase = session.currentPhase) {
  upsertCourseProgress(session.courseId, serializeProgress(memory), phase, isCourseComplete(session.course, memory), session.learnerId);
}
export function changePhase(session: Session, to: PhaseName): TeachingReceipt {
  requireOwner(session.id, session.learnerId);
  const phases: PhaseName[] = ['intro', 'interactive', 'reinforcement', 'done'];
  if (phases.indexOf(to) < phases.indexOf(session.currentPhase) || phases.indexOf(to) > phases.indexOf(session.currentPhase) + 1) throw new Error('INVALID_PHASE');
  if (to === 'reinforcement' && session.course.phases.reinforcement.quizzes.every((q) => session.memory.passedQuizIds.includes(q.id))) to = 'done';
  getDb().transaction(() => persist(session, session.memory, to))();
  session.currentPhase = to; session.revision++;
  return snapshot(session);
}
export function showCard(session: Session, cardId: string): TeachingReceipt {
  requireOwner(session.id, session.learnerId);
  const card = session.course.cards.find((item) => item.id === cardId);
  if (!card || !['intro', 'interactive'].includes(session.currentPhase)) throw new Error('INVALID_TARGET');
  const memory = { ...session.memory, currentCardId: cardId, currentWord: card.english };
  getDb().transaction(() => persist(session, memory))();
  session.memory = memory; session.revision++;
  return snapshot(session);
}
/** First assessment for a real input wins; backend checks structure/ownership, not pronunciation. */
export function submitAssessment(session: Session, turn: InputTurn, raw: unknown): TeachingReceipt {
  requireOwner(session.id, session.learnerId);
  if (turn.receipt) return turn.receipt;
  const assessment = realtimeAssessmentSchema.parse(raw);
  if (assessment.mastered && assessment.next_action === 'skip') throw new Error('INVALID_ASSESSMENT');
  if (turn.kind !== 'audio' || assessment.target_id !== turn.targetId) throw new Error('INVALID_INPUT_ASSOCIATION');
  const quiz = session.course.phases.reinforcement.quizzes.find((item) => item.id === turn.targetId);
  const card = session.course.cards.find((item) => item.id === turn.targetId);
  if (quiz) {
    if (session.currentPhase !== 'reinforcement' || quiz.type !== 'repeat-after-me') throw new Error('INVALID_TARGET');
  } else if (!card || session.currentPhase !== 'interactive' || session.memory.currentCardId !== turn.targetId) throw new Error('INVALID_TARGET');
  if (assessment.next_card_id && !session.course.cards.some((item) => item.id === assessment.next_card_id)) throw new Error('INVALID_NEXT_CARD');
  if (quiz && assessment.next_card_id) throw new Error('INVALID_NEXT_CARD');
  const phases: PhaseName[] = ['intro', 'interactive', 'reinforcement', 'done'];
  let phase = assessment.next_phase ?? session.currentPhase;
  if (phases.indexOf(phase) < phases.indexOf(session.currentPhase) || phases.indexOf(phase) > phases.indexOf(session.currentPhase) + 1) throw new Error('INVALID_PHASE');
  const memory = structuredClone(session.memory);
  const attempted = ['correct', 'close', 'wrong'].includes(assessment.result);
  if (card) {
    if (attempted) {
      const previous = memory.wordPerformance.get(card.english) ?? { attempts: 0, correct: 0, lastAttempt: new Date() };
      memory.wordPerformance.set(card.english, { attempts: previous.attempts + 1, correct: previous.correct + (assessment.result === 'correct' ? 1 : 0), lastAttempt: new Date() });
      if (memory.cardProgress[card.id] !== 'cleared') memory.cardProgress[card.id] = 'attempted';
    }
    if (assessment.mastered) {
      memory.cardProgress[card.id] = 'cleared';
      if (!memory.clearedCardIds.includes(card.id)) memory.clearedCardIds.push(card.id);
      if (!memory.wordsLearned.includes(card.english)) memory.wordsLearned.push(card.english);
    }
    if (assessment.next_card_id) {
      const next = session.course.cards.find((item) => item.id === assessment.next_card_id)!;
      memory.currentCardId = next.id; memory.currentWord = next.english;
    }
  }
  if (quiz && assessment.result === 'correct' && !memory.passedQuizIds.includes(quiz.id)) memory.passedQuizIds.push(quiz.id);
  if (phase === 'reinforcement' && session.course.phases.reinforcement.quizzes.every((q) => memory.passedQuizIds.includes(q.id))) phase = 'done';
  memory.totalInteractions++;
  getDb().transaction(() => {
    if (card && attempted) upsertWordPerformance(session.id, card.english, assessment.result === 'correct');
    insertInteraction(session.id, { timestamp: new Date(), userInput: assessment.heard, aiResponse: '', actions: [],
      modelCalls: { llm: { latency: 0, inputTokens: 0, outputTokens: 0 }, assessment: { source: 'model', turnId: turn.id, ...assessment } } });
    touchLessonLog(session.id, session.lessonInteractionCount + 1, session.tokenUsage);
    persist(session, memory, phase);
  })();
  session.memory = memory; session.currentPhase = phase; session.lessonInteractionCount++; session.revision++;
  const receipt = snapshot(session);
  receipt.assessment = assessment;
  if (quiz) receipt.quiz = { quizId: quiz.id, ok: true, correct: assessment.result === 'correct', source: 'model',
    next: ['advance', 'skip'].includes(assessment.next_action) ? 'advance' : 'retry' };
  turn.receipt = receipt;
  return receipt;
}
export function submitPick(session: Session, turn: InputTurn): TeachingReceipt {
  requireOwner(session.id, session.learnerId);
  if (turn.receipt) return turn.receipt;
  const quiz = session.course.phases.reinforcement.quizzes.find((q) => q.id === turn.targetId);
  if (turn.kind !== 'pick' || !quiz || quiz.type !== 'pick-word' || session.currentPhase !== 'reinforcement'
    || ![quiz.correctCardId, ...quiz.distractorCardIds, ...session.course.cards.filter((c) => c.kind === 'word').map((c) => c.id)].includes(turn.picked ?? '')) throw new Error('INVALID_TARGET');
  const correct = turn.picked === quiz.correctCardId;
  const memory = structuredClone(session.memory);
  if (correct && !memory.passedQuizIds.includes(quiz.id)) memory.passedQuizIds.push(quiz.id);
  memory.totalInteractions++;
  getDb().transaction(() => {
    insertInteraction(session.id, { timestamp: new Date(), userInput: turn.picked ?? '', aiResponse: '', actions: [],
      modelCalls: { llm: { latency: 0, inputTokens: 0, outputTokens: 0 }, assessment: { source: 'application', turnId: turn.id, target_id: quiz.id, result: correct ? 'correct' : 'wrong' } } });
    touchLessonLog(session.id, session.lessonInteractionCount + 1, session.tokenUsage); persist(session, memory);
  })();
  session.memory = memory; session.lessonInteractionCount++; session.revision++;
  const receipt = snapshot(session);
  receipt.quiz = { quizId: quiz.id, ok: true, correct, source: 'application', next: correct ? 'advance' : 'retry' };
  turn.receipt = receipt; return receipt;
}
export function recordUsage(session: Session, usage: RealtimeUsage | null): void {
  // Usage can arrive as a session is cancelled. Keep cost on this lesson only, never a newer checkpoint.
  const tokenUsage = structuredClone(session.tokenUsage);
  const realtime = tokenUsage.realtime ?? { model: 'gpt-realtime-2.1', usage: [], complete: true };
  realtime.pending = Math.max(0, (realtime.pending ?? 0) - 1);
  if (usage) realtime.usage.push(usage); else realtime.complete = false;
  tokenUsage.realtime = realtime;
  getDb().transaction(() => touchLessonLog(session.id, session.lessonInteractionCount, tokenUsage))();
  session.tokenUsage = tokenUsage;
}

export function saveFeedback(session: Session, turnId: string, text: string): void {
  requireOwner(session.id, session.learnerId);
  updateRealtimeFeedback(session.id, turnId, text);
}

export function beginResponseUsage(session: Session): void {
  requireOwner(session.id, session.learnerId);
  const usage = structuredClone(session.tokenUsage);
  if (!usage.realtime) throw new Error('INVALID_USAGE_STATE');
  usage.realtime.pending = (usage.realtime.pending ?? 0) + 1;
  touchLessonLog(session.id, session.lessonInteractionCount, usage);
  session.tokenUsage = usage;
}

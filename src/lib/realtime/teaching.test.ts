import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, createSessionFromSnapshot, endSession, getSession } from '@/lib/agent/session';
import { getDb } from '@/lib/db';
import { getCourseProgress } from '@/lib/db/queries';
import { sessionStore, type Session } from '@/lib/agent/session-store';
import { changePhase, requireOwner, submitAssessment, submitPick, type InputTurn } from './teaching';

let session: Session;
beforeEach(() => { session = createSession(foodCourse, 'test-learner', 'realtime'); changePhase(session, 'interactive'); session.memory.currentCardId = 'apple'; });
afterEach(() => { getDb().exec('DROP TRIGGER IF EXISTS reject_realtime_write'); session.lifetime.abort(); sessionStore.delete(session.id); });
const assessment = { target_id: 'apple', result: 'correct', heard: 'apple', evidence: 'understandable', mastered: true, next_action: 'advance', next_card_id: 'banana', next_phase: null } as const;
function input(): InputTurn { return { id: 'turn-1', targetId: 'apple', kind: 'audio' }; }
describe('Realtime teaching transactions', () => {
  it('commits model mastery once without forging legacy hits and resumes it in the old mode', () => {
    const turn = input();
    submitAssessment(session, turn, assessment);
    expect(submitAssessment(session, turn, { ...assessment, result: 'wrong' })).toBe(turn.receipt);
    expect(session.memory.cardProgress.apple).toBe('cleared');
    expect(session.memory.cardCorrectCount.apple ?? 0).toBe(0);
    expect(getDb().prepare('SELECT attempts, correct, rc_correct FROM word_performance WHERE lesson_id = ?').get(session.id)).toEqual({ attempts: 1, correct: 1, rc_correct: null });
    const progress = getCourseProgress(foodCourse.id, 'test-learner')!;
    const old = createSessionFromSnapshot(foodCourse, progress, 'test-learner');
    expect(old.memory.cardProgress.apple).toBe('cleared');
    expect(getSession(session.id)).toBeUndefined();
    endSession(session.id); // A late old end must not replace the new checkpoint.
    expect(requireOwner.bind(null, session.id, 'test-learner')).toThrow('SESSION_EXPIRED');
    old.lifetime.abort(); sessionStore.delete(old.id);
  });
  it('rolls back a failed write without awarding progress or consuming the input', () => {
    const before = structuredClone(session.memory); const turn = input();
    getDb().exec("CREATE TEMP TRIGGER reject_realtime_write BEFORE INSERT ON interaction_logs BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
    expect(() => submitAssessment(session, turn, assessment)).toThrow();
    expect(session.memory).toEqual(before); expect(turn.receipt).toBeUndefined();
    getDb().exec('DROP TRIGGER reject_realtime_write');
    expect(submitAssessment(session, turn, assessment).ok).toBe(true);
  });
  it('checks actual input target, phase and child ownership without matching transcript words', () => {
    expect(() => submitAssessment(session, input(), { ...assessment, target_id: 'banana' })).toThrow('INVALID_INPUT_ASSOCIATION');
    expect(() => requireOwner(session.id, 'another-child')).toThrow('SESSION_EXPIRED');
    submitAssessment(session, input(), { ...assessment, heard: 'tentative model perception' });
    expect(session.memory.cardProgress.apple).toBe('cleared');
  });
  it('does not count off-topic/silence or claim skipped words are mastered', () => {
    submitAssessment(session, input(), { ...assessment, result: 'off_topic', mastered: false, next_action: 'skip' });
    expect(session.memory.wordPerformance.size).toBe(0);
    expect(session.memory.clearedCardIds).toEqual([]);
    expect(getCourseProgress(foodCourse.id, 'test-learner')?.completed).toBe(false);
  });
  it('determines picture choices from the course and deduplicates a repeated input', () => {
    changePhase(session, 'reinforcement');
    const turn: InputTurn = { id: 'pick-1', targetId: 'q1', kind: 'pick', picked: 'milk' };
    expect(submitPick(session, turn).quiz).toMatchObject({ correct: false, source: 'application', next: 'retry' });
    turn.picked = 'apple';
    expect(submitPick(session, turn).quiz?.correct).toBe(false);
    expect(session.memory.passedQuizIds).toEqual([]);
  });
  it('leaves an explicit completion exit when all quizzes were already passed', () => {
    session.memory.passedQuizIds = foodCourse.phases.reinforcement.quizzes.map((q) => q.id);
    expect(changePhase(session, 'reinforcement').progress.currentPhase).toBe('done');
    expect(getCourseProgress(foodCourse.id, 'test-learner')?.completed).toBe(false);
    const restored = createSessionFromSnapshot(foodCourse, getCourseProgress(foodCourse.id, 'test-learner')!, 'test-learner', 'realtime');
    expect(restored.currentPhase).toBe('interactive'); restored.lifetime.abort(); sessionStore.delete(restored.id);
  });
});

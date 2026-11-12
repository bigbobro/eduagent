import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, createSessionFromSnapshot, endSession, getSession } from '@/lib/agent/session';
import { getDb } from '@/lib/db';
import { getCourseProgress } from '@/lib/db/queries';
import { createLearner } from '@/lib/db/learners';
import { sessionStore, type Session } from '@/lib/agent/session-store';
import { changePhase, requireOwner, seedCollection, snapshot, submitAssessment, submitPick, type InputTurn } from './teaching';

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
  it('accepts a card assessment in the reinforcement phase (the assessor can land just after start_practice)', () => {
    changePhase(session, 'reinforcement');
    const receipt = submitAssessment(session, input(), { ...assessment, next_card_id: null });
    expect(receipt.ok).toBe(true); expect(session.memory.clearedCardIds).toEqual(['apple']); expect(session.currentPhase).toBe('reinforcement');
  });
  it('rejects a card assessment outside the interactive and reinforcement phases', () => {
    const intro = createSession(foodCourse, 'test-learner', 'realtime');
    expect(() => submitAssessment(intro, { id: 't', targetId: 'apple', kind: 'audio' }, { ...assessment, next_card_id: null })).toThrow('INVALID_TARGET');
    intro.lifetime.abort(); sessionStore.delete(intro.id);
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

describe('word collection (never shrinks)', () => {
  const turn = (id: string, targetId: string): InputTurn => ({ id, targetId, kind: 'audio' });
  const child = (name: string) => createLearner(name).id;
  it('collects a word only when the child recalls it unprompted, and never a sentence', () => {
    const learner = child('collector-a'); const own = createSession(foodCourse, learner, 'realtime'); changePhase(own, 'interactive');
    seedCollection(own, false);
    expect(snapshot(own).progress.collectedCardIds).toEqual([]);
    own.memory.currentCardId = 'apple';
    expect(submitAssessment(own, turn('t1', 'apple'), { ...assessment, result: 'close', mastered: false, next_action: 'retry', next_card_id: null }).progress.collectedCardIds).toEqual([]);
    // A correct echo is practice: nothing collected yet.
    expect(submitAssessment(own, turn('t2', 'apple'), { ...assessment, mastered: false, next_action: 'retry', next_card_id: null }).progress.collectedCardIds).toEqual([]);
    expect(submitAssessment(own, turn('t3', 'apple'), { ...assessment, next_card_id: null }).progress.collectedCardIds).toEqual(['apple']);
    expect(submitAssessment(own, turn('t4', 'apple'), { ...assessment, next_card_id: null }).progress.collectedCardIds).toEqual(['apple']);
    own.memory.currentCardId = 'sentence_apple';
    expect(submitAssessment(own, turn('t5', 'sentence_apple'), { ...assessment, target_id: 'sentence_apple', next_card_id: null }).progress.collectedCardIds).toEqual(['apple']);
    own.lifetime.abort(); sessionStore.delete(own.id);
  });
  it('keeps the collection when a later lesson starts over, and treats a completed course as fully collected', () => {
    const learner = child('collector-b'); const first = createSession(foodCourse, learner, 'realtime'); changePhase(first, 'interactive');
    seedCollection(first, false); first.memory.currentCardId = 'egg';
    submitAssessment(first, turn('t1', 'egg'), { ...assessment, target_id: 'egg', next_card_id: null });
    first.memory.currentCardId = 'milk';
    submitAssessment(first, turn('t2', 'milk'), { ...assessment, target_id: 'milk', next_card_id: null });
    first.memory.currentCardId = 'apple';
    submitAssessment(first, turn('t3', 'apple'), { ...assessment, mastered: false, next_action: 'retry', next_card_id: null }); // echoed only
    // A fresh review: new session, empty memory, breakpoint about to be overwritten. History still knows both words, in course order.
    const review = createSession(foodCourse, learner, 'realtime'); seedCollection(review, false);
    expect(review.memory.clearedCardIds).toEqual([]);
    expect(snapshot(review).progress.collectedCardIds).toEqual(['milk', 'egg']);
    const other = createSession(foodCourse, child('collector-c'), 'realtime'); seedCollection(other, false);
    expect(snapshot(other).progress.collectedCardIds).toEqual([]); // another child's history does not leak
    seedCollection(other, true);
    expect(snapshot(other).progress.collectedCardIds).toEqual(foodCourse.cards.filter((c) => c.kind === 'word').map((c) => c.id));
    for (const s of [first, review, other]) { s.lifetime.abort(); sessionStore.delete(s.id); }
  });
});
it('rejects contradictory skip and mastery fields without awarding the input', () => {
  const turn = input();
  expect(() => submitAssessment(session, turn, { ...assessment, next_action: 'skip', mastered: true })).toThrow('INVALID_ASSESSMENT');
  expect(session.memory.clearedCardIds).toEqual([]); expect(turn.receipt).toBeUndefined();
});

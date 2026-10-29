import { expect, it } from 'vitest';
import { getCourseById } from '../../src/data/courses';
import { createMemory, initializeCardProgress } from '../../src/lib/agent/memory';
import { serializeProgress, deserializeProgress, resolveResumeCardId } from '../../src/lib/agent/course-progress';
import { parseCourseProgressRow } from '../../src/lib/db/progress-snapshot';
import { mapPrototypeAssessments } from './checkpoint';

it('round-trips model mastery through the existing checkpoint without inventing old hit counts', () => {
  const course = getCourseById('animals')!;
  const memory = mapPrototypeAssessments(course, [
    { turnId: 'one', assessment: { card_id: 'cat', result: 'wrong', heard: 'dog', evidence: 'wrong word', mastered: false, next_action: 'review' } },
    { turnId: 'two', assessment: { card_id: 'cat', result: 'correct', heard: 'cat', evidence: 'target', mastered: true, next_action: 'advance' } },
  ]);
  const row = parseCourseProgressRow({ courseId: course.id, phase: 'interactive', completed: 0,
    snapshot: JSON.stringify(serializeProgress(memory)), updatedAt: new Date().toISOString() });
  const oldModeResume = initializeCardProgress(deserializeProgress(createMemory(), row.snapshot), course);
  expect(oldModeResume.clearedCardIds).toEqual(['cat']);
  expect(oldModeResume.cardCorrectCount.cat).toBeUndefined();
  expect(resolveResumeCardId(course, oldModeResume)).toBe('dog');
  expect(oldModeResume.wordPerformance.get('cat')).toMatchObject({ attempts: 2, correct: 1 });
});

it('preserves old progress on model resume and keeps a skipped goal unfinished', () => {
  const course = getCourseById('animals')!;
  const old = initializeCardProgress(createMemory(), course);
  old.currentCardId = 'cat'; old.cardCorrectCount.cat = 1; old.cardProgress.cat = 'attempted';
  old.passedQuizIds = [course.phases.reinforcement.quizzes[0].id];
  const memory = mapPrototypeAssessments(course, [
    { turnId: 'one', assessment: { card_id: 'cat', result: 'wrong', heard: 'dog', evidence: 'wrong', mastered: false, next_action: 'skip' } },
    { turnId: 'one', assessment: { card_id: 'cat', result: 'correct', heard: 'cat', evidence: 'duplicate', mastered: true } },
    { turnId: 'two', assessment: { card_id: 'dog', result: 'correct', heard: 'dog', evidence: 'target', mastered: true } },
  ], serializeProgress(old));
  expect(memory.cardCorrectCount.cat).toBe(1);
  expect(memory.cardProgress.cat).toBe('needs_review');
  expect(memory.clearedCardIds).toEqual(['dog']);
  expect(memory.passedQuizIds).toEqual(old.passedQuizIds);
  expect(memory.wordPerformance.get('cat')).toMatchObject({ attempts: 1, correct: 0 });
  expect(resolveResumeCardId(course, memory)).toBe('cat');
});

/** Scratch mapping experiment. Never writes the application's database. */
import type { Course } from '../../src/types/course';
import type { CourseProgressSnapshot, LessonMemory } from '../../src/types/session';
import { createMemory, initializeCardProgress } from '../../src/lib/agent/memory';
import { deserializeProgress, resolveResumeCardId } from '../../src/lib/agent/course-progress';
import type { Assessment } from './session';

export function mapPrototypeAssessments(course: Course, turns: Array<{ turnId: string; assessment: Assessment }>,
  previous?: CourseProgressSnapshot): LessonMemory {
  const memory = initializeCardProgress(previous ? deserializeProgress(createMemory(), previous) : createMemory(), course);
  const seen = new Set<string>();
  for (const { turnId, assessment } of turns) {
    if (seen.has(turnId)) continue;
    seen.add(turnId);
    const card = course.cards.find((c) => c.id === assessment.card_id && c.kind === 'word');
    if (!card) throw new Error('Prototype assessment target is not a course word');
    if (['correct', 'close', 'wrong'].includes(assessment.result)) {
      const old = memory.wordPerformance.get(card.english);
      memory.wordPerformance.set(card.english, { attempts: (old?.attempts ?? 0) + 1,
        correct: (old?.correct ?? 0) + Number(assessment.result === 'correct'), lastAttempt: new Date() });
    }
    if (assessment.mastered) {
      memory.cardProgress[card.id] = 'cleared';
      if (!memory.clearedCardIds.includes(card.id)) memory.clearedCardIds.push(card.id);
      if (!memory.wordsLearned.includes(card.english)) memory.wordsLearned.push(card.english);
    } else if (assessment.next_action === 'skip' && memory.cardProgress[card.id] !== 'cleared') {
      memory.cardProgress[card.id] = 'needs_review';
      if (!memory.wordsToReview.includes(card.english)) memory.wordsToReview.push(card.english);
    }
    memory.totalInteractions++;
  }
  memory.currentCardId = resolveResumeCardId(course, memory);
  memory.currentWord = course.cards.find((c) => c.id === memory.currentCardId)?.english ?? '';
  memory.phase = 'learning';
  return memory;
}

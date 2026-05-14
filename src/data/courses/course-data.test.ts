import { describe, expect, it } from 'vitest';
import { allCourses } from '.';

describe('course drill data', () => {
  it('defines non-empty drillParts for every card', () => {
    for (const course of allCourses) {
      for (const card of course.cards) {
        expect(card.drillParts, `${course.id}/${card.id}`).toBeDefined();
        expect(card.drillParts.length, `${course.id}/${card.id}`).toBeGreaterThan(0);
        expect(card.drillParts.every((part) => part.trim().length > 0), `${course.id}/${card.id}`).toBe(true);
      }
    }
  });
});

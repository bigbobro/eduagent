import { describe, expect, it } from 'vitest';
import { allCourses } from '.';
import { validateCourse, validateCourseAssets } from './course-validator';

describe('course catalog', () => {
  it('registers the visible test course catalog', () => {
    expect(allCourses.map((course) => course.id)).toEqual([
      'food',
      'colors',
      'sports',
      'animals',
      'family',
      'toys',
      'clothes',
      'weather',
      'body',
      'shapes',
      'home',
      'nature',
      'actions',
      'school',
      'fruits',
      'vegetables',
      'ocean',
      'farm',
      'jobs',
      'insects',
      'feelings',
      'playground',
      'opposites',
      'instruments',
      'party',
      'bathroom',
      'space',
      'hobbies',
      'magic',
      'treats',
      'tools',
      'city-places',
      'construction',
      'art-supplies',
      'technology',
      'tableware',
      'camping',
      'safety',
      'cleaning',
      'travel',
    ]);
  });

  it('every course passes structural validation', () => {
    for (const course of allCourses) {
      expect(validateCourse(course), course.id).toEqual([]);
    }
  });

  it('every course image asset exists on disk', () => {
    for (const course of allCourses) {
      expect(validateCourseAssets(course), course.id).toEqual([]);
    }
  });

  it('introduction phase carries no legacy scene asset field', () => {
    // Guards against reintroducing the removed `sceneImage` field (was per-course in food.test.ts).
    for (const course of allCourses) {
      expect('sceneImage' in course.phases.introduction, course.id).toBe(false);
    }
  });
});

// Content spot-checks: per-course authored values (tone, caption wording, exact
// sentences) that the structural validator deliberately does NOT pin. Migrated here
// from the former food/colors/sports per-course test files so they live in one place.
const CONTENT_SPOT_CHECKS: Array<{
  id: string;
  tone: string;
  captionIncludes: string;
  sentences: string[];
  sentenceImageUrls?: string[];
}> = [
  {
    id: 'food',
    tone: 'peach',
    captionIncludes: '食物',
    sentences: ['This is an apple.', 'I like milk.', 'I want water.', 'I eat rice.'],
    sentenceImageUrls: ['/images/food/apple.png', '/images/food/milk.png', '/images/food/water.png', '/images/food/rice.png'],
  },
  { id: 'colors', tone: 'sky', captionIncludes: '颜色', sentences: ['It is red.', 'I see blue.', 'I like pink.', 'This is green.'] },
  { id: 'sports', tone: 'mint', captionIncludes: '运动', sentences: ['I can play soccer.', 'I like running.', 'I play tennis.', 'I like swimming.'] },
];

describe('course content spot-checks', () => {
  for (const spot of CONTENT_SPOT_CHECKS) {
    it(`${spot.id}: tone, caption and sentences match the authored content`, () => {
      const course = allCourses.find((c) => c.id === spot.id);
      expect(course, spot.id).toBeDefined();
      if (!course) return;
      expect(course.tone, `${spot.id} tone`).toBe(spot.tone);
      expect(course.phases.introduction.sceneCaption, `${spot.id} caption`).toContain(spot.captionIncludes);
      expect(course.objectives.sentences, `${spot.id} sentences`).toEqual(spot.sentences);
      if (spot.sentenceImageUrls) {
        const sentenceImages = course.cards.filter((c) => c.kind === 'sentence').map((c) => c.imageUrl);
        expect(sentenceImages, `${spot.id} sentence images`).toEqual(spot.sentenceImageUrls);
      }
    });
  }
});

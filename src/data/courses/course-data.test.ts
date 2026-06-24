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
});

import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/courses/route';

describe('/api/courses', () => {
  it('returns the visible test course catalog', async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const courses = await res.json();
    expect(courses.map((course: { id: string }) => course.id)).toEqual([
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
    ]);
    expect(courses.find((course: { id: string }) => course.id === 'colors')?.tone).toBe('sky');
    expect(courses.find((course: { id: string }) => course.id === 'sports')?.tone).toBe('mint');
  });
});

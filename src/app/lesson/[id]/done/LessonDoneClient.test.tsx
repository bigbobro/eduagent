import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressSnapshot } from '@/types/progress';
import { LessonDoneClient } from './LessonDoneClient';

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/lesson/food/done',
  useRouter: () => ({ push: routerPush }),
}));

const progress: ProgressSnapshot = {
  courses: [
    {
      courseId: 'food',
      courseTitle: '食物 Food',
      courseTone: 'peach',
      totalWords: 12,
      masteredWords: 2,
      timesStarted: 0,
      progressPercent: 0,
      hasResume: false,
      completed: false,
      words: [
        { word: 'apple', zh: '苹果', attempts: 2, correct: 2, masteryStars: 2, lastPracticed: '2026-05-22T00:00:00.000Z' },
        { word: 'milk', zh: '牛奶', attempts: 2, correct: 2, masteryStars: 2, lastPracticed: '2026-05-22T00:00:00.000Z' },
      ],
    },
  ],
  totalWordsMastered: 2,
  generatedAt: '2026-05-22T00:00:00.000Z',
};

describe('LessonDoneClient', () => {
  beforeEach(() => {
    routerPush.mockClear();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/learners') return Promise.resolve(new Response(JSON.stringify([{ id: 'test-learner', name: '宝宝' }])));
      if (url.startsWith('/api/sessions')) return new Response('[]');
      if (url.startsWith('/api/stats')) return new Response(JSON.stringify({ totalSessions:1,totalMinutes:15,last7Days:[] }));
      if (url !== '/api/progress?learnerId=test-learner') throw new Error(`unexpected fetch: ${url}`);
      return new Response(JSON.stringify(progress), { status: 200 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads progress without depending on the course catalog request', async () => {
    render(<LessonDoneClient courseId="food" />);

    expect(await screen.findByRole('heading', { name: '食物课,过关 2 个词' })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalledWith('/api/courses');
    expect(fetch).toHaveBeenCalledWith('/api/progress?learnerId=test-learner');
  });
});

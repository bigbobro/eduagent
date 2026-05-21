import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProgressSnapshot } from '@/types/progress';
import { JournalPage } from './JournalPage';

const snapshot: ProgressSnapshot = {
  totalWordsMastered: 1,
  generatedAt: '2026-05-20T00:00:00.000Z',
  courses: [
    {
      courseId: 'food',
      courseTitle: '食物',
      courseTone: 'peach',
      totalWords: 2,
      masteredWords: 1,
      words: [
        { word: 'apple', zh: '苹果', imageUrl: '/images/food/apple.png', attempts: 2, correct: 2, masteryStars: 2, lastPracticed: '2026-05-20T00:00:00.000Z' },
        { word: 'milk', zh: '牛奶', imageUrl: '/images/food/milk.png', attempts: 0, correct: 0, masteryStars: 0, lastPracticed: null },
      ],
    },
  ],
};

describe('JournalPage', () => {
  it('renders collected words in the spellbook layout', () => {
    render(<JournalPage snapshot={snapshot} onBack={() => {}} onRetry={() => {}} />);

    expect(screen.getByText('我的魔法书')).toBeTruthy();
    expect(screen.getAllByText('食物').length).toBeGreaterThan(0);
    expect(screen.getByText('apple')).toBeTruthy();
    expect(screen.getByText('milk')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'apple' })).toBeTruthy();
  });

  it('renders retry state when progress fetch fails', () => {
    render(<JournalPage snapshot={null} error onBack={() => {}} onRetry={() => {}} />);

    expect(screen.getByText('魔法书暂时打不开')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy();
  });

  it('opens the first practiced course instead of always using the first catalog course', () => {
    const multiCourseSnapshot: ProgressSnapshot = {
      totalWordsMastered: 0,
      generatedAt: '2026-05-20T00:00:00.000Z',
      courses: [
        {
          courseId: 'food',
          courseTitle: '食物',
          courseTone: 'peach',
          totalWords: 1,
          masteredWords: 0,
          words: [
            { word: 'apple', zh: '苹果', attempts: 0, correct: 0, masteryStars: 0, lastPracticed: null },
          ],
        },
        {
          courseId: 'colors',
          courseTitle: '颜色',
          courseTone: 'sky',
          totalWords: 1,
          masteredWords: 0,
          words: [
            { word: 'red', zh: '红色', imageUrl: '/images/colors/red.png', attempts: 2, correct: 1, masteryStars: 1, lastPracticed: '2026-05-20T00:00:00.000Z' },
          ],
        },
      ],
    };

    render(<JournalPage snapshot={multiCourseSnapshot} onBack={() => {}} onRetry={() => {}} />);

    expect(screen.queryByText('先去大厅上一节课,魔法书就会亮起来。')).toBeNull();
    expect(screen.getByText('red')).toBeTruthy();
  });

  it('lets the user switch active course chapters', () => {
    const multiCourseSnapshot: ProgressSnapshot = {
      totalWordsMastered: 1,
      generatedAt: '2026-05-20T00:00:00.000Z',
      courses: [
        {
          courseId: 'food',
          courseTitle: '食物',
          courseTone: 'peach',
          totalWords: 1,
          masteredWords: 1,
          words: [
            { word: 'apple', zh: '苹果', attempts: 2, correct: 2, masteryStars: 3, lastPracticed: '2026-05-20T00:00:00.000Z' },
          ],
        },
        {
          courseId: 'colors',
          courseTitle: '颜色',
          courseTone: 'sky',
          totalWords: 1,
          masteredWords: 0,
          words: [
            { word: 'red', zh: '红色', attempts: 1, correct: 0, masteryStars: 1, lastPracticed: '2026-05-20T00:00:00.000Z' },
          ],
        },
      ],
    };

    render(<JournalPage snapshot={multiCourseSnapshot} onBack={() => {}} onRetry={() => {}} />);

    expect(screen.getByText('apple')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看课程:颜色' }));
    expect(screen.getByText('red')).toBeTruthy();
  });
});

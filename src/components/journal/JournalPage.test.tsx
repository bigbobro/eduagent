import { render, screen } from '@testing-library/react';
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
        { word: 'apple', zh: '苹果', attempts: 2, correct: 2, masteryStars: 2, lastPracticed: '2026-05-20T00:00:00.000Z' },
        { word: 'milk', zh: '牛奶', attempts: 0, correct: 0, masteryStars: 0, lastPracticed: null },
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
  });

  it('renders retry state when progress fetch fails', () => {
    render(<JournalPage snapshot={null} error onBack={() => {}} onRetry={() => {}} />);

    expect(screen.getByText('魔法书暂时打不开')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy();
  });
});

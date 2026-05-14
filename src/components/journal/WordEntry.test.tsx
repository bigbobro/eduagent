import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordEntry } from './WordEntry';
import type { WordMastery } from '@/types/progress';

const unlearned: WordMastery = {
  word: 'car',
  zh: '小汽车',
  attempts: 0,
  correct: 0,
  masteryStars: 0,
  lastPracticed: null,
};
const mastered: WordMastery = {
  word: 'bus',
  zh: '公交车',
  attempts: 10,
  correct: 10,
  masteryStars: 3,
  lastPracticed: '2026-05-10T10:00:00Z',
};

describe('WordEntry', () => {
  it('unlearned word shows lock icon', () => {
    render(<WordEntry word={unlearned} />);
    expect(screen.getByLabelText(/未学过/)).toBeTruthy();
  });
  it('3-star mastery uses gold background', () => {
    render(<WordEntry word={mastered} />);
    const el = screen.getByLabelText(/掌握 3 星/);
    expect(el.className).toMatch(/bunny-gold/);
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Bunny } from '@/components/bunny/Bunny';
import { LetterCard } from '@/components/home/LetterCard';
import { BloomButton } from '@/components/lesson/BloomButton';
import type { Course } from '@/types/course';

const course: Course = {
  id: 'x',
  title: '测试',
  description: '',
  targetAge: [3, 6],
  theme: 'transport',
  cards: [],
  objectives: { sentences: [] },
  teachingHints: { opening: '', reviewCardIds: [], newCardIds: [], quizQuestions: [], closing: '' },
};

describe('a11y basics', () => {
  it('Bunny exposes role=img + aria-label', () => {
    render(<Bunny pose="stand" />);
    expect(screen.getByRole('img', { name: /Bunny/i })).toBeTruthy();
  });

  it('LetterCard aria-label contains course title', () => {
    render(<LetterCard course={course} position={{ x: 0, y: 0, rotate: 0 }} onClick={() => {}} />);
    expect(screen.getByLabelText(/开始课程.*测试/)).toBeTruthy();
  });

  it('BloomButton has aria-label + focus ring class', () => {
    render(<BloomButton onPressStart={() => {}} onPressEnd={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('按住说话');
    expect(btn.className).toMatch(/focus-visible:ring/);
  });
});

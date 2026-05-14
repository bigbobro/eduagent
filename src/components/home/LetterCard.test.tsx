import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LetterCard } from './LetterCard';
import type { Course } from '@/types/course';

const course: Course = {
  id: 'transportation',
  title: '交通工具',
  description: '学交通工具',
  targetAge: [3, 6],
  theme: 'transport',
  cards: [],
  objectives: { sentences: [] },
  teachingHints: { opening: '', reviewCardIds: [], newCardIds: [], quizQuestions: [], closing: '' },
};

describe('LetterCard', () => {
  it('renders course title in aria-label', () => {
    render(<LetterCard course={course} position={{ x: 0, y: 0, rotate: 0 }} onClick={vi.fn()} />);
    expect(screen.getByLabelText(/开始课程.*交通工具/)).toBeTruthy();
  });
  it('triggers onClick', () => {
    const onClick = vi.fn();
    render(<LetterCard course={course} position={{ x: 0, y: 0, rotate: 0 }} onClick={onClick} />);
    fireEvent.click(screen.getByLabelText(/开始课程/));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('theme=transport uses bunny-wood envelope', () => {
    render(<LetterCard course={course} position={{ x: 0, y: 0, rotate: 0 }} onClick={vi.fn()} />);
    const el = screen.getByLabelText(/开始课程/);
    expect(el.className).toMatch(/bunny-wood/);
  });
});

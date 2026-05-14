import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { QuizPickWord } from './QuizPickWord';

const quiz = {
  id: 'q1',
  type: 'pick-word' as const,
  prompt: 'Where is the apple?',
  correctCardId: 'apple',
  distractorCardIds: ['milk', 'bread'],
};

describe('QuizPickWord', () => {
  it('renders prompt and image options', () => {
    render(<QuizPickWord quiz={quiz} course={foodCourse} onAnswer={() => {}} />);
    expect(screen.getByText(/Where is the apple/)).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('苹果')).toBeTruthy();
    expect(screen.getByText('apple')).toBeTruthy();
  });

  it('calls onAnswer(correct=true) when correct card tapped', () => {
    const onAnswer = vi.fn();
    render(<QuizPickWord quiz={quiz} course={foodCourse} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /苹果 apple/i }));
    expect(onAnswer).toHaveBeenCalledWith({ correct: true, picked: 'apple' });
  });

  it('calls onAnswer(correct=false) when distractor tapped', () => {
    const onAnswer = vi.fn();
    render(<QuizPickWord quiz={quiz} course={foodCourse} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /牛奶 milk/i }));
    expect(onAnswer).toHaveBeenCalledWith({ correct: false, picked: 'milk' });
  });
});

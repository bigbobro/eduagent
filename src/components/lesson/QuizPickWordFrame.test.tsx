import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { QuizPickWordFrame } from './QuizPickWordFrame';

const quiz = foodCourse.phases.reinforcement.quizzes.find((item) => item.type === 'pick-word') as Extract<
  (typeof foodCourse.phases.reinforcement.quizzes)[number],
  { type: 'pick-word' }
>;

describe('QuizPickWordFrame', () => {
  it('marks a wrong pick with the wrong visual state', () => {
    const onAnswer = vi.fn();
    const { container } = render(<QuizPickWordFrame quiz={quiz} course={foodCourse} onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: /milk/i }));

    expect(onAnswer).toHaveBeenCalledWith({ correct: false, picked: 'milk' });
    expect(container.querySelector('[data-picture-card-state="wrong"]')).toBeTruthy();
    expect(screen.getByLabelText('wrong')).toBeTruthy();
  });

  it('marks a correct pick with the correct visual state', () => {
    const onAnswer = vi.fn();
    const { container } = render(<QuizPickWordFrame quiz={quiz} course={foodCourse} onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: /apple/i }));

    expect(onAnswer).toHaveBeenCalledWith({ correct: true, picked: 'apple' });
    expect(container.querySelector('[data-picture-card-state="correct"]')).toBeTruthy();
    expect(screen.getByText('+1')).toBeTruthy();
  });
});

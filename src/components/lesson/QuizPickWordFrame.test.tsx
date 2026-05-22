import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { QuizPickWordFrame, buildPickWordPromptText } from './QuizPickWordFrame';

const quiz = foodCourse.phases.reinforcement.quizzes.find((item) => item.type === 'pick-word') as Extract<
  (typeof foodCourse.phases.reinforcement.quizzes)[number],
  { type: 'pick-word' }
>;

function mockController(): any {
  return {
    on: vi.fn(),
    off: vi.fn(),
    getState: () => 'awaiting',
    speakStatic: vi.fn(async () => {}),
  };
}

describe('QuizPickWordFrame', () => {
  it('builds a static prompt from the quiz prompt and correct English word', () => {
    expect(buildPickWordPromptText(quiz, foodCourse)).toBe('Where is the apple? apple.');
  });

  it('speaks the prompt before accepting a wrong pick', async () => {
    const onAnswer = vi.fn();
    const controller = mockController();
    const { container } = render(<QuizPickWordFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={onAnswer} />);

    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalledWith('Where is the apple? apple.'));
    await waitFor(() => expect(screen.getByRole('button', { name: /milk/i })).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByRole('button', { name: /milk/i }));

    expect(onAnswer).toHaveBeenCalledWith({ correct: false, picked: 'milk' });
    expect(container.querySelector('[data-picture-card-state="wrong"]')).toBeTruthy();
    expect(screen.getByLabelText('wrong')).toBeTruthy();
  });

  it('marks a correct pick with the correct visual state', async () => {
    const onAnswer = vi.fn();
    const controller = mockController();
    const { container } = render(<QuizPickWordFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={onAnswer} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /apple/i })).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByRole('button', { name: /apple/i }));

    expect(onAnswer).toHaveBeenCalledWith({ correct: true, picked: 'apple' });
    expect(container.querySelector('[data-picture-card-state="correct"]')).toBeTruthy();
    expect(screen.getByText('+1')).toBeTruthy();
  });
});

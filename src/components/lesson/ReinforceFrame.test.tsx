import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import type { LessonStateName } from '@/lib/voice/lesson-controller';
import { ReinforceFrame } from './ReinforceFrame';

const quiz = foodCourse.phases.reinforcement.quizzes.find((item) => item.type === 'repeat-after-me') as Extract<
  (typeof foodCourse.phases.reinforcement.quizzes)[number],
  { type: 'repeat-after-me' }
>;

function mockController(state: LessonStateName): any {
  const handlers = new Map<string, (event: any) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (payload: any) => void) => handlers.set(event, handler)),
    off: vi.fn((event: string) => handlers.delete(event)),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    getState: () => state,
  };
}

describe('ReinforceFrame', () => {
  it('starts recording only when controller can hold', () => {
    const controller = mockController('awaiting');
    render(<ReinforceFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={() => {}} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: '按住 Space' }));
    expect(controller.startListening).toHaveBeenCalledWith({ routeToChat: false });
  });

  it('disables recording while controller is speaking', () => {
    const controller = mockController('speaking');
    render(<ReinforceFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={() => {}} />);

    const button = screen.getByRole('button', { name: '按住 Space' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.pointerDown(button);
    expect(controller.startListening).not.toHaveBeenCalled();
  });

  it('marks the sentence picture card correct after a matching ASR final', () => {
    const controller = mockController('awaiting');
    const onAnswer = vi.fn();
    const { container } = render(<ReinforceFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={onAnswer} />);

    expect(screen.getAllByText(quiz.targetText).length).toBeGreaterThan(0);
    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="listening"]')).toBeTruthy();
    act(() => {
      controller.handlers.get('asr-final')?.({ text: quiz.targetText });
    });

    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="correct"]')).toBeTruthy();
    expect(onAnswer).toHaveBeenCalledWith({ correct: true, said: quiz.targetText });
  });
});

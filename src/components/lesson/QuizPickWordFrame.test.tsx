import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import type { LessonStateName } from '@/lib/voice/lesson-controller';
import { QuizPickWordFrame, buildPickWordPromptText } from './QuizPickWordFrame';

const quiz = foodCourse.phases.reinforcement.quizzes.find((item) => item.type === 'pick-word') as Extract<
  (typeof foodCourse.phases.reinforcement.quizzes)[number],
  { type: 'pick-word' }
>;

function mockController(initialState: LessonStateName = 'awaiting'): any {
  let state = initialState;
  const handlers = new Map<string, Set<(payload: any) => void>>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (payload: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(handler);
    }),
    off: vi.fn((event: string, handler: (payload: any) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    getState: () => state,
    speakStatic: vi.fn(async () => {}),
    emitState(next: LessonStateName) {
      state = next;
      handlers.get('state')?.forEach((handler) => handler(next));
    },
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

  it('waits for awaiting state before speaking and unlocking cards', async () => {
    const onAnswer = vi.fn();
    const controller = mockController('speaking');
    render(<QuizPickWordFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={onAnswer} />);

    expect(controller.speakStatic).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /apple/i })).toHaveProperty('disabled', true);

    act(() => controller.emitState('awaiting'));

    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalledWith('Where is the apple? apple.'));
    await waitFor(() => expect(screen.getByRole('button', { name: /apple/i })).toHaveProperty('disabled', false));
  });

  it('unlocks after static speech even when the controller emits quiz-speaking during playback', async () => {
    let resolvePrompt!: () => void;
    const onAnswer = vi.fn();
    const controller = mockController();
    controller.speakStatic.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolvePrompt = resolve;
    }));
    render(<QuizPickWordFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={onAnswer} />);

    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalledTimes(1));
    act(() => controller.emitState('quiz-speaking'));
    expect(screen.getByRole('button', { name: /apple/i })).toHaveProperty('disabled', true);

    await act(async () => {
      controller.emitState('awaiting');
      resolvePrompt();
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /apple/i })).toHaveProperty('disabled', false));
  });

  it('does not start duplicate static prompts when React replays effects', async () => {
    const controller = mockController();
    render(
      <StrictMode>
        <QuizPickWordFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={() => {}} />
      </StrictMode>,
    );

    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalledTimes(1));
  });

  it('retries a transient static speech failure before unlocking cards', async () => {
    const onAnswer = vi.fn();
    const controller = mockController();
    controller.speakStatic.mockRejectedValueOnce(new Error('Static TTS already in progress'));
    controller.speakStatic.mockResolvedValueOnce(undefined);
    render(<QuizPickWordFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={onAnswer} />);

    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /apple/i })).toHaveProperty('disabled', true);
    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: /apple/i })).toHaveProperty('disabled', false));

    fireEvent.click(screen.getByRole('button', { name: /apple/i }));
    expect(onAnswer).toHaveBeenCalledWith({ correct: true, picked: 'apple' });
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { fruitsCourse } from '@/data/courses/fruits';
import type { LessonStateName } from '@/lib/voice/lesson-controller';
import {
  ReinforceFrame,
  buildRepeatAfterMePrompt,
  buildRepeatAfterMeScoring,
  isRepeatAfterMeCorrect,
} from './ReinforceFrame';

const quiz = foodCourse.phases.reinforcement.quizzes.find((item) => item.type === 'repeat-after-me') as Extract<
  (typeof foodCourse.phases.reinforcement.quizzes)[number],
  { type: 'repeat-after-me' }
>;

// ASR sentence candidates the frame passes to startListening: current quiz sentence first,
// the remaining repeat-after-me sentences of the group as secondary candidates.
const expectedAsrSentenceTexts = [
  quiz.targetText,
  ...foodCourse.phases.reinforcement.quizzes
    .filter((item): item is typeof quiz => item.type === 'repeat-after-me')
    .map((item) => item.targetText)
    .filter((text) => text !== quiz.targetText),
];
const expectedSpokenPrompt = buildRepeatAfterMePrompt(quiz.targetText);

function mockController(state: LessonStateName): any {
  const handlers = new Map<string, (event: any) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (payload: any) => void) => handlers.set(event, handler)),
    off: vi.fn((event: string) => handlers.delete(event)),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    speakStatic: vi.fn(async () => {}),
    getState: () => state,
  };
}

describe('ReinforceFrame', () => {
  it('starts recording only after the prompt has played', async () => {
    const controller = mockController('awaiting');
    render(<ReinforceFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={() => {}} />);

    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalledWith(expectedSpokenPrompt));
    await waitFor(() => expect(screen.getByRole('button', { name: '按住 Space' })).toHaveProperty('disabled', false));

    fireEvent.pointerDown(screen.getByRole('button', { name: '按住 Space' }));
    expect(controller.startListening).toHaveBeenCalledWith({
      routeToChat: false,
      asrSentenceTexts: expectedAsrSentenceTexts,
    });
  });

  it('keeps recording while a captured pointer leaves the button', async () => {
    const controller = mockController('awaiting');
    render(<ReinforceFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={() => {}} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '按住 Space' })).toHaveProperty('disabled', false));
    const button = screen.getByRole('button', { name: '按住 Space' });
    button.setPointerCapture = vi.fn();
    button.hasPointerCapture = vi.fn(() => true);
    button.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerLeave(button, { pointerId: 1 });

    expect(controller.startListening).toHaveBeenCalledWith({
      routeToChat: false,
      asrSentenceTexts: expectedAsrSentenceTexts,
    });
    expect(controller.stopListening).not.toHaveBeenCalled();

    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(controller.stopListening).toHaveBeenCalledTimes(1);
  });

  it('locks recording while the prompt is still playing', async () => {
    let resolvePrompt!: () => void;
    const controller = mockController('awaiting');
    controller.speakStatic.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolvePrompt = resolve;
    }));
    render(<ReinforceFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={() => {}} />);

    const button = screen.getByRole('button', { name: '按住 Space' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.pointerDown(button);
    expect(controller.startListening).not.toHaveBeenCalled();

    await act(async () => resolvePrompt());
    await waitFor(() => expect(button).toHaveProperty('disabled', false));
  });

  it('disables recording while controller is speaking', () => {
    const controller = mockController('speaking');
    render(<ReinforceFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={() => {}} />);

    const button = screen.getByRole('button', { name: '按住 Space' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.pointerDown(button);
    expect(controller.startListening).not.toHaveBeenCalled();
  });

  it('marks the sentence picture card correct after a matching ASR final', async () => {
    const controller = mockController('awaiting');
    const onAnswer = vi.fn();
    const { container } = render(<ReinforceFrame quiz={quiz} course={foodCourse} controller={controller} onAnswer={onAnswer} />);

    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalledWith(expectedSpokenPrompt));
    expect(screen.getAllByText(quiz.targetText).length).toBeGreaterThan(0);
    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="listening"]')).toBeTruthy();
    act(() => {
      controller.handlers.get('asr-final')?.({ text: quiz.targetText });
    });

    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="correct"]')).toBeTruthy();
    expect(onAnswer).toHaveBeenCalledWith({ correct: true, said: quiz.targetText });
  });
});

describe('repeat-after-me prompt and scoring helpers', () => {
  it('builds a full-sentence, slow-chunk, full-sentence prompt', () => {
    expect(buildRepeatAfterMePrompt('I see the grape.')).toBe(
      'I see the grape. 慢一点: I see. the grape. I see the grape.',
    );
  });

  it('does not mark a sentence correct when the target word is missing', () => {
    const grapeQuiz = fruitsCourse.phases.reinforcement.quizzes.find(
      (item): item is typeof quiz => item.type === 'repeat-after-me' && item.id === 'q7',
    )!;
    const scoring = buildRepeatAfterMeScoring(grapeQuiz, fruitsCourse);

    expect(isRepeatAfterMeCorrect(scoring, 'See the.')).toBe(false);
    expect(isRepeatAfterMeCorrect(scoring, 'I see the grape.')).toBe(true);
  });

  it('requires more than the target word alone for sentence repetition', () => {
    const bananaQuiz = fruitsCourse.phases.reinforcement.quizzes.find(
      (item): item is typeof quiz => item.type === 'repeat-after-me' && item.id === 'q8',
    )!;
    const scoring = buildRepeatAfterMeScoring(bananaQuiz, fruitsCourse);

    expect(isRepeatAfterMeCorrect(scoring, 'Baby is banana.')).toBe(false);
    expect(isRepeatAfterMeCorrect(scoring, 'Give me banana.')).toBe(true);
  });
});

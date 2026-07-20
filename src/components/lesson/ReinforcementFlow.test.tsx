import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { ReinforcementFlow, getRetryPrompt } from './ReinforcementFlow';

function mockController(): any {
  return {
    on: vi.fn(),
    off: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    speakStatic: vi.fn(async () => {}),
    getState: () => 'awaiting',
  };
}

describe('ReinforcementFlow', () => {
  it('uses the prompt or target text for retry hints', () => {
    expect(getRetryPrompt(foodCourse.phases.reinforcement.quizzes[0])).toBe('Where is the apple?');
    expect(getRetryPrompt(foodCourse.phases.reinforcement.quizzes[4])).toBe('This is an apple.');
  });

  it('starts at quiz 0', async () => {
    const controller = mockController();
    render(<ReinforcementFlow course={foodCourse} controller={controller} onAllDone={() => {}} sessionId="s1" />);
    expect(screen.getByText(/Where is the apple/)).toBeTruthy();
    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalled());
  });

  it('advances to next quiz on correct answer', async () => {
    const controller = mockController();
    render(<ReinforcementFlow course={foodCourse} controller={controller} onAllDone={() => {}} sessionId="s1" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /apple/i })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: /apple/i }));
    expect(await screen.findByText(/Find the milk/)).toBeTruthy();
  });

  it('speaks a retry hint after a wrong answer', async () => {
    const controller = mockController();
    render(<ReinforcementFlow course={foodCourse} controller={controller} onAllDone={() => {}} sessionId="s1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /milk/i })).toHaveProperty('disabled', false));
    controller.speakStatic.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /milk/i }));

    await waitFor(() => expect(controller.speakStatic).toHaveBeenCalledWith('再听一次: Where is the apple?'));
  });

  it('R1 (2026-07-20): resumes at the first quiz not in passedQuizIds', async () => {
    const controller = mockController();
    const firstQuizId = foodCourse.phases.reinforcement.quizzes[0].id;
    render(
      <ReinforcementFlow
        course={foodCourse}
        controller={controller}
        onAllDone={() => {}}
        sessionId="s1"
        passedQuizIds={[firstQuizId]}
      />,
    );
    expect(screen.getByText(/Find the milk/)).toBeTruthy();
    expect(screen.queryByText(/Where is the apple/)).toBeNull();
  });

  it('R1 (2026-07-20): falls back to quiz 0 when passedQuizIds is omitted', async () => {
    const controller = mockController();
    render(<ReinforcementFlow course={foodCourse} controller={controller} onAllDone={() => {}} sessionId="s1" />);
    expect(screen.getByText(/Where is the apple/)).toBeTruthy();
  });

  it('R1 (2026-07-20): shows the completion message when every quiz is already passed', async () => {
    const controller = mockController();
    const allQuizIds = foodCourse.phases.reinforcement.quizzes.map((q) => q.id);
    render(
      <ReinforcementFlow
        course={foodCourse}
        controller={controller}
        onAllDone={() => {}}
        sessionId="s1"
        passedQuizIds={allQuizIds}
      />,
    );
    expect(screen.getByText('今天的练习完成啦')).toBeTruthy();
  });

  it('calls onAllDone after last quiz', async () => {
    const onAllDone = vi.fn();
    const slim = {
      ...foodCourse,
      phases: {
        ...foodCourse.phases,
        reinforcement: { quizzes: [foodCourse.phases.reinforcement.quizzes[0]] },
      },
    };
    const controller = mockController();
    render(<ReinforcementFlow course={slim} controller={controller} onAllDone={onAllDone} sessionId="s1" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /apple/i })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: /apple/i }));
    await vi.waitFor(() => expect(onAllDone).toHaveBeenCalled());
  });
});

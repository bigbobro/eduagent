import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { ReinforcementFlow } from './ReinforcementFlow';

function mockController(): any {
  return {
    on: vi.fn(),
    off: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    getState: () => 'awaiting',
  };
}

describe('ReinforcementFlow', () => {
  it('starts at quiz 0', () => {
    render(<ReinforcementFlow course={foodCourse} controller={mockController()} onAllDone={() => {}} sessionId="s1" />);
    expect(screen.getByText(/Where is the apple/)).toBeTruthy();
  });

  it('advances to next quiz on correct answer', async () => {
    render(<ReinforcementFlow course={foodCourse} controller={mockController()} onAllDone={() => {}} sessionId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /apple/i }));
    expect(await screen.findByText(/Find the milk/)).toBeTruthy();
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
    render(<ReinforcementFlow course={slim} controller={mockController()} onAllDone={onAllDone} sessionId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /apple/i }));
    await vi.waitFor(() => expect(onAllDone).toHaveBeenCalled());
  });
});

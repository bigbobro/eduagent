import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { QuizRepeatAfterMe } from './QuizRepeatAfterMe';

function mockController(): any {
  const listeners = new Map<string, Set<Function>>();
  return {
    on(event: string, fn: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off(event: string, fn: Function) {
      listeners.get(event)?.delete(fn);
    },
    emit(event: string, data: any) {
      listeners.get(event)?.forEach((fn) => fn(data));
    },
    startListening: vi.fn(),
    stopListening: vi.fn(),
    getState: vi.fn(() => 'awaiting'),
  };
}

const quiz = {
  id: 'q4',
  type: 'repeat-after-me' as const,
  cardId: 'apple',
  targetText: 'This is an apple.',
};

describe('QuizRepeatAfterMe', () => {
  it('renders targetText and BloomButton', () => {
    render(<QuizRepeatAfterMe quiz={quiz} course={foodCourse} controller={mockController()} onAnswer={() => {}} />);
    expect(screen.getByText(/This is an apple/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /按住说话/ })).toBeTruthy();
  });

  it('judges correct when ASR final contains target word', () => {
    const onAnswer = vi.fn();
    const controller = mockController();
    render(<QuizRepeatAfterMe quiz={quiz} course={foodCourse} controller={controller} onAnswer={onAnswer} />);

    act(() => controller.emit('asr-final', { text: 'I see APPLE!' }));

    expect(onAnswer).toHaveBeenCalledWith({ correct: true, said: 'I see APPLE!' });
  });
});

import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import type { LessonStateName } from '@/lib/voice/lesson-controller';
import { LessonMandalaV2 } from './LessonMandalaV2';

function mockController(initialState: LessonStateName): any {
  const handlers = new Map<string, (payload: any) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (payload: any) => void) => handlers.set(event, handler)),
    off: vi.fn((event: string) => handlers.delete(event)),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    getState: () => initialState,
  };
}

describe('LessonMandalaV2', () => {
  it('maps the live listening state to the recording card state', () => {
    const controller = mockController('listening');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="recording"]')).toBeTruthy();
  });

  it('maps thinking to tryAgain before the current card is cleared', () => {
    const controller = mockController('awaiting');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    act(() => {
      controller.handlers.get('state')?.('thinking');
    });

    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="tryAgain"]')).toBeTruthy();
  });

  it('maps cleared progress for the current card to the correct state', () => {
    const controller = mockController('awaiting');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    act(() => {
      controller.handlers.get('progress')?.({ clearedCardIds: ['apple'], totalAttempts: 1 });
    });

    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="correct"]')).toBeTruthy();
  });
});

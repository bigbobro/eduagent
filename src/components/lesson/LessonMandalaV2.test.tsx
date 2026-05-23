import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    sendCustomAction: vi.fn(async () => {}),
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

  it('switches the hero card when the teacher shows a sentence card', () => {
    const controller = mockController('awaiting');
    render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    act(() => {
      controller.handlers.get('actions')?.([{ tool: 'show_card', params: { card_id: 'sentence_apple' } }]);
    });

    expect(screen.getByText('This is an apple.')).toBeTruthy();
  });

  it('ignores show_card actions for already cleared word cards', () => {
    const controller = mockController('awaiting');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    act(() => {
      controller.handlers.get('actions')?.([{ tool: 'show_card', params: { card_id: 'banana' } }]);
      controller.handlers.get('progress')?.({ clearedCardIds: ['apple'], totalAttempts: 1 });
      controller.handlers.get('actions')?.([{ tool: 'show_card', params: { card_id: 'apple' } }]);
    });

    const hero = container.querySelector('[data-picture-card-size="hero"]');
    expect(hero).toBeTruthy();
    expect(within(hero as HTMLElement).getByText('banana')).toBeTruthy();
  });

  it('asks the teacher to repeat the current visible card', () => {
    const controller = mockController('awaiting');
    render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: '请老师再说一遍' }));

    expect(controller.sendCustomAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'message',
      text: expect.stringContaining('当前卡片 apple'),
    }));
  });

  it('keeps pointer recording active while the captured pointer leaves the button', () => {
    const controller = mockController('awaiting');
    render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    const button = screen.getByRole('button', { name: /按住 Space 跟我读/ });
    button.setPointerCapture = vi.fn();
    button.hasPointerCapture = vi.fn(() => true);
    button.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerLeave(button, { pointerId: 1 });

    expect(controller.startListening).toHaveBeenCalledTimes(1);
    expect(controller.stopListening).not.toHaveBeenCalled();

    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(controller.stopListening).toHaveBeenCalledTimes(1);
  });
});

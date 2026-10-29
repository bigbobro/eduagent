import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
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
    repeatCard: vi.fn(async () => {}),
    getState: () => initialState,
  };
}

describe('LessonMandalaV2', () => {
  it.each(['idle', 'greeting', 'speaking', 'quiz-speaking', 'awaiting', 'listening', 'thinking', 'ending'] as const)('only allows teacher repeat and recording in awaiting: %s', state => {
    const controller = mockController(state);
    render(<LessonMandalaV2 course={foodCourse} controller={controller} />);
    const repeat = screen.getByRole('button', { name: '老师再讲一遍' }) as HTMLButtonElement;
    expect(repeat.disabled).toBe(state !== 'awaiting');
    fireEvent.click(repeat);
    expect(controller.repeatCard).toHaveBeenCalledTimes(state === 'awaiting' ? 1 : 0);
    const pill = screen.getByRole('button', { name: '按住空格说话' }) as HTMLButtonElement;
    expect(pill.disabled).toBe(state !== 'awaiting' && state !== 'listening');
  });
  it('holds Space through controller state updates and stops only on release', () => {
    const controller = mockController('awaiting');
    render(<LessonMandalaV2 course={foodCourse} controller={controller} />);
    fireEvent.keyDown(document, { code: 'Space' });
    act(() => controller.handlers.get('state')?.('listening'));
    fireEvent.keyDown(document, { code: 'Space', repeat: true });
    expect(controller.startListening).toHaveBeenCalledTimes(1);
    expect(controller.stopListening).not.toHaveBeenCalled();
    fireEvent.keyUp(document, { code: 'Space' });
    expect(controller.stopListening).toHaveBeenCalledTimes(1);
  });

  it('maps the live listening state to the recording card state', () => {
    const controller = mockController('listening');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="recording"]')).toBeTruthy();
  });

  it('keeps thinking on a neutral card state before the current card is cleared', () => {
    const controller = mockController('awaiting');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    act(() => {
      controller.handlers.get('state')?.('thinking');
    });

    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="listening"]')).toBeTruthy();
    expect(container.querySelector('[data-picture-card-size="hero"][data-picture-card-state="tryAgain"]')).toBeFalsy();
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

  it('allows the classroom to revisit a mastered word', async () => {
    const controller = mockController('awaiting');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    act(() => {
      controller.handlers.get('actions')?.([{ tool: 'show_card', params: { card_id: 'banana' } }]);
      controller.handlers.get('progress')?.({ clearedCardIds: ['apple'], totalAttempts: 1 });
      controller.handlers.get('actions')?.([{ tool: 'show_card', params: { card_id: 'apple' } }]);
    });

    const hero = container.querySelector('[data-picture-card-size="hero"]');
    expect(hero).toBeTruthy();
    await waitFor(() => expect(within(container.querySelector('[data-picture-card-size="hero"]:last-child') as HTMLElement).getByText('apple')).toBeTruthy());
  });

  it('R1 (2026-07-20): positions on initialCardId instead of the first word card', () => {
    const controller = mockController('awaiting');
    const { container } = render(<LessonMandalaV2 course={foodCourse} controller={controller} initialCardId="milk" />);

    const hero = container.querySelector('[data-picture-card-size="hero"]');
    expect(hero).toBeTruthy();
    expect(within(hero as HTMLElement).getByText('milk')).toBeTruthy();
  });

  it('R1 (2026-07-20): seeds cleared state from initialClearedCardIds', () => {
    const controller = mockController('awaiting');
    const { container } = render(
      <LessonMandalaV2 course={foodCourse} controller={controller} initialCardId="milk" initialClearedCardIds={['apple']} />,
    );

    act(() => controller.handlers.get('actions')?.([{ tool: 'show_card', params: { card_id: 'sentence_apple' } }]));
    expect(within(container.querySelector('[data-picture-card-size="hero"]') as HTMLElement).getByText('milk')).toBeTruthy();
  });

  it('asks the teacher to repeat the current visible card', () => {
    const controller = mockController('awaiting');
    render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: '老师再讲一遍' }));

    expect(controller.repeatCard).toHaveBeenCalledWith('apple');
  });

  it('keeps pointer recording active while the captured pointer leaves the button', () => {
    const controller = mockController('awaiting');
    render(<LessonMandalaV2 course={foodCourse} controller={controller} />);

    const button = screen.getByRole('button', { name: /按住空格说话/ });
    button.setPointerCapture = vi.fn();
    button.hasPointerCapture = vi.fn(() => true);
    button.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(button, { pointerId: 1, button: 0 });
    fireEvent.pointerLeave(button, { pointerId: 1 });

    expect(controller.startListening).toHaveBeenCalledTimes(1);
    expect(controller.stopListening).not.toHaveBeenCalled();

    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(controller.stopListening).toHaveBeenCalledTimes(1);
  });
});

describe('LessonMandalaV2 in Realtime conversation mode', () => {
  const conversation = (state: LessonStateName) => ({ ...mockController(state), interaction: 'conversation', presented: vi.fn(), setPaused: vi.fn(async () => {}) });
  it('has no push-to-talk control and keeps listening while the teacher speaks', () => {
    const controller = conversation('speaking');
    render(<LessonMandalaV2 course={foodCourse} controller={controller} />);
    expect(screen.queryByRole('button', { name: '按住空格说话' })).toBeNull();
    expect(screen.getByRole('status', { name: '对话状态' }).textContent).toContain('想插话可以直接说');
    fireEvent.keyDown(document, { code: 'Space' });
    expect(controller.startListening).not.toHaveBeenCalled();
  });
  it('reports each rendered card after commit so speech binds to what the child saw', () => {
    const controller = conversation('awaiting');
    render(<LessonMandalaV2 course={foodCourse} controller={controller} initialCardId="apple" />);
    expect(controller.presented).toHaveBeenLastCalledWith({ kind: 'card', id: 'apple' });
    act(() => controller.handlers.get('actions')?.([{ tool: 'show_card', params: { card_id: 'milk' } }]));
    expect(screen.getByText('牛奶')).toBeTruthy();
    expect(controller.presented).toHaveBeenLastCalledWith({ kind: 'card', id: 'milk' });
  });
  it('pauses and resumes the microphone from the dock', () => {
    const controller = conversation('awaiting');
    render(<LessonMandalaV2 course={foodCourse} controller={controller} />);
    fireEvent.click(screen.getByRole('button', { name: '暂停麦克风' }));
    expect(controller.setPaused).toHaveBeenCalledWith(true);
    act(() => controller.handlers.get('state')?.('paused'));
    fireEvent.click(screen.getByRole('button', { name: '继续说话' }));
    expect(controller.setPaused).toHaveBeenLastCalledWith(false);
  });
});

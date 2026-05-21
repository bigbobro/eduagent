import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { PhasedLessonView } from './PhasedLessonView';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/voice/lesson-controller', () => {
  class LessonController {
    private state = 'idle';
    private listeners = new Map<string, Set<Function>>();

    on(event: string, fn: Function) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(fn);
    }

    off(event: string, fn: Function) {
      this.listeners.get(event)?.delete(fn);
    }

    getState() {
      return this.state;
    }

    getSessionId() {
      return 'mock-session';
    }

    async startLesson() {
      this.state = 'greeting';
      this.emit('state', 'greeting');
      this.state = 'awaiting';
      this.emit('state', 'awaiting');
    }

    async sendCustomAction() {}
    async endLesson() {}
    async startListening() {}
    async stopListening() {}

    private emit(event: string, data: unknown) {
      this.listeners.get(event)?.forEach((fn) => fn(data));
    }
  }

  return { LessonController };
});

describe('PhasedLessonView', () => {
  it('initial render shows IntroFrame and start button', () => {
    render(<PhasedLessonView course={foodCourse} />);
    expect(screen.getByText(/餐桌上摆着各种食物/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /我们开始吧/ })).toBeTruthy();
  });

  it('moves from intro to interactive after the opening greeting finishes', async () => {
    render(<PhasedLessonView course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /按住 Space 跟我读/ })).toBeTruthy();
    });
  });
});

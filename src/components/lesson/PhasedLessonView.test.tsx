import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { PhasedLessonView } from './PhasedLessonView';

const routerPush = vi.hoisted(() => vi.fn());
const phasedInstances = vi.hoisted(() => [] as any[]);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
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

vi.mock('@/lib/voice/phased-lesson-controller', () => {
  class PhasedLessonController {
    private listeners = new Map<string, Set<Function>>();

    constructor(private v2: any) {
      phasedInstances.push(this);
    }

    on(event: string, fn: Function) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(fn);
    }

    off(event: string, fn: Function) {
      this.listeners.get(event)?.delete(fn);
    }

    async startLesson() {
      await this.v2.startLesson();
      this.emit('phase-change', 'interactive');
    }

    async endLesson() {}
    async requestIntroCard() { return true; }

    async completeReinforcement() {
      this.emit('phase-change', 'done');
    }

    private emit(event: string, data: unknown) {
      this.listeners.get(event)?.forEach((fn) => fn(data));
    }
  }

  return { PhasedLessonController };
});

describe('PhasedLessonView', () => {
  beforeEach(() => {
    phasedInstances.length = 0;
    routerPush.mockClear();
  });

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

  it('restarts the current course from the in-lesson done frame', async () => {
    render(<PhasedLessonView course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => expect(phasedInstances[0]).toBeTruthy());
    await act(async () => {
      await phasedInstances[0].completeReinforcement();
    });

    fireEvent.click(await screen.findByRole('button', { name: '再来一节' }));
    expect(routerPush).toHaveBeenCalledWith('/lesson/food');
  });
});

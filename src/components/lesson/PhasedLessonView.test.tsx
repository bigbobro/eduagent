import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { PhasedLessonView } from './PhasedLessonView';

const routerPush = vi.hoisted(() => vi.fn());
const lessonInstances = vi.hoisted(() => [] as any[]);
const phasedInstances = vi.hoisted(() => [] as any[]);
const phasedStartQueue = vi.hoisted(() => [] as Array<() => Promise<boolean | void>>);
// R1 (2026-07-20 session persistence): when set, the next mocked PhasedLessonController's
// startLesson() applies this resume phase/info instead of the default fresh intro→interactive
// path — mirrors what the real PhasedLessonController does after LessonController.getResumeInfo().
const phasedResumeQueue = vi.hoisted(() => [] as Array<{
  phase: string;
  resumeCardId: string;
  clearedCardIds: string[];
  passedQuizIds: string[];
}>);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/lib/voice/lesson-controller', () => {
  class LessonController {
    private state = 'idle';
    private listeners = new Map<string, Set<Function>>();

    constructor() {
      lessonInstances.push(this);
    }

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
    async speakStatic() {}
    async endLesson() {}
    async startListening() {}
    async stopListening() {}

    emitProgress(clearedCardIds: string[]) {
      this.emit('progress', {
        clearedCardIds,
        totalAttempts: clearedCardIds.length,
        currentPhase: 'interactive',
      });
    }

    private emit(event: string, data: unknown) {
      this.listeners.get(event)?.forEach((fn) => fn(data));
    }
  }

  return { LessonController };
});

vi.mock('@/lib/voice/phased-lesson-controller', () => {
  class PhasedLessonController {
    private listeners = new Map<string, Set<Function>>();
    private resumeInfo: {
      resumed: true;
      phase: string;
      resumeCardId: string;
      clearedCardIds: string[];
      passedQuizIds: string[];
    } | null = null;

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
      const queued = phasedStartQueue.shift();
      if (queued) return queued();
      await this.v2.startLesson();
      const resume = phasedResumeQueue.shift();
      if (resume) {
        this.resumeInfo = { resumed: true, ...resume };
        this.emit('phase-change', resume.phase);
        return true;
      }
      this.emit('phase-change', 'interactive');
      return true;
    }

    getResumeInfo() {
      return this.resumeInfo;
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
    lessonInstances.length = 0;
    phasedInstances.length = 0;
    phasedStartQueue.length = 0;
    phasedResumeQueue.length = 0;
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

  it('returns to the start screen when lesson startup fails', async () => {
    phasedStartQueue.push(async () => false);
    render(<PhasedLessonView course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /我们开始吧/ })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /按住 Space 跟我读/ })).toBeNull();
  });

  it('restarts the current course from the in-lesson done frame', async () => {
    render(<PhasedLessonView course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => expect(phasedInstances[0]).toBeTruthy());
    await act(async () => {
      await phasedInstances[0].completeReinforcement();
    });

    fireEvent.click(await screen.findByRole('button', { name: '再来一节' }));
    expect(screen.getByRole('button', { name: /我们开始吧/ })).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalledWith('/lesson/food');
    await waitFor(() => expect(lessonInstances.length).toBe(2));
  });

  it('uses cleared progress instead of total course words on the done frame', async () => {
    render(<PhasedLessonView course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => expect(phasedInstances[0]).toBeTruthy());
    act(() => {
      lessonInstances[0].emitProgress(['apple', 'milk']);
    });
    await act(async () => {
      await phasedInstances[0].completeReinforcement();
    });

    expect(await screen.findByText('2 个词')).toBeTruthy();
  });

  it('R1 (2026-07-20): resumed interactive session skips IntroFrame and positions on the breakpoint card', async () => {
    phasedResumeQueue.push({
      phase: 'interactive',
      resumeCardId: 'milk',
      clearedCardIds: ['apple'],
      passedQuizIds: [],
    });
    const { container } = render(<PhasedLessonView course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /按住 Space 跟我读/ })).toBeTruthy();
    });
    expect(screen.queryByText(/餐桌上摆着各种食物/)).toBeNull();
    const hero = container.querySelector('[data-picture-card-size="hero"]');
    expect(hero).toBeTruthy();
    expect(within(hero as HTMLElement).getByText('milk')).toBeTruthy();
  });

  it('R1 (2026-07-20): resumed reinforcement session renders quizzes directly, skipping passed ones', async () => {
    const passedQuizId = foodCourse.phases.reinforcement.quizzes[0].id;
    phasedResumeQueue.push({
      phase: 'reinforcement',
      resumeCardId: '',
      clearedCardIds: foodCourse.cards.filter((c) => c.kind === 'word').map((c) => c.id),
      passedQuizIds: [passedQuizId],
    });
    render(<PhasedLessonView course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    expect(await screen.findByText(/Find the milk/)).toBeTruthy();
    expect(screen.queryByText(/Where is the apple/)).toBeNull();
  });
});

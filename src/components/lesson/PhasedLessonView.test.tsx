import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseProgress } from '@/types/progress';
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
    async retryTransition() { this.emit('transition-retry-change', false); }
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
    const course: CourseProgress = { courseId:'food',courseTitle:'食物 Food',courseTone:'peach',totalWords:12,masteredWords:0,timesStarted:1,progressPercent:100,completed:true,hasResume:false,words:foodCourse.cards.filter(c=>c.kind==='word').map((c,i)=>({word:c.english,zh:c.chinese,imageUrl:c.imageUrl,attempts:1,correct:1,masteryStars:i===0?2:0,lastPracticed:null})) };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/api/learners') ? [{id:'test-learner',name:'宝宝'}] : url.includes('/api/progress') ? {courses:[course]} : url.includes('/api/sessions') ? [] : {totalSessions:1,totalMinutes:1,last7Days:[]}))));
    lessonInstances.length = 0;
    phasedInstances.length = 0;
    phasedStartQueue.length = 0;
    phasedResumeQueue.length = 0;
    routerPush.mockClear();
  });

  it('initial render shows IntroFrame and start button', () => {
    render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);
    expect(screen.getByText(/餐桌上摆着各种食物/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /我们开始吧/ })).toBeTruthy();
  });

  it('moves from intro to interactive after the opening greeting finishes', async () => {
    render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /按住空格说话/ })).toBeTruthy();
    });
  });

  it('offers a working retry control when the phase controller reports a failed transition', async () => {
    render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);
    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));
    await screen.findByRole('button', { name: /按住空格说话/ });
    act(() => phasedInstances[0].emit('transition-retry-change', true));
    expect(screen.queryByRole('button', { name: /按住空格说话/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '再试一次' }));
    expect(await screen.findByRole('button', { name: /按住空格说话/ })).toBeTruthy();
  });

  it('returns to the start screen when lesson startup fails', async () => {
    phasedStartQueue.push(async () => false);
    render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /我们开始吧/ })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /按住空格说话/ })).toBeNull();
  });

  it('restarts the current course from the in-lesson done frame', async () => {
    render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => expect(phasedInstances[0]).toBeTruthy());
    await act(async () => {
      await phasedInstances[0].completeReinforcement();
    });

    fireEvent.click(await screen.findByRole('button', { name: '再上一遍' }));
    expect(screen.getByRole('button', { name: /我们开始吧/ })).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalledWith('/lesson/food');
    await waitFor(() => expect(lessonInstances.length).toBe(2));
  });

  it('uses durable mastery instead of session cleared count on the done frame', async () => {
    render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => expect(phasedInstances[0]).toBeTruthy());
    act(() => {
      lessonInstances[0].emitProgress(['apple', 'milk']);
    });
    await act(async () => {
      await phasedInstances[0].completeReinforcement();
    });

    expect(await screen.findByRole('heading', { name: '食物课,过关 1 个词' })).toBeTruthy();
  });

  it('R1 (2026-07-20): resumed interactive session skips IntroFrame and positions on the breakpoint card', async () => {
    phasedResumeQueue.push({
      phase: 'interactive',
      resumeCardId: 'milk',
      clearedCardIds: ['apple'],
      passedQuizIds: [],
    });
    const { container } = render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /按住空格说话/ })).toBeTruthy();
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
    render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);

    fireEvent.click(screen.getByRole('button', { name: /我们开始吧/ }));

    expect(await screen.findByText(/Find the milk/)).toBeTruthy();
    expect(screen.queryByText(/Where is the apple/)).toBeNull();
  });
  it.each(['LLM_INSUFFICIENT_BALANCE', 'LLM_AUTH_FAILED', 'LLM_MODEL_UNAVAILABLE'])('renders a specific reason and settings link for %s', (code) => {
    render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);
    act(() => lessonInstances[0].emit('error', { code, message: '余额不足:请到模型服务商控制台充值后再试' }));
    const notice = screen.getByRole('alert');
    expect(notice.textContent).toContain('余额不足');
    expect(within(notice).getByRole('link', { name: '去设置' }).getAttribute('href')).toBe('/settings');
  });

  it('keeps generic failures free of a configuration action', () => {
    render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);
    act(() => lessonInstances[0].emit('error', { message: '课堂暂时没准备好,再试一次吧' }));
    expect(screen.getByRole('alert').textContent).toContain('课堂暂时没准备好');
    expect(screen.queryByRole('link', { name: '去设置' })).toBeNull();
  });

  it('keeps configuration errors actionable after four seconds and clears them after a successful turn', () => {
    vi.useFakeTimers();
    try {
      render(<PhasedLessonView learnerId="test-learner" course={foodCourse} />);
      act(() => lessonInstances[0].emit('error', { code: 'LLM_INSUFFICIENT_BALANCE', message: '余额不足:请到模型服务商控制台充值后再试' }));
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole('link', { name: '去设置' })).toBeTruthy();
      act(() => lessonInstances[0].emitProgress(['apple']));
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

});

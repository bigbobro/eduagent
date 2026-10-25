import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import HomePage from './page';
import { foodCourse } from '@/data/courses/food';
import type { ProgressSnapshot } from '@/types/progress';
const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const mic = vi.hoisted(() => ({
  status: vi.fn(async (): Promise<'granted' | 'denied' | 'not-determined'> => 'granted'),
}));
const router = { push, replace };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/audio/microphone', () => ({ getMicStatus: mic.status }));
const profiles = [{ id: 'a', name: '赞赞', avatar: null, createdAt: '' }, { id: 'b', name: '安安', avatar: null, createdAt: '' }];
const snapshot: ProgressSnapshot = { courses: [], generatedAt: '', totalWordsMastered: 0 };
beforeEach(() => {
  const values = new Map<string, string>([['eduagent.currentLearnerId', 'a']]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  push.mockClear(); replace.mockClear();
  mic.status.mockReset();
  mic.status.mockResolvedValue('granted');
});
afterEach(() => vi.unstubAllGlobals());
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }); }
it('shows progress read failures and retries before allowing a start', async () => {
  let failed = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/settings') return response({ configured: true });
    if (url === '/api/courses') return response([foodCourse]);
    if (url === '/api/learners') return response(profiles);
    return failed ? response({}, 503) : response(snapshot);
  }));
  render(<HomePage />);
  await screen.findByText('暂时读不到课程');
  expect(screen.queryByRole('button', { name: '开始上课' })).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  fireEvent.click(await screen.findByRole('button', { name: '开始上课' }));
  expect(push).toHaveBeenCalledWith('/lesson/food?learnerId=a');
});
it('ignores a slow previous child progress response after switching', async () => {
  let finishA: (value: Response) => void = () => {};
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/settings') return response({ configured: true });
    if (url === '/api/courses') return response([foodCourse]);
    if (url === '/api/learners') return response(profiles);
    if (url.includes('learnerId=a')) return new Promise<Response>(resolve => { finishA = resolve; });
    return response(snapshot);
  }));
  render(<HomePage />);
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/progress?learnerId=a'));
  act(() => { localStorage.setItem('eduagent.currentLearnerId', 'b'); window.dispatchEvent(new Event('eduagent:learner-change')); });
  await screen.findByRole('button', { name: '开始上课' });
  await act(async () => { finishA(response({}, 500)); });
  expect(screen.queryByText('暂时读不到课程')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '开始上课' }));
  expect(push).toHaveBeenCalledWith('/lesson/food?learnerId=b');
});
it('opens onboarding at the first missing step', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/settings') return response({ configured: false });
    if (url === '/api/learners') return response([]);
    return response([]);
  }));
  render(<HomePage />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding?step=1'));
});
it('opens the microphone step when the key is ready and access is undecided', async () => {
  mic.status.mockResolvedValue('not-determined');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/settings') return response({ configured: true });
    if (url === '/api/learners') return response(profiles);
    return response(snapshot);
  }));
  render(<HomePage />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding?step=2'));
});
it('opens a fresh review lesson with fresh=1 for a course that has a breakpoint', async () => {
  const resumable = { courseId: 'food', courseTitle: foodCourse.title, courseTone: 'peach', totalWords: 12, masteredWords: 0, timesStarted: 1, progressPercent: 25, hasResume: true, completed: false, words: [] };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/settings') return response({ configured: true });
    if (url === '/api/courses') return response([foodCourse]);
    if (url === '/api/learners') return response(profiles);
    return response({ ...snapshot, courses: [resumable] });
  }));
  render(<HomePage />);
  fireEvent.click(await screen.findByRole('button', { name: '从头复习' }));
  expect(push).toHaveBeenCalledWith('/lesson/food?learnerId=a&fresh=1');
});

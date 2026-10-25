import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LessonClient } from './LessonClient';
import type { Course } from '@/types/course';
const status = vi.hoisted(() => vi.fn());
const mount = vi.hoisted(() => vi.fn());
const profiles = vi.hoisted(() => ({ load: vi.fn(), router: { replace: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => profiles.router, usePathname: () => '/lesson/food', useSearchParams: () => new URLSearchParams('learnerId=a&fresh=1') }));
vi.mock('@/lib/current-learner', () => ({ loadLearners: profiles.load, selectedLearner: (items: unknown[]) => items[0], saveCurrentLearnerId: vi.fn() }));
vi.mock('@/lib/audio/microphone', () => ({ getMicStatus: status }));
vi.mock('@/components/lesson/PhasedLessonView', () => ({ PhasedLessonView: (props: { learnerId: string; onStarted?: () => void }) => { mount(props.learnerId); return <div>课堂已就绪<button onClick={props.onStarted}>started</button></div>; } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it.each(['denied', 'not-determined'])('blocks %s before mounting a classroom controller', async (state) => {
  status.mockResolvedValue(state);
  render(<LessonClient course={{} as Course} />);
  expect((await screen.findByRole('link', { name: '去设置' })).getAttribute('href')).toBe('/settings');
  expect(mount).not.toHaveBeenCalled();
  expect(profiles.load).not.toHaveBeenCalled();
});
it('mounts the classroom after microphone access is allowed', async () => {
  status.mockResolvedValue('granted');
  profiles.load.mockResolvedValue([{ id: 'child-integration' }]);
  render(<LessonClient course={{} as Course} />);
  await screen.findByText('课堂已就绪');
  expect(mount).toHaveBeenCalledWith('child-integration');
});
it('drops only the fresh flag from the URL after the lesson started', async () => {
  status.mockResolvedValue('granted');
  profiles.load.mockResolvedValue([{ id: 'a' }]);
  render(<LessonClient course={{} as Course} requestedLearnerId="a" />);
  (await screen.findByText('started')).click();
  expect(profiles.router.replace).toHaveBeenCalledWith('/lesson/food?learnerId=a');
});

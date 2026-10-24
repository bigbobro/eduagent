import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LessonClient } from './LessonClient';
import type { Course } from '@/types/course';
const status = vi.hoisted(() => vi.fn());
const mount = vi.hoisted(() => vi.fn());
vi.mock('@/lib/audio/microphone', () => ({ getMicStatus: status }));
vi.mock('@/components/lesson/PhasedLessonView', () => ({ PhasedLessonView: () => { mount(); return <div>课堂已就绪</div>; } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it.each(['denied', 'not-determined'])('blocks %s before mounting a classroom controller', async (state) => {
  status.mockResolvedValue(state);
  render(<LessonClient course={{} as Course} />);
  expect((await screen.findByRole('link', { name: '去设置' })).getAttribute('href')).toBe('/settings');
  expect(mount).not.toHaveBeenCalled();
});
it('mounts the classroom after microphone access is allowed', async () => {
  status.mockResolvedValue('granted');
  render(<LessonClient course={{} as Course} />);
  await screen.findByText('课堂已就绪');
  expect(mount).toHaveBeenCalled();
});

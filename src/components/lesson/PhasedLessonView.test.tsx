import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { PhasedLessonView } from './PhasedLessonView';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('PhasedLessonView', () => {
  it('initial render shows IntroFrame and start button', () => {
    render(<PhasedLessonView course={foodCourse} />);
    expect(screen.getByText(/餐桌上摆着各种食物/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /我们开始吧/ })).toBeTruthy();
  });
});

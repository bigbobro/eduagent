import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DoneCelebrateFrame } from './DoneCelebrateFrame';

describe('DoneCelebrateFrame', () => {
  it('renders earned stars, lesson data, and both CTAs', () => {
    const onHome = vi.fn();
    const onAgain = vi.fn();
    const { container } = render(
      <DoneCelebrateFrame
        starsEarned={5}
        totalStars={5}
        wordsLearned={6}
        duration="15 分钟"
        accuracy={92}
        onHome={onHome}
        onAgain={onAgain}
      />,
    );

    expect(screen.getByText('今天太棒啦!')).toBeTruthy();
    expect(screen.getByText('6 个词')).toBeTruthy();
    expect(screen.getByText('15 分钟')).toBeTruthy();
    expect(screen.getByText('准确率 92%')).toBeTruthy();
    expect(container.querySelectorAll('polygon[fill="#F4DFA5"]').length).toBe(5);

    fireEvent.click(screen.getByRole('button', { name: '回大厅' }));
    fireEvent.click(screen.getByRole('button', { name: '再来一节' }));
    expect(onHome).toHaveBeenCalledOnce();
    expect(onAgain).toHaveBeenCalledOnce();
  });
});

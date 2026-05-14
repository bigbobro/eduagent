import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { IntroPhase } from './IntroPhase';

describe('IntroPhase', () => {
  it('renders the scene image', () => {
    render(<IntroPhase course={foodCourse} onHotspotClick={() => {}} />);
    expect(screen.getByRole('img', { name: /餐桌/ })).toBeTruthy();
  });

  it('calls onHotspotClick when a card hotspot is clicked', () => {
    const onClick = vi.fn();
    render(<IntroPhase course={foodCourse} onHotspotClick={onClick} />);
    fireEvent.click(screen.getByLabelText('点 苹果'));
    expect(onClick).toHaveBeenCalledWith('apple');
  });

  it('shows disabled BloomButton placeholder', () => {
    render(<IntroPhase course={foodCourse} onHotspotClick={() => {}} />);
    expect(screen.getByTestId('bloom-placeholder')).toBeTruthy();
  });
});

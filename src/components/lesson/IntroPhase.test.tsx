import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { IntroPhase } from './IntroPhase';

describe('IntroPhase', () => {
  it('renders the scene image', () => {
    render(<IntroPhase course={foodCourse} onHotspotClick={() => {}} />);
    expect(screen.getByRole('img', { name: /餐桌/ })).toBeTruthy();
    expect(screen.getByTestId('intro-card-image-apple')).toBeTruthy();
    expect(screen.getByTestId('intro-card-image-milk')).toBeTruthy();
  });

  it('calls onHotspotClick when a card hotspot is clicked', () => {
    const onClick = vi.fn();
    render(<IntroPhase course={foodCourse} onHotspotClick={onClick} />);
    fireEvent.click(screen.getByLabelText('点 苹果 apple'));
    expect(onClick).toHaveBeenCalledWith('apple');
  });

  it('shows the Chinese and English label on hover', () => {
    render(<IntroPhase course={foodCourse} onHotspotClick={() => {}} />);
    fireEvent.mouseEnter(screen.getByLabelText('点 香蕉 banana'));
    expect(screen.getByTestId('intro-card-label')).toBeTruthy();
    expect(screen.getByText('香蕉')).toBeTruthy();
    expect(screen.getByText('banana')).toBeTruthy();
  });

  it('shows the Chinese and English label for the active card', () => {
    render(<IntroPhase course={foodCourse} activeCardId="egg" onHotspotClick={() => {}} />);
    expect(screen.getByTestId('intro-card-label')).toBeTruthy();
    expect(screen.getByText('鸡蛋')).toBeTruthy();
    expect(screen.getByText('egg')).toBeTruthy();
  });

  it('does not call onHotspotClick while locked', () => {
    const onClick = vi.fn();
    render(<IntroPhase course={foodCourse} locked onHotspotClick={onClick} />);
    fireEvent.click(screen.getByLabelText('点 苹果 apple'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows disabled BloomButton placeholder', () => {
    render(<IntroPhase course={foodCourse} onHotspotClick={() => {}} />);
    expect(screen.getByTestId('bloom-placeholder')).toBeTruthy();
  });
});

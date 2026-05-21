import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Cat, IllustrationSlot, PaperBg, PaperButton, Sparkle, Star } from './index';

describe('magic atoms', () => {
  it('renders storybook Cat with supported moods', () => {
    render(<Cat mood="cheer" size={120} />);
    const cat = screen.getByRole('img', { name: 'Mochi 麻吉' });
    expect(cat.getAttribute('data-cat-variant')).toBe('storybook');
    expect(cat.getAttribute('data-cat-mood')).toBe('cheer');
  });

  it('renders PaperBg with grain and vignette layers', () => {
    const { container } = render(<PaperBg>content</PaperBg>);
    expect(screen.getByText('content')).toBeTruthy();
    expect(container.querySelector('.paper-grain')).toBeTruthy();
    expect(container.querySelector('.paper-vignette')).toBeTruthy();
  });

  it('renders filled and unfilled stars', () => {
    const { container, rerender } = render(<Star filled />);
    expect(container.querySelector('polygon')?.getAttribute('fill')).toBe('#F4DFA5');
    rerender(<Star filled={false} />);
    expect(container.querySelector('polygon')?.getAttribute('fill')).toBe('none');
  });

  it('renders Sparkle with reduced-motion target class', () => {
    const { container } = render(<Sparkle />);
    expect(container.querySelector('.magic-sparkle')).toBeTruthy();
  });

  it('renders PaperButton as an accessible button and handles clicks', () => {
    const onClick = vi.fn();
    render(<PaperButton onClick={onClick}>开始</PaperButton>);
    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders IllustrationSlot fallback and image modes', () => {
    const { rerender } = render(<IllustrationSlot width={180} height={180} label="apple art" emoji="🍎" />);
    expect(screen.getByLabelText('apple art').textContent).toContain('apple art · 180x180');

    rerender(<IllustrationSlot label="apple image" imageUrl="/images/food/apple.png" />);
    const style = screen.getByRole('img', { name: 'apple image' }).getAttribute('style') ?? '';
    expect(style).toContain('/images/food/apple.png');
    expect(style).toContain('cover');
  });
});

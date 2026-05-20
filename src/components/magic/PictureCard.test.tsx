import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PictureCard, type CardState, type PictureCardData } from './PictureCard';

const card: PictureCardData = {
  kind: 'word',
  en: 'apple',
  zh: '苹果',
  ipa: '/ˈæp.əl/',
  emoji: '🍎',
  tone: 'peach',
};

describe('PictureCard', () => {
  it('renders hero layout with repeat button, IPA, and zh text', () => {
    const { container } = render(<PictureCard card={card} state="listening" />);
    expect(container.querySelector('[data-picture-card-size="hero"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: '请老师再说一遍' })).toBeTruthy();
    expect(screen.getByText('/ˈæp.əl/')).toBeTruthy();
    expect(screen.getByText('苹果')).toBeTruthy();
  });

  it('renders tile layout and calls onClick', () => {
    const onClick = vi.fn();
    const { container } = render(<PictureCard card={card} size="tile" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(container.querySelector('[data-picture-card-size="tile"]')).toBeTruthy();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders chip locked preview', () => {
    const { container } = render(<PictureCard card={card} size="chip" dimmed badgeKind="locked" />);
    expect(container.querySelector('[data-picture-card-size="chip"]')).toBeTruthy();
    expect(screen.getByLabelText('locked')).toBeTruthy();
  });

  it('supports all card states as data-state contract', () => {
    const states: CardState[] = ['listening', 'recording', 'correct', 'tryAgain', 'wrong', 'selected', 'idle'];
    for (const state of states) {
      const { container, unmount } = render(<PictureCard card={card} state={state} />);
      expect(container.querySelector(`[data-picture-card-state="${state}"]`)).toBeTruthy();
      unmount();
    }
  });

  it('renders state-specific ornaments', () => {
    const { rerender } = render(<PictureCard card={card} state="recording" />);
    expect(screen.getByText('REC · 录音中')).toBeTruthy();

    rerender(<PictureCard card={card} state="correct" />);
    expect(screen.getByLabelText('+1 star')).toBeTruthy();

    rerender(<PictureCard card={card} state="tryAgain" />);
    expect(screen.getByText('← 再听一遍')).toBeTruthy();

    rerender(<PictureCard card={card} size="tile" state="wrong" />);
    expect(screen.getByLabelText('wrong')).toBeTruthy();
  });

  it('uses sentence typography without IPA', () => {
    render(<PictureCard card={{ ...card, kind: 'sentence', en: 'I like apples.', zh: '我喜欢苹果。' }} />);
    expect(screen.queryByText('/ˈæp.əl/')).toBeNull();
    expect(screen.getByText('I like apples.')).toBeTruthy();
  });
});


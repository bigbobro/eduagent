import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordBook } from './WordBook';
import type { WordCard } from '@/types/course';

const cards: WordCard[] = [
  {
    id: 'apple',
    english: 'apple',
    chinese: '苹果',
    imageUrl: '/images/food/apple.png',
    kind: 'word',
    drillParts: ['app', 'le'],
  },
  {
    id: 'milk',
    english: 'milk',
    chinese: '牛奶',
    imageUrl: '/images/food/milk.png',
    kind: 'word',
    drillParts: ['milk'],
  },
];

describe('WordBook', () => {
  it('renders placeholder when cardId not in deck', () => {
    render(<WordBook cards={cards} currentCardId="missing" />);
    expect(screen.getByLabelText('no card')).toBeTruthy();
  });
  it('renders english + chinese when matched', () => {
    render(<WordBook cards={cards} currentCardId="apple" />);
    expect(screen.getByText('apple')).toBeTruthy();
    expect(screen.getByText('苹果')).toBeTruthy();
  });
  it('exposes aria-label containing both languages', () => {
    render(<WordBook cards={cards} currentCardId="apple" />);
    expect(screen.getByLabelText(/apple.*苹果/)).toBeTruthy();
  });
});

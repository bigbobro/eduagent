import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordBook } from './WordBook';
import type { WordCard } from '@/types/course';

const cards: WordCard[] = [
  {
    id: 'car',
    english: 'car',
    chinese: '小汽车',
    imageUrl: '/images/transportation/car.svg',
    kind: 'word',
    drillParts: ['car'],
  },
  {
    id: 'bus',
    english: 'bus',
    chinese: '公交车',
    imageUrl: '/images/transportation/bus.svg',
    kind: 'word',
    drillParts: ['bus'],
  },
];

describe('WordBook', () => {
  it('renders placeholder when cardId not in deck', () => {
    render(<WordBook cards={cards} currentCardId="missing" />);
    expect(screen.getByLabelText('no card')).toBeTruthy();
  });
  it('renders english + chinese when matched', () => {
    render(<WordBook cards={cards} currentCardId="car" />);
    expect(screen.getByText('car')).toBeTruthy();
    expect(screen.getByText('小汽车')).toBeTruthy();
  });
  it('exposes aria-label containing both languages', () => {
    render(<WordBook cards={cards} currentCardId="car" />);
    expect(screen.getByLabelText(/car.*小汽车/)).toBeTruthy();
  });
});

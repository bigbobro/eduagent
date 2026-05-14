import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StickerWord } from './StickerWord';

describe('StickerWord', () => {
  it('renders english + chinese', () => {
    render(
      <StickerWord
        index={0}
        english="car"
        chinese="小汽车"
        position={{ x: 100, y: 100, rotate: 0 }}
      />,
    );
    expect(screen.getByText('car')).toBeTruthy();
    expect(screen.getByText('小汽车')).toBeTruthy();
  });
});

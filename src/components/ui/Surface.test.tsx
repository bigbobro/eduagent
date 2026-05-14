import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Surface } from './Surface';

describe('Surface', () => {
  it('默认 tone=cream', () => {
    render(<Surface>x</Surface>);
    expect(screen.getByText('x').className).toMatch(/bunny-bg-cream/);
  });
  it('tone=wood', () => {
    render(<Surface tone="wood">x</Surface>);
    expect(screen.getByText('x').className).toMatch(/bunny-wood/);
  });
  it('应用 rounded-bunny-lg + shadow-soft', () => {
    render(<Surface>x</Surface>);
    const el = screen.getByText('x');
    expect(el.className).toMatch(/rounded-bunny-lg/);
    expect(el.className).toMatch(/shadow-soft/);
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Bunny } from './Bunny';

describe('Bunny', () => {
  it('renders role=img with Bunny aria-label', () => {
    render(<Bunny pose="sit" mood="idle" />);
    expect(screen.getByRole('img', { name: /Bunny/i })).toBeTruthy();
  });

  it('renders sit pose group when pose=sit', () => {
    render(<Bunny pose="sit" />);
    expect(document.querySelector('[data-testid="bunny-pose-sit"]')).toBeTruthy();
  });

  it('exposes data-bunny-mood=listening when mood=listening', () => {
    render(<Bunny pose="stand" mood="listening" />);
    expect(document.querySelector('[data-bunny-mood="listening"]')).toBeTruthy();
  });

  it.each(['sit', 'stand', 'point', 'hold-flower', 'read'] as const)(
    'renders pose=%s',
    (pose) => {
      render(<Bunny pose={pose} />);
      expect(document.querySelector(`[data-testid="bunny-pose-${pose}"]`)).toBeTruthy();
    },
  );

  it('facing=left flips horizontally via transform style', () => {
    render(<Bunny pose="sit" facing="left" />);
    const root = document.querySelector('[role="img"]') as HTMLElement;
    expect(root.style.transform).toContain('scaleX(-1)');
  });
});

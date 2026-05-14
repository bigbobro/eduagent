import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SceneFrame } from './SceneFrame';

describe('SceneFrame', () => {
  it('exposes data-scene attr per variant', () => {
    render(
      <SceneFrame variant="yard">
        <div>x</div>
      </SceneFrame>,
    );
    expect(document.querySelector('[data-scene="yard"]')).toBeTruthy();
  });

  it('exposes data-enter-from when provided', () => {
    render(
      <SceneFrame variant="cabin" enterFrom="yard">
        <div>x</div>
      </SceneFrame>,
    );
    expect(document.querySelector('[data-enter-from="yard"]')).toBeTruthy();
  });

  it('renders children', () => {
    render(
      <SceneFrame variant="yard">
        <span>hello</span>
      </SceneFrame>,
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it.each(['yard', 'cabin', 'grass', 'storage', 'attic'] as const)(
    'accepts variant=%s',
    (variant) => {
      render(
        <SceneFrame variant={variant}>
          <div>x</div>
        </SceneFrame>,
      );
      expect(document.querySelector(`[data-scene="${variant}"]`)).toBeTruthy();
    },
  );
});

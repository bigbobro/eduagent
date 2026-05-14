import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BloomButton } from './BloomButton';

describe('BloomButton', () => {
  it('pointerDown triggers onPressStart', () => {
    const start = vi.fn();
    render(<BloomButton onPressStart={start} onPressEnd={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole('button'), { pointerId: 1 });
    expect(start).toHaveBeenCalledOnce();
  });
  it('pointerUp triggers onPressEnd', () => {
    const end = vi.fn();
    render(<BloomButton onPressStart={vi.fn()} onPressEnd={end} />);
    const btn = screen.getByRole('button');
    fireEvent.pointerDown(btn, { pointerId: 1 });
    fireEvent.pointerUp(btn, { pointerId: 1 });
    expect(end).toHaveBeenCalledOnce();
  });
  it('disabled blocks press', () => {
    const start = vi.fn();
    render(<BloomButton onPressStart={start} onPressEnd={vi.fn()} disabled />);
    fireEvent.pointerDown(screen.getByRole('button'), { pointerId: 1 });
    expect(start).not.toHaveBeenCalled();
  });
  it('exposes data-active=true when active', () => {
    render(<BloomButton onPressStart={vi.fn()} onPressEnd={vi.fn()} active />);
    expect(screen.getByRole('button').getAttribute('data-active')).toBe('true');
  });
});

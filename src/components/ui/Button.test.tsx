import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders children and triggers onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>点我</Button>);
    fireEvent.click(screen.getByText('点我'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disabled 时不触发 onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>点我</Button>);
    fireEvent.click(screen.getByText('点我'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('primary variant 使用 bunny-pink 背景', () => {
    render(<Button variant="primary">A</Button>);
    expect(screen.getByText('A').closest('button')!.className).toMatch(/bunny-pink/);
  });

  it('focus-visible 有焦点环 class', () => {
    render(<Button>A</Button>);
    expect(screen.getByText('A').closest('button')!.className).toMatch(/focus-visible:ring/);
  });
});

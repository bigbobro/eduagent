import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stars } from './Stars';

describe('Stars', () => {
  it('count=0 渲染 3 颗空星', () => {
    render(<Stars count={0} aria-label="mastery" />);
    const el = screen.getByLabelText('mastery');
    expect(el.querySelectorAll('[data-filled="true"]').length).toBe(0);
    expect(el.querySelectorAll('[data-filled="false"]').length).toBe(3);
  });
  it('count=2 渲染 2 满 1 空', () => {
    render(<Stars count={2} aria-label="mastery" />);
    const el = screen.getByLabelText('mastery');
    expect(el.querySelectorAll('[data-filled="true"]').length).toBe(2);
    expect(el.querySelectorAll('[data-filled="false"]').length).toBe(1);
  });
});

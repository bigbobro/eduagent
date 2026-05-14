import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { InteractivePhase } from './InteractivePhase';

function mockController(): any {
  return {
    on: vi.fn(),
    off: vi.fn(),
    getState: () => 'awaiting',
    startListening: vi.fn(),
    stopListening: vi.fn(),
  };
}

describe('InteractivePhase', () => {
  it('renders WordBook and the current card', () => {
    render(<InteractivePhase course={foodCourse} controller={mockController()} />);
    expect(screen.getByText(/apple/i)).toBeTruthy();
  });
});

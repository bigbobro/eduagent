import { describe, expect, it, vi } from 'vitest';
import { TurnTimeoutGuard } from './turn-timeout-guard';

describe('TurnTimeoutGuard', () => {
  it('fires onFire after the delay and removes the slot before firing', () => {
    vi.useFakeTimers();
    try {
      const g = new TurnTimeoutGuard();
      const fired = vi.fn(() => expect(g.has('a')).toBe(false));
      g.arm('a', 1000, fired);
      expect(g.has('a')).toBe(true);
      vi.advanceTimersByTime(999);
      expect(fired).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(fired).toHaveBeenCalledTimes(1);
      expect(g.has('a')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('arm replaces an existing timer of the same name', () => {
    vi.useFakeTimers();
    try {
      const g = new TurnTimeoutGuard();
      const first = vi.fn();
      const second = vi.fn();
      g.arm('a', 1000, first);
      g.arm('a', 1000, second);
      vi.advanceTimersByTime(1000);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clear cancels a pending timer before it fires', () => {
    vi.useFakeTimers();
    try {
      const g = new TurnTimeoutGuard();
      const fired = vi.fn();
      g.arm('a', 1000, fired);
      g.clear('a');
      expect(g.has('a')).toBe(false);
      vi.advanceTimersByTime(2000);
      expect(fired).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clearAll cancels every pending timer (teardown invariant)', () => {
    vi.useFakeTimers();
    try {
      const g = new TurnTimeoutGuard();
      const a = vi.fn();
      const b = vi.fn();
      g.arm('a', 1000, a);
      g.arm('b', 2000, b);
      g.clearAll();
      vi.advanceTimersByTime(5000);
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
      expect(g.has('a')).toBe(false);
      expect(g.has('b')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clear is a no-op for an unknown name', () => {
    const g = new TurnTimeoutGuard();
    expect(() => g.clear('nope')).not.toThrow();
  });
});

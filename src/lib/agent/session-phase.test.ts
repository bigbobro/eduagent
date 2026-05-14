import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createSession, endSession, getSession, setSessionPhase } from './session';

describe('session phase tracking', () => {
  it('phased course session starts at intro', () => {
    const session = createSession(foodCourse);
    expect(session.currentPhase).toBe('intro');
    endSession(session.id);
  });

  it('setSessionPhase updates phase', () => {
    const session = createSession(foodCourse);
    setSessionPhase(session.id, 'interactive');
    expect(getSession(session.id)?.currentPhase).toBe('interactive');
    endSession(session.id);
  });

  it('setSessionPhase on missing session is a no-op', () => {
    expect(() => setSessionPhase('nonexistent', 'interactive')).not.toThrow();
  });
});

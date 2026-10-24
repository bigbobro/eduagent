import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCurrentLearnerId, saveCurrentLearnerId, selectedLearner, type LearnerProfile } from './current-learner';
const items = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] as LearnerProfile[];
afterEach(() => vi.unstubAllGlobals());
describe('current learner selection', () => {
  it('auto-selects a single child and validates a stored selection against the live list', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    expect(selectedLearner([items[0]])).toEqual(items[0]);
    expect(selectedLearner(items)).toBeUndefined();
    saveCurrentLearnerId('b'); expect(selectedLearner(items)).toEqual(items[1]);
    saveCurrentLearnerId('deleted'); expect(selectedLearner(items)).toBeUndefined();
    saveCurrentLearnerId(null); expect(readCurrentLearnerId()).toBeNull();
  });
  it('returns to selection and never throws when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
    expect(readCurrentLearnerId()).toBeNull();
    expect(() => saveCurrentLearnerId('a')).not.toThrow();
    expect(() => saveCurrentLearnerId(null)).not.toThrow();
    expect(selectedLearner(items)).toBeUndefined();
  });
});

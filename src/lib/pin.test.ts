import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hasPin, setPin, verifyPin, recordFail, isLockedOut, clearAll } from './pin';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  get length() {
    return this.m.size;
  }
  key(_i: number) {
    return null;
  }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemStorage();
  clearAll();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-13T00:00:00Z'));
});

describe('pin', () => {
  it('hasPin() initially false', () => {
    expect(hasPin()).toBe(false);
  });

  it('setPin → hasPin true and verifyPin correct', async () => {
    await setPin('1234');
    expect(hasPin()).toBe(true);
    expect(await verifyPin('1234')).toBe(true);
    expect(await verifyPin('9999')).toBe(false);
  });

  it('hash is not plaintext', async () => {
    await setPin('1234');
    const raw = localStorage.getItem('bunny.parents.pin')!;
    expect(raw).not.toContain('1234');
    expect(raw.length).toBeGreaterThan(20);
  });

  it('3 failures → isLockedOut true', () => {
    recordFail();
    recordFail();
    recordFail();
    expect(isLockedOut().locked).toBe(true);
  });

  it('lockout expires after 30s', () => {
    recordFail();
    recordFail();
    recordFail();
    expect(isLockedOut().locked).toBe(true);
    vi.advanceTimersByTime(30_000 + 100);
    expect(isLockedOut().locked).toBe(false);
  });

  it('successful verify resets fail count', async () => {
    await setPin('1234');
    recordFail();
    recordFail();
    await verifyPin('1234');
    recordFail();
    recordFail();
    expect(isLockedOut().locked).toBe(false);
  });
});

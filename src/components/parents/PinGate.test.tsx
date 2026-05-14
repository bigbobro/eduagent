import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PinGate } from './PinGate';
import * as pin from '@/lib/pin';

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
  pin.clearAll();
});

describe('PinGate', () => {
  it('first-time: prompts to set password', async () => {
    render(<PinGate onUnlock={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/设置.*密码/)).toBeTruthy());
  });

  it('with stored PIN: prompts to enter password', async () => {
    await pin.setPin('2024');
    render(<PinGate onUnlock={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/输入.*密码/)).toBeTruthy());
  });

  it('3 wrong attempts triggers lockout UI', async () => {
    await pin.setPin('2024');
    const onUnlock = vi.fn();
    render(<PinGate onUnlock={onUnlock} />);
    await waitFor(() => screen.getByText(/输入.*密码/));
    for (let attempt = 0; attempt < 3; attempt++) {
      ['9', '9', '9', '9'].forEach((d) => fireEvent.click(screen.getByLabelText(`数字${d}`)));
      await waitFor(() => screen.getByText(/不对|稍等/));
    }
    await waitFor(() => expect(screen.getByText(/稍等/)).toBeTruthy());
    expect(onUnlock).not.toHaveBeenCalled();
  });
});

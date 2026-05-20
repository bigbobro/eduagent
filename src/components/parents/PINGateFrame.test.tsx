import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAll, setPin } from '@/lib/pin';
import { PINGateFrame } from './PINGateFrame';

class MemStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }

  get length() {
    return this.values.size;
  }

  key() {
    return null;
  }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemStorage();
  clearAll();
});

describe('PINGateFrame', () => {
  it('sets and confirms a first PIN', async () => {
    const onUnlock = vi.fn();
    render(<PINGateFrame onUnlock={onUnlock} />);

    expect(await screen.findByText('设置家长阁楼 PIN')).toBeTruthy();
    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByRole('button', { name: `数字${digit}` }));
    expect(await screen.findByText('再输一次确认')).toBeTruthy();
    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByRole('button', { name: `数字${digit}` }));

    await waitFor(() => expect(onUnlock).toHaveBeenCalledOnce());
  });

  it('unlocks an existing PIN', async () => {
    await setPin('1234');
    const onUnlock = vi.fn();
    render(<PINGateFrame onUnlock={onUnlock} />);

    expect(await screen.findByText('家长阁楼')).toBeTruthy();
    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByRole('button', { name: `数字${digit}` }));

    await waitFor(() => expect(onUnlock).toHaveBeenCalledOnce());
  });

  it('shows remaining attempts before lockout', async () => {
    await setPin('1234');
    render(<PINGateFrame onUnlock={() => {}} />);

    expect(await screen.findByText('家长阁楼')).toBeTruthy();
    for (const digit of ['0', '0', '0', '0']) fireEvent.click(screen.getByRole('button', { name: `数字${digit}` }));
    expect(await screen.findByText('不对哦,还剩 2 次')).toBeTruthy();

    for (const digit of ['0', '0', '0', '0']) fireEvent.click(screen.getByRole('button', { name: `数字${digit}` }));
    expect(await screen.findByText('不对哦,还剩 1 次')).toBeTruthy();

    for (const digit of ['0', '0', '0', '0']) fireEvent.click(screen.getByRole('button', { name: `数字${digit}` }));
    expect(await screen.findByText(/稍等 \d+ 秒/)).toBeTruthy();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAll } from '@/lib/pin';
import { ParentsClient } from './ParentsClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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
  vi.restoreAllMocks();
});

describe('ParentsClient', () => {
  it('unlocks first-time PIN setup and loads the stats panel', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith('/api/stats')) {
        return Promise.resolve(new Response(JSON.stringify({
          totalMinutes: 24,
          totalSessions: 3,
          totalWordsMastered: 6,
          last7Days: [],
        })));
      }
      if (url.startsWith('/api/sessions')) {
        return Promise.resolve(new Response(JSON.stringify([
          {
            lessonId: 'l1',
            courseId: 'food',
            courseTitle: '食物',
            startTime: '2026-05-20T09:05:00.000Z',
            endTime: '2026-05-20T09:20:00.000Z',
            durationMs: 900_000,
            interactionCount: 8,
            wordsAttempted: 6,
            wordsMastered: 4,
          },
        ])));
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    });

    render(<ParentsClient />);

    expect(await screen.findByText('设置家长阁楼 PIN')).toBeTruthy();
    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByRole('button', { name: `数字${digit}` }));
    expect(await screen.findByText('再输一次确认')).toBeTruthy();
    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByRole('button', { name: `数字${digit}` }));

    expect(await screen.findByText('已用 PIN 解锁')).toBeTruthy();
    expect(await screen.findByText('本周学习')).toBeTruthy();
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByText('食物')).toBeTruthy();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/stats'));
  });
});

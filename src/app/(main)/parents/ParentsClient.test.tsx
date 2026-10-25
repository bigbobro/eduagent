import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCurrentLearnerId } from '@/lib/current-learner';
import { ParentsClient } from './ParentsClient';

vi.mock('next/navigation', () => { const router = { push: vi.fn(), replace: vi.fn() }; return { useRouter: () => router }; });

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
  saveCurrentLearnerId('test-learner');
  vi.restoreAllMocks();
});

describe('ParentsClient', () => {
  it('loads the current child statistics directly', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url === '/api/learners') return Promise.resolve(new Response(JSON.stringify([{ id: 'test-learner', name: '宝宝' }])));
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

    expect(await screen.findByText('本周学习')).toBeTruthy();
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByText('食物')).toBeTruthy();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/stats?learnerId=test-learner'));
  });
});

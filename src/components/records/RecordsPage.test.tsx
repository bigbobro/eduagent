import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { CourseProgress, StatsSnapshot } from '@/types/progress';
import { heatCellSize } from './Heatmap';
import { RecordsPage } from './RecordsPage';

const words = [0, 1, 2, 3].map(stars => ({
  word: `word${stars}`,
  zh: '词',
  attempts: stars,
  correct: stars,
  masteryStars: stars as 0 | 1 | 2 | 3,
  lastPracticed: null,
  imageUrl: '/images/animals/cat.png',
}));
const course: CourseProgress = {
  courseId: 'animals',
  courseTitle: '动物 Animals',
  courseTone: 'mint',
  totalWords: 4,
  masteredWords: 1,
  words,
  timesStarted: 1,
  progressPercent: 100,
  completed: true,
  hasResume: false,
};
const stats: StatsSnapshot = {
  totalSessions: 23,
  totalMinutes: 312,
  totalWordsMastered: 1,
  last7Days: [{ date: '2026-10-25', minutes: 38 }],
  lastDays: Array.from({ length: 91 }, (_, index) => ({ date: `2026-08-${index}`, minutes: index % 30 })),
};
const props = {
  name: '赞赞',
  progress: {
    courses: [course, {
      ...course,
      courseId: 'food',
      courseTitle: '食物 Food',
      timesStarted: 0,
      words: words.map(word => ({ ...word, attempts: 0, masteryStars: 0 as const })),
    }],
    totalWordsMastered: 1,
    generatedAt: '',
  },
  stats,
  sessions: [],
  onRetry: vi.fn(),
  onStart: vi.fn(),
};

function courseRow() {
  return screen.getByRole('button', { name: /动物/ });
}

describe('RecordsPage', () => {
  it('renders 91 heat cells, learned totals and practiced courses only', () => {
    const { container } = render(<RecordsPage {...props} />);
    expect(screen.getByRole('heading', { name: /赞赞的学习记录/ })).toBeTruthy();
    expect(container.querySelectorAll('.records-heat i')).toHaveLength(91);
    expect(screen.getByText('上过 23 节课 · 共 5 小时 12 分钟')).toBeTruthy();
    expect(screen.queryByText('食物')).toBeNull();
    expect(container.querySelectorAll('.records-practice img')).toHaveLength(1);
    expect(screen.queryByText(/准确率|连续天数|开口意愿/)).toBeNull();
    expect(document.querySelector('.records-wall')).toBeNull();
  });

  it('opens the course sheet from a click, Escape and the close button, and restores focus', () => {
    render(<RecordsPage {...props} />);
    const row = courseRow();
    row.focus();
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog', { name: /动物/ })).toBeTruthy();
    expect(screen.getByText('已会 2 个 · 还剩 2 个')).toBeTruthy();
    expect(screen.getAllByLabelText('已掌握')).toHaveLength(2);
    expect(screen.getByLabelText('动物 Animals逐词掌握')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }));
    expect(document.body.classList.contains('records-sheet-open')).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);
    expect(document.body.classList.contains('records-sheet-open')).toBe(false);

    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);

    fireEvent.click(row);
    fireEvent.mouseDown(document.querySelector('.records-mask')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('opens the sheet from the keyboard', () => {
    render(<RecordsPage {...props} />);
    const row = courseRow();
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    row.focus();
    fireEvent.keyDown(row, { key: ' ' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }));
  });

  it('has empty, loading and retry states', () => {
    const { rerender } = render(<RecordsPage {...props} stats={null} />);
    expect(screen.getAllByLabelText('正在读取学习记录')).toHaveLength(4);
    rerender(<RecordsPage {...props} error />);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(props.onRetry).toHaveBeenCalled();
    rerender(<RecordsPage {...props} stats={{ ...stats, totalSessions: 0 }} />);
    expect(screen.getByText('上完第一节课,这里就会有记录')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '去上课' }));
    expect(props.onStart).toHaveBeenCalled();
  });
});

describe('heatCellSize', () => {
  it('keeps a 13 by 7 grid square and inside the available box', () => {
    expect(heatCellSize(13 * 20 + 12 * 5, 7 * 40 + 6 * 5)).toBe(20);
    expect(heatCellSize(13 * 40 + 12 * 5, 7 * 16 + 6 * 5)).toBe(16);
    const side = heatCellSize(180, 90);
    expect(side * 13 + 5 * 12).toBeLessThanOrEqual(180);
    expect(side * 7 + 5 * 6).toBeLessThanOrEqual(90);
    expect(heatCellSize(0, 100)).toBe(0);
  });
});

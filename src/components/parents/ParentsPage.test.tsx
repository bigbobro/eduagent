import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionSummary, StatsSnapshot } from '@/types/progress';
import { ParentsPage } from './ParentsPage';

const stats: StatsSnapshot = {
  totalMinutes: 24,
  totalSessions: 3,
  totalWordsMastered: 6,
  last7Days: [],
};

const sessions: SessionSummary[] = [
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
];

describe('ParentsPage', () => {
  it('renders stats and recent sessions', () => {
    render(<ParentsPage stats={stats} sessions={sessions} ttsVoice="Tina" onBack={() => {}} />);

    expect(screen.getByText('家长阁楼')).toBeTruthy();
    expect(screen.getByText('本周学习')).toBeTruthy();
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByText('食物')).toBeTruthy();
    expect(screen.getByText('Tina')).toBeTruthy();
  });

  it('renders fetch error states', () => {
    render(<ParentsPage stats={null} sessions={null} errStats errSessions ttsVoice="" onBack={() => {}} />);

    expect(screen.getByText('暂时拿不到数据')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

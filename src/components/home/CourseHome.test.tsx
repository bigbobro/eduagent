import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { animalsCourse } from '@/data/courses/animals';
import { colorsCourse } from '@/data/courses/colors';
import type { CourseProgress } from '@/types/progress';
import { CourseHome, lastPracticeLabel } from './CourseHome';
import { LearnerPicker } from './LearnerPicker';

const progress: CourseProgress = { courseId: 'food', courseTitle: foodCourse.title, courseTone: 'peach', totalWords: 12, masteredWords: 0, timesStarted: 1, progressPercent: 25, hasResume: true, completed: false, words: foodCourse.cards.filter(c => c.kind === 'word').map((word, i) => ({ word: word.english, zh: word.chinese, attempts: i < 3 ? 1 : 0, correct: 0, masteryStars: i === 0 ? 3 : i === 1 ? 2 : i === 2 ? 1 : 0, lastPracticed: i === 0 ? '2026-10-24T12:40:00' : null })) };
const props = { courses: [animalsCourse, foodCourse, colorsCourse], progress: [progress, { ...progress, courseId: 'colors', completed: true, hasResume: false, progressPercent: 100 }], learnerId: 'a', error: false, onRetry: vi.fn(), onCourseStart: vi.fn() };
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.clearAllMocks();
});

describe('CourseHome', () => {
  it('groups every course and defaults to the first course to continue', () => {
    render(<CourseHome {...props} />);
    for (const label of ['接着学 · 1', '学完了 · 1', '新课 · 1']) expect(screen.getByRole('heading', { name: label })).toBeTruthy();
    expect(screen.getByRole('button', { name: foodCourse.title })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '继续上课' })).toBeTruthy();
    expect(screen.getByText(/已会 2 个 · 还剩 10 个/)).toBeTruthy();
    expect(screen.getAllByLabelText('已掌握')).toHaveLength(2);
    expect(within(screen.getByLabelText('本课单词')).queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '继续上课' }));
    expect(props.onCourseStart).toHaveBeenCalledWith('food');
  });
  it('remembers an explicit selection for each child and on return home', () => {
    const { unmount } = render(<CourseHome {...props} />);
    fireEvent.click(screen.getByRole('button', { name: animalsCourse.title }));
    expect(screen.getByRole('button', { name: '开始上课' })).toBeTruthy();
    expect(screen.queryByText(/上次/)).toBeNull();
    unmount();
    const second = render(<CourseHome {...props} learnerId="b" />);
    expect(screen.getByRole('button', { name: foodCourse.title })).toHaveAttribute('aria-pressed', 'true');
    second.unmount();
    render(<CourseHome {...props} />);
    expect(screen.getByRole('button', { name: animalsCourse.title })).toHaveAttribute('aria-pressed', 'true');
  });
  it('ignores a remembered course removed from the catalog and labels completed courses', () => {
    localStorage.setItem('eduagent.selectedCourse.a', 'missing');
    render(<CourseHome {...props} />);
    fireEvent.click(screen.getByRole('button', { name: colorsCourse.title }));
    expect(screen.getByText('已学完')).toBeTruthy();
    expect(screen.getByRole('button', { name: '继续上课' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '从头复习' })).toBeNull();
  });
  it('distinguishes loading, errors and an empty catalog', () => {
    const view = render(<CourseHome {...props} progress={null} />);
    expect(screen.getByLabelText('正在读取课程详情')).toBeTruthy();
    view.rerender(<CourseHome {...props} error />);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    view.rerender(<CourseHome {...props} courses={[]} />);
    expect(screen.getByText('还没有课程')).toBeTruthy();
  });
  it('uses the latest valid practice date and local calendar days', () => {
    const now = new Date('2026-10-25T14:00:00');
    const words = (dates: string[]) => dates.map(lastPracticed => ({ ...progress.words[0], lastPracticed }));
    expect(lastPracticeLabel(words(['invalid', '2026-10-25T08:04:00']), now)).toBe('今天 08:04');
    expect(lastPracticeLabel(words(['2026-10-23T18:00:00', '2026-10-24T12:40:00']), now)).toBe('昨天 12:40');
    expect(lastPracticeLabel(words(['2026-10-01T09:05:00']), now)).toBe('10月1日 09:05');
    expect(lastPracticeLabel([], now)).toBeNull();
  });
});
describe('LearnerPicker', () => {
  it('offers named profiles and settings without assuming a selected child', () => {
    const select = vi.fn(), settings = vi.fn();
    render(<LearnerPicker learners={[{ id: 'a', name: '赞赞', avatar: null, createdAt: '' }, { id: 'b', name: '安安', avatar: null, createdAt: '' }]} error={false} onSelect={select} onSettings={settings} onRetry={() => {}} />);
    expect(screen.getByRole('heading', { name: '今天谁来学英语？' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '安安' }));
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    expect(settings).toHaveBeenCalledOnce();
  });
  it('keeps the first-profile entry', () => {
    render(<LearnerPicker learners={[]} error={false} onSelect={() => {}} onSettings={() => {}} onRetry={() => {}} />);
    expect(screen.getByRole('heading', { name: '建第一个孩子档案' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '建第一个孩子档案' })).toBeTruthy();
  });
});

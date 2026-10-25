import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DoneCelebrateFrame, suggestedCourse } from './DoneCelebrateFrame';
import type { CourseProgress } from '@/types/progress';

const course: CourseProgress = {
  courseId: 'animals',
  courseTitle: '动物 Animals',
  courseTone: 'mint',
  totalWords: 4,
  masteredWords: 1,
  timesStarted: 1,
  progressPercent: 100,
  hasResume: false,
  completed: true,
  words: [0, 1, 2, 3].map(stars => ({
    word: `word${stars}`,
    zh: '词',
    imageUrl: '/images/animals/cat.png',
    attempts: stars,
    correct: stars,
    masteryStars: stars as 0 | 1 | 2 | 3,
    lastPracticed: null,
  })),
};

describe('DoneCelebrateFrame', () => {
  it('uses durable mastery, shows factual duration and all four labels, and navigates', () => {
    const home = vi.fn();
    const again = vi.fn();
    const next = vi.fn();
    render(
      <DoneCelebrateFrame
        course={course}
        session={{
          lessonId: 's',
          courseId: 'animals',
          courseTitle: '动物',
          startTime: '',
          endTime: null,
          durationMs: 840000,
          interactionCount: 0,
          wordsAttempted: 4,
          wordsMastered: 2,
        }}
        next={course}
        onHome={home}
        onAgain={again}
        onNext={next}
      />,
    );
    expect(screen.getByRole('heading', { name: '动物课,过关 2 个词' })).toBeTruthy();
    expect(screen.getByText('用时 14 分钟 · 还有 2 个词下次再练')).toBeTruthy();
    ['没练到', '再练练', '好', '很好'].forEach(label => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.queryByText(/准确率/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '回到课程' }));
    fireEvent.click(screen.getByRole('button', { name: '再上一遍' }));
    fireEvent.click(screen.getByRole('button', { name: '开始下一课' }));
    expect(home).toHaveBeenCalledOnce();
    expect(again).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it('all passed omits remaining copy and missing session duration', () => {
    render(
      <DoneCelebrateFrame
        course={{ ...course, words: course.words.map(word => ({ ...word, masteryStars: 3 })) }}
        onHome={() => {}}
        onAgain={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: '动物课,4 个词全部过关' })).toBeTruthy();
    expect(screen.queryByText(/用时|下次再练/)).toBeNull();
  });

  it('suggests resumed course before new course, excluding current and learned courses', () => {
    const fresh = { ...course, courseId: 'fresh', timesStarted: 0, completed: false };
    const resume = { ...course, courseId: 'resume', hasResume: true };
    expect(suggestedCourse([course, fresh, resume], 'animals')?.courseId).toBe('resume');
    expect(suggestedCourse([course, fresh], 'animals')?.courseId).toBe('fresh');
    expect(suggestedCourse([course], 'animals')).toBeUndefined();
  });
});

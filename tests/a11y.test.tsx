import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Cat, PaperButton } from '@/components/magic';
import { CourseHome } from '@/components/home/CourseHome';
import { allCourses } from '@/data/courses';
import type { Course } from '@/types/course';

const course: Course = {
  id: 'x',
  title: '测试',
  description: '',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [],
  objectives: { sentences: [] },
  teachingHints: { opening: '', reviewCardIds: [], newCardIds: [], quizQuestions: [], closing: '' },
  phases: {
    introduction: { sceneCaption: '今天要认识食物' },
    interactive: {},
    reinforcement: { quizzes: [] },
  },
};

describe('a11y basics', () => {
  it('Cat exposes role=img + aria-label', () => {
    render(<Cat />);
    expect(screen.getByRole('img', { name: /Mochi/i })).toBeTruthy();
  });

  it('CourseHome course button aria-label contains course title', () => {
    render(
      <CourseHome
        courses={[course]}
        onRetry={() => {}}
        onCourseStart={() => {}}
        learnerId="test"
        progress={[]}
        error={false}
      />,
    );
    expect(screen.getByRole('button', { name: '测试' })).toBeTruthy();
  });

  it('CourseHome renders every registered course', () => {
    render(
      <CourseHome
        courses={allCourses}
        onRetry={() => {}}
        onCourseStart={() => {}}
        learnerId="test"
        progress={[]}
        error={false}
      />,
    );

    for (const registeredCourse of allCourses) {
      expect(screen.getByRole('button', { name: registeredCourse.title })).toBeTruthy();
    }
  });

  it('PaperButton keeps focus ring class', () => {
    render(<PaperButton>按住 Space</PaperButton>);
    const btn = screen.getByRole('button', { name: '按住 Space' });
    expect(btn.className).toMatch(/focus-visible:ring/);
  });
});

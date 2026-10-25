import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});

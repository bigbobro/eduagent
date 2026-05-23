'use client';

import { Course } from '@/types/course';
import { PhasedLessonView } from '@/components/lesson/PhasedLessonView';

interface LessonClientProps {
  course: Course;
}

export function LessonClient({ course }: LessonClientProps) {
  return <PhasedLessonView course={course} />;
}

'use client';

import { useEffect, useState } from 'react';
import { PhasedLessonView } from '@/components/lesson/PhasedLessonView';
import { Course } from '@/types/course';

interface LessonClientProps {
  courseId: string;
}

export function LessonClient({ courseId }: LessonClientProps) {
  const [course, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    fetch('/api/courses')
      .then((res) => res.json())
      .then((courses: Course[]) => {
        const found = courses.find((c) => c.id === courseId);
        if (found) setCourse(found);
      });
  }, [courseId]);

  if (!course) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return <PhasedLessonView course={course} />;
}

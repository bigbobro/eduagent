'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourseCard } from '@/components/home/CourseCard';
import { Course } from '@/types/course';

export default function HomePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    fetch('/api/courses')
      .then((res) => res.json())
      .then(setCourses);
  }, []);

  const handleCourseClick = (courseId: string) => {
    console.log('Course clicked:', courseId);
    router.push(`/lesson/${courseId}`);
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">EduAgent</h1>
        <p className="text-gray-500 mb-8">选择一个课程开始学习</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onClick={() => handleCourseClick(course.id)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HomeStudy } from '@/components/home/HomeStudy';
import { Course } from '@/types/course';

export default function HomePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    fetch('/api/courses')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(setCourses)
      .catch(() => setError(true));
  };
  useEffect(load, []);

  return (
    <HomeStudy
      courses={courses}
      error={error}
      onRetry={load}
      onCourseStart={(courseId) => router.push(`/lesson/${courseId}`)}
      onJournal={() => router.push('/journal')}
      onParents={() => router.push('/parents')}
    />
  );
}

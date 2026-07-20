'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HomeStudy, type CourseCardStatus } from '@/components/home/HomeStudy';
import { Course } from '@/types/course';
import type { ProgressSnapshot } from '@/types/progress';

export default function HomePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [progress, setProgress] = useState<Record<string, CourseCardStatus>>({});
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

    // Session persistence (2026-07-20): per-course status for the home list. Best-effort —
    // a progress fetch failure must not block course selection, it only hides the status line.
    fetch('/api/progress')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((snap: ProgressSnapshot) => {
        const map: Record<string, CourseCardStatus> = {};
        for (const c of snap.courses) {
          map[c.courseId] = {
            timesStarted: c.timesStarted,
            progressPercent: c.progressPercent,
            hasResume: c.hasResume,
            completed: c.completed,
          };
        }
        setProgress(map);
      })
      .catch(() => setProgress({}));
  };
  useEffect(load, []);

  return (
    <HomeStudy
      courses={courses}
      progress={progress}
      error={error}
      onRetry={load}
      onCourseStart={(courseId) => router.push(`/lesson/${courseId}`)}
      onJournal={() => router.push('/journal')}
      onParents={() => router.push('/parents')}
    />
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DoneCelebrateFrame } from '@/components/lesson/DoneCelebrateFrame';
import type { ProgressSnapshot } from '@/types/progress';
import type { Course } from '@/types/course';

interface Props {
  courseId: string;
}

export function LessonDoneClient({ courseId }: Props) {
  const router = useRouter();
  const [snap, setSnap] = useState<ProgressSnapshot | null>(null);
  const [, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/progress').then((r) => r.json()),
      fetch('/api/courses').then((r) => r.json()),
    ])
      .then(([p, courses]: [ProgressSnapshot, Course[]]) => {
        setSnap(p);
        setCourse(courses.find((c) => c.id === courseId) ?? null);
      })
      .catch(() => {
        setSnap({ courses: [], totalWordsMastered: 0, generatedAt: '' });
      });
  }, [courseId]);

  useEffect(() => {
    const t = setTimeout(() => router.push('/'), 8000);
    return () => clearTimeout(t);
  }, [router]);

  const masteredThisCourse =
    snap?.courses.find((c) => c.courseId === courseId)?.words.filter((w) => w.masteryStars >= 2) ??
    [];
  const totalNew = masteredThisCourse.length;

  return (
    <main className="w-screen h-screen relative">
      <DoneCelebrateFrame
        starsEarned={Math.min(5, totalNew)}
        totalStars={5}
        wordsLearned={totalNew}
        onHome={() => router.push('/')}
        onAgain={() => router.push(`/lesson/${courseId}`)}
      />
    </main>
  );
}

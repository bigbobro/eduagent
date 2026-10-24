'use client';
import { resolveCurrentLearner } from '@/lib/current-learner';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DoneCelebrateFrame } from '@/components/lesson/DoneCelebrateFrame';
import type { ProgressSnapshot } from '@/types/progress';

interface Props {
  courseId: string;
}

export function LessonDoneClient({ courseId }: Props) {
  const router = useRouter();
  const [snap, setSnap] = useState<ProgressSnapshot | null>(null);

  useEffect(() => {
    resolveCurrentLearner().then((learner) => {
      if (!learner) { router.replace('/'); throw new Error('请选择孩子'); }
      return fetch(`/api/progress?learnerId=${encodeURIComponent(learner.id)}`);
    })
      .then((r) => r.json())
      .then((p: ProgressSnapshot) => setSnap(p))
      .catch(() => {
        setSnap({ courses: [], totalWordsMastered: 0, generatedAt: '' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在挂载(或换课)时加载一次;router 只用于无孩子时跳回首页,不应触发重新加载
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

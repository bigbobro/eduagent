'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadLearners, selectedLearner, saveCurrentLearnerId } from '@/lib/current-learner';
import { Course } from '@/types/course';
import { PhasedLessonView } from '@/components/lesson/PhasedLessonView';

interface LessonClientProps {
  course: Course;
  requestedLearnerId?: string;
}

export function LessonClient({ course, requestedLearnerId: requested }: LessonClientProps) {
  const router = useRouter();
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    loadLearners().then((items) => {
      if (!active) return;
      const current = requested ? items.find((l) => l.id === requested) : selectedLearner(items);
      if (!current) { router.replace('/'); return; }
      saveCurrentLearnerId(current.id);
      setLearnerId(current.id);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [requested, router]);
  if (!learnerId) return <p role="status">{error ? '暂时读不到孩子档案，请返回首页重试。' : '正在读取孩子档案…'}</p>;
  return <PhasedLessonView course={course} learnerId={learnerId} />;
}

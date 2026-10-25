'use client';

import { useRouter } from 'next/navigation';
import { useLearningRecords } from '@/components/records/useLearningRecords';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { DoneCelebrateFrame, suggestedCourse } from './DoneCelebrateFrame';

export function DoneLesson({
  courseId,
  learnerId,
  onAgain,
}: {
  courseId: string;
  learnerId?: string;
  onAgain?: () => void;
}) {
  const router = useRouter();
  const { data, error, reload } = useLearningRecords(learnerId);
  const course = data?.progress.courses.find(item => item.courseId === courseId);
  const url = (id: string) => `/lesson/${id}?learnerId=${encodeURIComponent(data?.learnerId ?? '')}`;

  if (error || (data && !course)) {
    return <EmptyState title="暂时读不到课堂记录" action={<Button onClick={reload}>重试</Button>} />;
  }
  if (!data || !course) return <Skeleton label="正在读取课堂记录" className="h-full w-full" />;

  const next = suggestedCourse(data.progress.courses, courseId);
  return (
    <DoneCelebrateFrame
      course={course}
      session={data.sessions.find(item => item.courseId === courseId)}
      next={next}
      onHome={() => router.push('/')}
      onAgain={onAgain ?? (() => router.push(url(courseId)))}
      onNext={() => {
        if (next) router.push(url(next.courseId));
      }}
    />
  );
}

import { LessonClient } from './LessonClient';

interface LessonPageProps {
  params: { id: string };
}

export default function LessonPage({ params }: LessonPageProps) {
  return <LessonClient courseId={params.id} />;
}

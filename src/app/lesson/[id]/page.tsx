import { notFound } from 'next/navigation';
import { getCourseById } from '@/data/courses';
import { LessonClient } from './LessonClient';

interface LessonPageProps {
  params: { id: string };
  searchParams: { learnerId?: string };
}

export default function LessonPage({ params, searchParams }: LessonPageProps) {
  const course = getCourseById(params.id);
  if (!course) notFound();
  return <LessonClient course={course} requestedLearnerId={searchParams.learnerId} />;
}

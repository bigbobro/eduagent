import { notFound } from 'next/navigation';
import { getCourseById } from '@/data/courses';
import { LessonClient } from './LessonClient';

interface LessonPageProps {
  params: { id: string };
}

export default function LessonPage({ params }: LessonPageProps) {
  const course = getCourseById(params.id);
  if (!course) notFound();
  return <LessonClient course={course} />;
}

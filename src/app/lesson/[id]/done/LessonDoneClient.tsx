'use client';
import { Toolbar } from '@/components/shell/Toolbar';
import { DoneLesson } from '@/components/lesson/DoneLesson';
export function LessonDoneClient({ courseId }: { courseId: string }) {
  return <main className="done-route"><Toolbar /><div className="done-route-body"><DoneLesson courseId={courseId} /></div></main>;
}

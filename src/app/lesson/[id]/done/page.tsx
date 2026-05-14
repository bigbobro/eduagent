import { LessonDoneClient } from './LessonDoneClient';

export default function Page({ params }: { params: { id: string } }) {
  return <LessonDoneClient courseId={params.id} />;
}

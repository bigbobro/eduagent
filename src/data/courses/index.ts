import { Course } from '@/types/course';
import { foodCourse } from './food';

export const allCourses: Course[] = [foodCourse];

export function getCourseById(id: string): Course | undefined {
  return allCourses.find((c) => c.id === id);
}

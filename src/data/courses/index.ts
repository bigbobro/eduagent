import type { Course } from '@/types/course';
import { animalsCourse } from './animals';
import { bodyCourse } from './body';
import { clothesCourse } from './clothes';
import { colorsCourse } from './colors';
import { familyCourse } from './family';
import { foodCourse } from './food';
import { shapesCourse } from './shapes';
import { sportsCourse } from './sports';
import { toysCourse } from './toys';
import { weatherCourse } from './weather';

export const allCourses: Course[] = [
  foodCourse,
  colorsCourse,
  sportsCourse,
  animalsCourse,
  familyCourse,
  toysCourse,
  clothesCourse,
  weatherCourse,
  bodyCourse,
  shapesCourse,
];

export function getCourseById(id: string): Course | undefined {
  return allCourses.find((c) => c.id === id);
}

import type { Course } from '@/types/course';
import { animalsCourse } from './animals';
import { bodyCourse } from './body';
import { clothesCourse } from './clothes';
import { colorsCourse } from './colors';
import { familyCourse } from './family';
import { foodCourse } from './food';
import { homeCourse } from './home';
import { shapesCourse } from './shapes';
import { sportsCourse } from './sports';
import { toysCourse } from './toys';
import { weatherCourse } from './weather';
import { natureCourse } from './nature';
import { actionsCourse } from './actions';
import { schoolCourse } from './school';
import { fruitsCourse } from './fruits';
import { vegetablesCourse } from './vegetables';
import { oceanCourse } from './ocean';
import { farmCourse } from './farm';
import { jobsCourse } from './jobs';
import { insectsCourse } from './insects';
import { feelingsCourse } from './feelings';
import { playgroundCourse } from './playground';
import { oppositesCourse } from './opposites';
import { instrumentsCourse } from './instruments';
import { partyCourse } from './party';
import { bathroomCourse } from './bathroom';
import { spaceCourse } from './space';
import { hobbiesCourse } from './hobbies';
import { magicCourse } from './magic';
import { treatsCourse } from './treats';
import { toolsCourse } from './tools';
import { cityPlacesCourse } from './city-places';
import { constructionCourse } from './construction';
import { artSuppliesCourse } from './art-supplies';
import { technologyCourse } from './technology';
import { tablewareCourse } from './tableware';
import { campingCourse } from './camping';
import { safetyCourse } from './safety';
import { cleaningCourse } from './cleaning';
import { travelCourse } from './travel';

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
  homeCourse,
  natureCourse,
  actionsCourse,
  schoolCourse,
  fruitsCourse,
  vegetablesCourse,
  oceanCourse,
  farmCourse,
  jobsCourse,
  insectsCourse,
  feelingsCourse,
  playgroundCourse,
  oppositesCourse,
  instrumentsCourse,
  partyCourse,
  bathroomCourse,
  spaceCourse,
  hobbiesCourse,
  magicCourse,
  treatsCourse,
  toolsCourse,
  cityPlacesCourse,
  constructionCourse,
  artSuppliesCourse,
  technologyCourse,
  tablewareCourse,
  campingCourse,
  safetyCourse,
  cleaningCourse,
  travelCourse,
];

export function getCourseById(id: string): Course | undefined {
  return allCourses.find((c) => c.id === id);
}

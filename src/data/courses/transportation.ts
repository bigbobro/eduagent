import { Course } from '@/types/course';
import { timeNumbersCourse } from './timeNumbers';

export const transportationCourse: Course = {
  id: 'transportation',
  title: '交通工具 Transportation',
  description: '学习常见的交通工具英文名称',
  targetAge: [3, 6],
  cards: [
    { id: 'car',      english: 'car',      chinese: '小汽车', imageUrl: '/images/transportation/car.svg',      kind: 'word', difficulty: 1, tags: ['vehicle'] },
    { id: 'bus',      english: 'bus',      chinese: '公交车', imageUrl: '/images/transportation/bus.svg',      kind: 'word', difficulty: 1, tags: ['vehicle'] },
    { id: 'train',    english: 'train',    chinese: '火车',   imageUrl: '/images/transportation/train.svg',    kind: 'word', difficulty: 2, tags: ['vehicle'] },
    { id: 'airplane', english: 'airplane', chinese: '飞机',   imageUrl: '/images/transportation/airplane.svg', kind: 'word', difficulty: 2, tags: ['vehicle'] },
    { id: 'bicycle',  english: 'bicycle',  chinese: '自行车', imageUrl: '/images/transportation/bicycle.svg',  kind: 'word', difficulty: 2, tags: ['vehicle'] },
    { id: 'boat',     english: 'boat',     chinese: '船',     imageUrl: '/images/transportation/boat.svg',     kind: 'word', difficulty: 2, tags: ['vehicle'] },
  ],
  objectives: {
    sentences: ['What is this?', 'This is a ___.', 'Can you say ___?', 'I like ___.'],
  },
  teachingHints: {
    opening: '今天我们学习交通工具!看看这些是什么?',
    reviewCardIds: ['car', 'bus'],
    newCardIds: ['train', 'airplane', 'bicycle', 'boat'],
    quizQuestions: ['哪个是 airplane?', '你能说 train 吗?', 'What is this? (指向 car)'],
    closing: '今天我们学了 train, airplane, bicycle, boat,下次继续!',
  },
};

export const allCourses: Course[] = [transportationCourse, timeNumbersCourse];

export function getCourseById(id: string): Course | undefined {
  return allCourses.find((c) => c.id === id);
}

import { Course } from '@/types/course';

export const transportationCourse: Course = {
  id: 'transportation',
  title: '交通工具 Transportation',
  description: '学习常见的交通工具英文名称',
  targetAge: [3, 6],
  objectives: {
    words: [
      { english: 'car', chinese: '小汽车', difficulty: 1, tags: ['vehicle'], imageId: 'car' },
      { english: 'bus', chinese: '公交车', difficulty: 1, tags: ['vehicle'], imageId: 'bus' },
      { english: 'train', chinese: '火车', difficulty: 2, tags: ['vehicle'], imageId: 'train' },
      { english: 'airplane', chinese: '飞机', difficulty: 2, tags: ['vehicle'], imageId: 'airplane' },
      { english: 'bicycle', chinese: '自行车', difficulty: 2, tags: ['vehicle'], imageId: 'bicycle' },
      { english: 'boat', chinese: '船', difficulty: 2, tags: ['vehicle'], imageId: 'boat' },
    ],
    sentences: [
      'What is this?',
      'This is a ___.',
      'Can you say ___?',
      'I like ___.',
    ],
  },
  images: [
    {
      id: 'transportation_all',
      url: '/images/transportation/all.svg',
      description: '一张包含多种交通工具的总览图',
      regions: [
        { id: 'car', label: 'Car 小汽车', bbox: { x: 0.025, y: 0.033, w: 0.3, h: 0.45 } },
        { id: 'bus', label: 'Bus 公交车', bbox: { x: 0.35, y: 0.033, w: 0.3, h: 0.45 } },
        { id: 'train', label: 'Train 火车', bbox: { x: 0.675, y: 0.033, w: 0.3, h: 0.45 } },
        { id: 'airplane', label: 'Airplane 飞机', bbox: { x: 0.025, y: 0.517, w: 0.3, h: 0.45 } },
        { id: 'bicycle', label: 'Bicycle 自行车', bbox: { x: 0.35, y: 0.517, w: 0.3, h: 0.45 } },
        { id: 'boat', label: 'Boat 船', bbox: { x: 0.675, y: 0.517, w: 0.3, h: 0.45 } },
      ],
    },
    {
      id: 'car',
      url: '/images/transportation/car.svg',
      description: '小汽车',
      regions: [],
    },
    {
      id: 'bus',
      url: '/images/transportation/bus.svg',
      description: '公交车',
      regions: [],
    },
    {
      id: 'train',
      url: '/images/transportation/train.svg',
      description: '火车',
      regions: [],
    },
    {
      id: 'airplane',
      url: '/images/transportation/airplane.svg',
      description: '飞机',
      regions: [],
    },
    {
      id: 'bicycle',
      url: '/images/transportation/bicycle.svg',
      description: '自行车',
      regions: [],
    },
    {
      id: 'boat',
      url: '/images/transportation/boat.svg',
      description: '船',
      regions: [],
    },
  ],
  teachingHints: {
    opening: '今天我们学习交通工具！看看这些是什么？',
    reviewWords: ['car', 'bus'],
    newWords: ['train', 'airplane', 'bicycle', 'boat'],
    quizQuestions: [
      '哪个是 airplane？',
      '你能说 train 吗？',
      'What is this? (指向 car)',
    ],
    closing: '今天我们学了 train, airplane, bicycle, boat，下次继续！',
  },
};

export const allCourses: Course[] = [transportationCourse];

export function getCourseById(id: string): Course | undefined {
  return allCourses.find((c) => c.id === id);
}

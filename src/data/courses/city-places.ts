import type { Course } from '@/types/course';

export const cityPlacesCourse: Course = {
  id: 'city-places',
  title: '城市地点 City Places',
  description: '学习城市里常见地点的英文名称',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'hospital', english: 'hospital', chinese: '医院', imageUrl: '/images/city-places/hospital.png', kind: 'word', drillParts: ['hos', 'pi', 'tal'], difficulty: 2, tags: ['city-places'] },
    { id: 'library', english: 'library', chinese: '图书馆', imageUrl: '/images/city-places/library.png', kind: 'word', drillParts: ['li', 'brar', 'y'], difficulty: 2, tags: ['city-places'] },
    { id: 'museum', english: 'museum', chinese: '博物馆', imageUrl: '/images/city-places/museum.png', kind: 'word', drillParts: ['mu', 'se', 'um'], difficulty: 2, tags: ['city-places'] },
    { id: 'bakery', english: 'bakery', chinese: '面包店', imageUrl: '/images/city-places/bakery.png', kind: 'word', drillParts: ['bak', 'er', 'y'], difficulty: 2, tags: ['city-places'] },
    { id: 'post_office', english: 'post office', chinese: '邮局', imageUrl: '/images/city-places/post_office.png', kind: 'word', drillParts: ['post', 'office'], difficulty: 2, tags: ['city-places'] },
    { id: 'fire_station', english: 'fire station', chinese: '消防站', imageUrl: '/images/city-places/fire_station.png', kind: 'word', drillParts: ['fire', 'station'], difficulty: 2, tags: ['city-places'] },
    { id: 'police_station', english: 'police station', chinese: '警察局', imageUrl: '/images/city-places/police_station.png', kind: 'word', drillParts: ['police', 'station'], difficulty: 2, tags: ['city-places'] },
    { id: 'supermarket', english: 'supermarket', chinese: '超市', imageUrl: '/images/city-places/supermarket.png', kind: 'word', drillParts: ['su', 'per', 'mar', 'ket'], difficulty: 2, tags: ['city-places'] },
    { id: 'restaurant', english: 'restaurant', chinese: '餐厅', imageUrl: '/images/city-places/restaurant.png', kind: 'word', drillParts: ['res', 'tau', 'rant'], difficulty: 2, tags: ['city-places'] },
    { id: 'bank', english: 'bank', chinese: '银行', imageUrl: '/images/city-places/bank.png', kind: 'word', drillParts: ['bank'], difficulty: 1, tags: ['city-places'] },
    { id: 'cinema', english: 'cinema', chinese: '电影院', imageUrl: '/images/city-places/cinema.png', kind: 'word', drillParts: ['cin', 'e', 'ma'], difficulty: 2, tags: ['city-places'] },
    { id: 'zoo', english: 'zoo', chinese: '动物园', imageUrl: '/images/city-places/zoo.png', kind: 'word', drillParts: ['zoo'], difficulty: 1, tags: ['city-places'] },
    { id: 'sentence_hospital', english: 'I see a hospital.', chinese: '我看见一家医院。', imageUrl: '/images/city-places/hospital.png', kind: 'sentence', drillParts: ['I see', 'a hospital'], difficulty: 1, tags: ['city-places', 'sentence'] },
    { id: 'sentence_library', english: 'This is a library.', chinese: '这是一个图书馆。', imageUrl: '/images/city-places/library.png', kind: 'sentence', drillParts: ['This is', 'a library'], difficulty: 1, tags: ['city-places', 'sentence'] },
    { id: 'sentence_supermarket', english: 'I go to the supermarket.', chinese: '我去超市。', imageUrl: '/images/city-places/supermarket.png', kind: 'sentence', drillParts: ['I go to', 'the supermarket'], difficulty: 1, tags: ['city-places', 'sentence'] },
    { id: 'sentence_zoo', english: 'The zoo is fun.', chinese: '动物园很好玩。', imageUrl: '/images/city-places/zoo.png', kind: 'sentence', drillParts: ['The zoo', 'is fun'], difficulty: 1, tags: ['city-places', 'sentence'] },
  ],
  objectives: {
    sentences: ['I see a hospital.', 'This is a library.', 'I go to the supermarket.', 'The zoo is fun.'],
  },
  teachingHints: {
    opening: '今天我们在城市地图上散步,认识不同的地点。',
    reviewCardIds: [],
    newCardIds: ['hospital', 'library', 'museum', 'bakery', 'post_office', 'fire_station', 'police_station', 'supermarket', 'restaurant', 'bank', 'cinema', 'zoo'],
    quizQuestions: ['Where is the hospital?', 'Find the library.', 'Where is the supermarket?', 'Find the zoo.'],
    closing: '今天我们认识了 hospital, library, museum, bakery, post office, fire station, police station, supermarket, restaurant, bank, cinema, zoo!',
  },
  phases: {
    introduction: {
      sceneCaption: '一张彩色城市地图上标着医院、图书馆和动物园',
      narrationHint: '像带孩子看城市地图一样逐个介绍地点,不引入交通工具。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the hospital?', correctCardId: 'hospital', distractorCardIds: ['library', 'museum'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the library.', correctCardId: 'library', distractorCardIds: ['bakery', 'bank'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the supermarket?', correctCardId: 'supermarket', distractorCardIds: ['restaurant', 'cinema'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the zoo.', correctCardId: 'zoo', distractorCardIds: ['hospital', 'bank'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_hospital', targetText: 'I see a hospital.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_library', targetText: 'This is a library.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_supermarket', targetText: 'I go to the supermarket.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_zoo', targetText: 'The zoo is fun.' },
      ],
    },
  },
};

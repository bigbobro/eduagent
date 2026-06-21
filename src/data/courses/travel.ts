import type { Course } from '@/types/course';

export const travelCourse: Course = {
  id: 'travel',
  title: '旅行 Travel',
  description: '学习旅行物品和地点的英文名称',
  targetAge: [3, 6],
  tone: 'lilac',
  cards: [
    { id: 'suitcase', english: 'suitcase', chinese: '行李箱', imageUrl: '/images/travel/suitcase.png', kind: 'word', drillParts: ['suit', 'case'], asrAliases: ['seatcase'], difficulty: 1, tags: ['travel'] },
    { id: 'passport', english: 'passport', chinese: '护照', imageUrl: '/images/travel/passport.png', kind: 'word', drillParts: ['pass', 'port'], difficulty: 1, tags: ['travel'] },
    { id: 'ticket', english: 'ticket', chinese: '票', imageUrl: '/images/travel/ticket.png', kind: 'word', drillParts: ['tick', 'et'], difficulty: 1, tags: ['travel'] },
    { id: 'map', english: 'map', chinese: '地图', imageUrl: '/images/travel/map.png', kind: 'word', drillParts: ['map'], difficulty: 1, tags: ['travel'] },
    { id: 'hotel', english: 'hotel', chinese: '酒店', imageUrl: '/images/travel/hotel.png', kind: 'word', drillParts: ['ho', 'tel'], difficulty: 1, tags: ['travel'] },
    { id: 'postcard', english: 'postcard', chinese: '明信片', imageUrl: '/images/travel/postcard.png', kind: 'word', drillParts: ['post', 'card'], difficulty: 1, tags: ['travel'] },
    { id: 'guidebook', english: 'guidebook', chinese: '旅行指南', imageUrl: '/images/travel/guidebook.png', kind: 'word', drillParts: ['guide', 'book'], difficulty: 2, tags: ['travel'] },
    { id: 'souvenir', english: 'souvenir', chinese: '纪念品', imageUrl: '/images/travel/souvenir.png', kind: 'word', drillParts: ['sou', 've', 'nir'], difficulty: 2, tags: ['travel'] },
    { id: 'beach', english: 'beach', chinese: '海滩', imageUrl: '/images/travel/beach.png', kind: 'word', drillParts: ['beach'], difficulty: 1, tags: ['travel'] },
    { id: 'mountain', english: 'mountain', chinese: '山', imageUrl: '/images/travel/mountain.png', kind: 'word', drillParts: ['moun', 'tain'], difficulty: 1, tags: ['travel'] },
    { id: 'bridge', english: 'bridge', chinese: '桥', imageUrl: '/images/travel/bridge.png', kind: 'word', drillParts: ['bridge'], difficulty: 1, tags: ['travel'] },
    { id: 'umbrella', english: 'umbrella', chinese: '雨伞', imageUrl: '/images/travel/umbrella.png', kind: 'word', drillParts: ['um', 'brel', 'la'], difficulty: 2, tags: ['travel'] },
    { id: 'sentence_suitcase', english: 'I have a suitcase.', chinese: '我有一个行李箱。', imageUrl: '/images/travel/suitcase.png', kind: 'sentence', drillParts: ['I have', 'a suitcase'], difficulty: 1, tags: ['travel', 'sentence'] },
    { id: 'sentence_passport', english: 'This is my passport.', chinese: '这是我的护照。', imageUrl: '/images/travel/passport.png', kind: 'sentence', drillParts: ['This is', 'my passport'], difficulty: 1, tags: ['travel', 'sentence'] },
    { id: 'sentence_hotel', english: 'I see a hotel.', chinese: '我看见一家酒店。', imageUrl: '/images/travel/hotel.png', kind: 'sentence', drillParts: ['I see', 'a hotel'], difficulty: 1, tags: ['travel', 'sentence'] },
    { id: 'sentence_bridge', english: 'The bridge is long.', chinese: '这座桥很长。', imageUrl: '/images/travel/bridge.png', kind: 'sentence', drillParts: ['The bridge', 'is long'], difficulty: 1, tags: ['travel', 'sentence'] },
  ],
  objectives: {
    sentences: ['I have a suitcase.', 'This is my passport.', 'I see a hotel.', 'The bridge is long.'],
  },
  teachingHints: {
    opening: '今天我们准备去旅行,看看行李箱里和旅途中有什么。',
    reviewCardIds: [],
    newCardIds: ['suitcase', 'passport', 'ticket', 'map', 'hotel', 'postcard', 'guidebook', 'souvenir', 'beach', 'mountain', 'bridge', 'umbrella'],
    quizQuestions: ['Where is the suitcase?', 'Find the passport.', 'Where is the hotel?', 'Find the bridge.'],
    closing: '今天我们认识了 suitcase, passport, ticket, map, hotel, postcard, guidebook, souvenir, beach, mountain, bridge, umbrella!',
  },
  phases: {
    introduction: {
      sceneCaption: '旅行桌上放着行李箱、护照、地图和明信片',
      narrationHint: '用准备出发的期待感介绍旅行物品和地点,不要引入交通工具词汇。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the suitcase?', correctCardId: 'suitcase', distractorCardIds: ['passport', 'map'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the passport.', correctCardId: 'passport', distractorCardIds: ['ticket', 'postcard'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the hotel?', correctCardId: 'hotel', distractorCardIds: ['beach', 'mountain'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the bridge.', correctCardId: 'bridge', distractorCardIds: ['umbrella', 'souvenir'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_suitcase', targetText: 'I have a suitcase.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_passport', targetText: 'This is my passport.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_hotel', targetText: 'I see a hotel.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_bridge', targetText: 'The bridge is long.' },
      ],
    },
  },
};

import type { Course } from '@/types/course';

export const constructionCourse: Course = {
  id: 'construction',
  title: '建筑工地 Construction',
  description: '学习建筑工地上常见物品和材料的英文名称',
  targetAge: [3, 6],
  tone: 'butter',
  cards: [
    { id: 'brick', english: 'brick', chinese: '砖块', imageUrl: '/images/construction/brick.png', kind: 'word', drillParts: ['brick'], difficulty: 1, tags: ['construction'] },
    { id: 'cement', english: 'cement', chinese: '水泥', imageUrl: '/images/construction/cement.png', kind: 'word', drillParts: ['ce', 'ment'], difficulty: 2, tags: ['construction'] },
    { id: 'ladder', english: 'ladder', chinese: '梯子', imageUrl: '/images/construction/ladder.png', kind: 'word', drillParts: ['lad', 'der'], difficulty: 1, tags: ['construction'] },
    { id: 'shovel', english: 'shovel', chinese: '铲子', imageUrl: '/images/construction/shovel.png', kind: 'word', drillParts: ['shov', 'el'], difficulty: 2, tags: ['construction'] },
    { id: 'bucket', english: 'bucket', chinese: '桶', imageUrl: '/images/construction/bucket.png', kind: 'word', drillParts: ['buck', 'et'], difficulty: 1, tags: ['construction'] },
    { id: 'helmet', english: 'helmet', chinese: '安全帽', imageUrl: '/images/construction/helmet.png', kind: 'word', drillParts: ['hel', 'met'], difficulty: 1, tags: ['construction'] },
    { id: 'vest', english: 'vest', chinese: '背心', imageUrl: '/images/construction/vest.png', kind: 'word', drillParts: ['vest'], difficulty: 1, tags: ['construction'] },
    { id: 'wall', english: 'wall', chinese: '墙', imageUrl: '/images/construction/wall.png', kind: 'word', drillParts: ['wall'], difficulty: 1, tags: ['construction'] },
    { id: 'roof', english: 'roof', chinese: '屋顶', imageUrl: '/images/construction/roof.png', kind: 'word', drillParts: ['roof'], difficulty: 1, tags: ['construction'] },
    { id: 'blueprint', english: 'blueprint', chinese: '蓝图', imageUrl: '/images/construction/blueprint.png', kind: 'word', drillParts: ['blue', 'print'], difficulty: 2, tags: ['construction'] },
    { id: 'tower', english: 'tower', chinese: '塔楼', imageUrl: '/images/construction/tower.png', kind: 'word', drillParts: ['tow', 'er'], difficulty: 1, tags: ['construction'] },
    { id: 'crane', english: 'crane', chinese: '起重机', imageUrl: '/images/construction/crane.png', kind: 'word', drillParts: ['crane'], difficulty: 1, tags: ['construction'] },
    { id: 'sentence_brick', english: 'I see a brick.', chinese: '我看见一块砖。', imageUrl: '/images/construction/brick.png', kind: 'sentence', drillParts: ['I see', 'a brick'], difficulty: 1, tags: ['construction', 'sentence'] },
    { id: 'sentence_helmet', english: 'The helmet is yellow.', chinese: '安全帽是黄色的。', imageUrl: '/images/construction/helmet.png', kind: 'sentence', drillParts: ['The helmet', 'is yellow'], difficulty: 1, tags: ['construction', 'sentence'] },
    { id: 'sentence_wall', english: 'The wall is tall.', chinese: '墙很高。', imageUrl: '/images/construction/wall.png', kind: 'sentence', drillParts: ['The wall', 'is tall'], difficulty: 1, tags: ['construction', 'sentence'] },
    { id: 'sentence_crane', english: 'The crane is big.', chinese: '起重机很大。', imageUrl: '/images/construction/crane.png', kind: 'sentence', drillParts: ['The crane', 'is big'], difficulty: 1, tags: ['construction', 'sentence'] },
  ],
  objectives: {
    sentences: ['I see a brick.', 'The helmet is yellow.', 'The wall is tall.', 'The crane is big.'],
  },
  teachingHints: {
    opening: '今天我们戴好想象中的安全帽,看看建筑工地上有什么。',
    reviewCardIds: [],
    newCardIds: ['brick', 'cement', 'ladder', 'shovel', 'bucket', 'helmet', 'vest', 'wall', 'roof', 'blueprint', 'tower', 'crane'],
    quizQuestions: ['Where is the brick?', 'Find the helmet.', 'Where is the wall?', 'Find the crane.'],
    closing: '今天我们认识了 brick, cement, ladder, shovel, bucket, helmet, vest, wall, roof, blueprint, tower, crane!',
  },
  phases: {
    introduction: {
      sceneCaption: '温暖阳光下的建筑工地摆着砖块、梯子和黄色安全帽',
      narrationHint: '用安全、观察的语气介绍建筑物品,避开交通工具词汇。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the brick?', correctCardId: 'brick', distractorCardIds: ['cement', 'bucket'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the helmet.', correctCardId: 'helmet', distractorCardIds: ['vest', 'ladder'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the wall?', correctCardId: 'wall', distractorCardIds: ['roof', 'tower'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the crane.', correctCardId: 'crane', distractorCardIds: ['shovel', 'blueprint'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_brick', targetText: 'I see a brick.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_helmet', targetText: 'The helmet is yellow.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_wall', targetText: 'The wall is tall.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_crane', targetText: 'The crane is big.' },
      ],
    },
  },
};

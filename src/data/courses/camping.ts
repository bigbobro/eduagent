import type { Course } from '@/types/course';

export const campingCourse: Course = {
  id: 'camping',
  title: '露营 Camping',
  description: '学习露营装备和营地物品的英文名称',
  targetAge: [3, 6],
  tone: 'mint',
  cards: [
    { id: 'tent', english: 'tent', chinese: '帐篷', imageUrl: '/images/camping/tent.png', kind: 'word', drillParts: ['tent'], difficulty: 1, tags: ['camping'] },
    { id: 'campfire', english: 'campfire', chinese: '营火', imageUrl: '/images/camping/campfire.png', kind: 'word', drillParts: ['camp', 'fire'], difficulty: 1, tags: ['camping'] },
    { id: 'backpack', english: 'backpack', chinese: '背包', imageUrl: '/images/camping/backpack.png', kind: 'word', drillParts: ['back', 'pack'], difficulty: 1, tags: ['camping'] },
    { id: 'flashlight', english: 'flashlight', chinese: '手电筒', imageUrl: '/images/camping/flashlight.png', kind: 'word', drillParts: ['flash', 'light'], difficulty: 1, tags: ['camping'] },
    { id: 'sleeping_bag', english: 'sleeping bag', chinese: '睡袋', imageUrl: '/images/camping/sleeping_bag.png', kind: 'word', drillParts: ['sleep', 'ing', 'bag'], difficulty: 2, tags: ['camping'] },
    { id: 'compass', english: 'compass', chinese: '指南针', imageUrl: '/images/camping/compass.png', kind: 'word', drillParts: ['com', 'pass'], difficulty: 1, tags: ['camping'] },
    { id: 'lantern', english: 'lantern', chinese: '提灯', imageUrl: '/images/camping/lantern.png', kind: 'word', drillParts: ['lan', 'tern'], difficulty: 1, tags: ['camping'] },
    { id: 'log', english: 'log', chinese: '木柴', imageUrl: '/images/camping/log.png', kind: 'word', drillParts: ['log'], difficulty: 1, tags: ['camping'] },
    { id: 'marshmallow', english: 'marshmallow', chinese: '棉花糖', imageUrl: '/images/camping/marshmallow.png', kind: 'word', drillParts: ['marsh', 'mal', 'low'], difficulty: 2, tags: ['camping'] },
    { id: 'picnic', english: 'picnic', chinese: '野餐', imageUrl: '/images/camping/picnic.png', kind: 'word', drillParts: ['pic', 'nic'], difficulty: 1, tags: ['camping'] },
    { id: 'campsite', english: 'campsite', chinese: '营地', imageUrl: '/images/camping/campsite.png', kind: 'word', drillParts: ['camp', 'site'], difficulty: 1, tags: ['camping'] },
    { id: 'hammock', english: 'hammock', chinese: '吊床', imageUrl: '/images/camping/hammock.png', kind: 'word', drillParts: ['ham', 'mock'], difficulty: 1, tags: ['camping'] },
    { id: 'sentence_tent', english: 'I see a tent.', chinese: '我看见一个帐篷。', imageUrl: '/images/camping/tent.png', kind: 'sentence', drillParts: ['I see', 'a tent'], difficulty: 1, tags: ['camping', 'sentence'] },
    { id: 'sentence_campfire', english: 'The campfire is warm.', chinese: '营火很温暖。', imageUrl: '/images/camping/campfire.png', kind: 'sentence', drillParts: ['The campfire', 'is warm'], difficulty: 1, tags: ['camping', 'sentence'] },
    { id: 'sentence_compass', english: 'I have a compass.', chinese: '我有一个指南针。', imageUrl: '/images/camping/compass.png', kind: 'sentence', drillParts: ['I have', 'a compass'], difficulty: 1, tags: ['camping', 'sentence'] },
    { id: 'sentence_hammock', english: 'The hammock is soft.', chinese: '吊床很软。', imageUrl: '/images/camping/hammock.png', kind: 'sentence', drillParts: ['The hammock', 'is soft'], difficulty: 1, tags: ['camping', 'sentence'] },
  ],
  objectives: {
    sentences: ['I see a tent.', 'The campfire is warm.', 'I have a compass.', 'The hammock is soft.'],
  },
  teachingHints: {
    opening: '今天我们来到小营地,认识露营会用到的东西。',
    reviewCardIds: [],
    newCardIds: ['tent', 'campfire', 'backpack', 'flashlight', 'sleeping_bag', 'compass', 'lantern', 'log', 'marshmallow', 'picnic', 'campsite', 'hammock'],
    quizQuestions: ['Where is the tent?', 'Find the campfire.', 'Where is the compass?', 'Find the hammock.'],
    closing: '今天我们认识了 tent, campfire, backpack, flashlight, sleeping bag, compass, lantern, log, marshmallow, picnic, campsite, hammock!',
  },
  phases: {
    introduction: {
      sceneCaption: '温暖营地里有帐篷、提灯、背包和安全的营火',
      narrationHint: '用轻松户外探险的语气介绍装备,避开 nature 课程里的通用自然词。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the tent?', correctCardId: 'tent', distractorCardIds: ['backpack', 'lantern'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the campfire.', correctCardId: 'campfire', distractorCardIds: ['log', 'picnic'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the compass?', correctCardId: 'compass', distractorCardIds: ['flashlight', 'campsite'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the hammock.', correctCardId: 'hammock', distractorCardIds: ['sleeping_bag', 'marshmallow'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_tent', targetText: 'I see a tent.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_campfire', targetText: 'The campfire is warm.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_compass', targetText: 'I have a compass.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_hammock', targetText: 'The hammock is soft.' },
      ],
    },
  },
};

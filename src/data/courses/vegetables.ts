import type { Course } from '@/types/course';

export const vegetablesCourse: Course = {
  id: 'vegetables',
  title: '健康蔬菜 Vegetables',
  description: '学习餐桌上常见蔬菜的英文名称',
  targetAge: [3, 6],
  tone: 'mint',
  cards: [
    { id: 'tomato', english: 'tomato', chinese: '西红柿', imageUrl: '/images/vegetables/tomato.png', kind: 'word', drillParts: ["to","ma","to"], difficulty: 1, tags: ['vegetables'] },
    { id: 'potato', english: 'potato', chinese: '土豆', imageUrl: '/images/vegetables/potato.png', kind: 'word', drillParts: ["po","ta","to"], difficulty: 1, tags: ['vegetables'] },
    { id: 'carrot', english: 'carrot', chinese: '胡萝卜', imageUrl: '/images/vegetables/carrot.png', kind: 'word', drillParts: ["car","rot"], difficulty: 1, tags: ['vegetables'] },
    { id: 'onion', english: 'onion', chinese: '洋葱', imageUrl: '/images/vegetables/onion.png', kind: 'word', drillParts: ["on","ion"], difficulty: 1, tags: ['vegetables'] },
    { id: 'corn', english: 'corn', chinese: '玉米', imageUrl: '/images/vegetables/corn.png', kind: 'word', drillParts: ["corn"], difficulty: 1, tags: ['vegetables'] },
    { id: 'garlic', english: 'garlic', chinese: '大蒜', imageUrl: '/images/vegetables/garlic.png', kind: 'word', drillParts: ["gar","lic"], difficulty: 1, tags: ['vegetables'] },
    { id: 'pumpkin', english: 'pumpkin', chinese: '南瓜', imageUrl: '/images/vegetables/pumpkin.png', kind: 'word', drillParts: ["pump","kin"], difficulty: 1, tags: ['vegetables'] },
    { id: 'cabbage', english: 'cabbage', chinese: '卷心菜', imageUrl: '/images/vegetables/cabbage.png', kind: 'word', drillParts: ["cab","bage"], difficulty: 1, tags: ['vegetables'] },
    { id: 'mushroom', english: 'mushroom', chinese: '蘑菇', imageUrl: '/images/vegetables/mushroom.png', kind: 'word', drillParts: ["mush","room"], difficulty: 1, tags: ['vegetables'] },
    { id: 'broccoli', english: 'broccoli', chinese: '西兰花', imageUrl: '/images/vegetables/broccoli.png', kind: 'word', drillParts: ["broc","co","li"], difficulty: 2, tags: ['vegetables'] },
    { id: 'cucumber', english: 'cucumber', chinese: '黄瓜', imageUrl: '/images/vegetables/cucumber.png', kind: 'word', drillParts: ["cu","cum","ber"], difficulty: 2, tags: ['vegetables'] },
    { id: 'pea', english: 'pea', chinese: '豌豆', imageUrl: '/images/vegetables/pea.png', kind: 'word', drillParts: ["pea"], difficulty: 1, tags: ['vegetables'] },
    { id: 'sentence_carrot', english: 'Eat your carrot.', chinese: '吃你的胡萝卜。', imageUrl: '/images/vegetables/carrot.png', kind: 'sentence', drillParts: ["Eat","your carrot"], difficulty: 1, tags: ['vegetables', 'sentence'] },
    { id: 'sentence_corn', english: 'I like yellow corn.', chinese: '我喜欢黄玉米。', imageUrl: '/images/vegetables/corn.png', kind: 'sentence', drillParts: ["I like","yellow corn"], difficulty: 1, tags: ['vegetables', 'sentence'] },
    { id: 'sentence_potato', english: 'This is a potato.', chinese: '这是一个土豆。', imageUrl: '/images/vegetables/potato.png', kind: 'sentence', drillParts: ["This is","a potato"], difficulty: 1, tags: ['vegetables', 'sentence'] },
    { id: 'sentence_pumpkin', english: 'Look at the pumpkin.', chinese: '看那个南瓜。', imageUrl: '/images/vegetables/pumpkin.png', kind: 'sentence', drillParts: ["Look at","the pumpkin"], difficulty: 1, tags: ['vegetables', 'sentence'] }
  ],
  objectives: {
    sentences: ["Eat your carrot.","I like yellow corn.","This is a potato.","Look at the pumpkin."],
  },
  teachingHints: {
    opening: '今天我们去小菜园,看看地里长着什么蔬菜吧!',
    reviewCardIds: [],
    newCardIds: ["tomato","potato","carrot","onion","corn","garlic","pumpkin","cabbage","mushroom","broccoli","cucumber","pea"],
    quizQuestions: ["Where is the carrot?","Where is the corn?","Where is the potato?","Where is the pumpkin?"],
    closing: '今天我们认识了 tomato, potato, carrot, onion, corn, garlic, pumpkin, cabbage, mushroom, broccoli, cucumber, pea!',
  },
  phases: {
    introduction: {
      sceneCaption: '肥沃的泥土里长着绿油油的蔬菜和金黄的玉米',
      narrationHint: '引导孩子健康饮食,爱上吃蔬菜。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the carrot?', correctCardId: 'carrot', distractorCardIds: ["tomato","potato"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the corn?', correctCardId: 'corn', distractorCardIds: ["tomato","potato"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the potato?', correctCardId: 'potato', distractorCardIds: ["tomato","carrot"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the pumpkin?', correctCardId: 'pumpkin', distractorCardIds: ["tomato","potato"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_carrot', targetText: 'Eat your carrot.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_corn', targetText: 'I like yellow corn.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_potato', targetText: 'This is a potato.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_pumpkin', targetText: 'Look at the pumpkin.' }
      ],
    },
  },
};

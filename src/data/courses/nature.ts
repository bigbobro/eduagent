import type { Course } from '@/types/course';

export const natureCourse: Course = {
  id: 'nature',
  title: '大自然 Nature',
  description: '学习自然风景与天体的英文名称',
  targetAge: [3, 6],
  tone: 'mint',
  cards: [
    { id: 'sun', english: 'sun', chinese: '太阳', imageUrl: '/images/nature/sun.png', kind: 'word', drillParts: ["sun"], difficulty: 1, tags: ['nature'] },
    { id: 'moon', english: 'moon', chinese: '月亮', imageUrl: '/images/nature/moon.png', kind: 'word', drillParts: ["moon"], difficulty: 1, tags: ['nature'] },
    { id: 'star', english: 'star', chinese: '星星', imageUrl: '/images/nature/star.png', kind: 'word', drillParts: ["star"], difficulty: 1, tags: ['nature'] },
    { id: 'tree', english: 'tree', chinese: '大树', imageUrl: '/images/nature/tree.png', kind: 'word', drillParts: ["tree"], difficulty: 1, tags: ['nature'] },
    { id: 'flower', english: 'flower', chinese: '花朵', imageUrl: '/images/nature/flower.png', kind: 'word', drillParts: ["flow","er"], difficulty: 1, tags: ['nature'] },
    { id: 'grass', english: 'grass', chinese: '草地', imageUrl: '/images/nature/grass.png', kind: 'word', drillParts: ["grass"], difficulty: 1, tags: ['nature'] },
    { id: 'cloud', english: 'cloud', chinese: '云朵', imageUrl: '/images/nature/cloud.png', kind: 'word', drillParts: ["cloud"], difficulty: 1, tags: ['nature'] },
    { id: 'river', english: 'river', chinese: '小河', imageUrl: '/images/nature/river.png', kind: 'word', drillParts: ["riv","er"], difficulty: 1, tags: ['nature'] },
    { id: 'rainbow', english: 'rainbow', chinese: '彩虹', imageUrl: '/images/nature/rainbow.png', kind: 'word', drillParts: ["rain","bow"], difficulty: 1, tags: ['nature'] },
    { id: 'stone', english: 'stone', chinese: '石头', imageUrl: '/images/nature/stone.png', kind: 'word', drillParts: ["stone"], difficulty: 1, tags: ['nature'] },
    { id: 'leaf', english: 'leaf', chinese: '树叶', imageUrl: '/images/nature/leaf.png', kind: 'word', drillParts: ["leaf"], difficulty: 1, tags: ['nature'] },
    { id: 'forest', english: 'forest', chinese: '森林', imageUrl: '/images/nature/forest.png', kind: 'word', drillParts: ["for","est"], difficulty: 2, tags: ['nature'] },
    { id: 'sentence_sun', english: 'Look at the sun.', chinese: '看太阳。', imageUrl: '/images/nature/sun.png', kind: 'sentence', drillParts: ["Look at","the sun"], difficulty: 1, tags: ['nature', 'sentence'] },
    { id: 'sentence_star', english: 'I see a star.', chinese: '我看见一颗星星。', imageUrl: '/images/nature/star.png', kind: 'sentence', drillParts: ["I see","a star"], difficulty: 1, tags: ['nature', 'sentence'] },
    { id: 'sentence_flower', english: 'The flower is red.', chinese: '花是红色的。', imageUrl: '/images/nature/flower.png', kind: 'sentence', drillParts: ["The flower","is red"], difficulty: 1, tags: ['nature', 'sentence'] },
    { id: 'sentence_tree', english: 'It is a big tree.', chinese: '它是一棵大树。', imageUrl: '/images/nature/tree.png', kind: 'sentence', drillParts: ["It is","a big tree"], difficulty: 1, tags: ['nature', 'sentence'] }
  ],
  objectives: {
    sentences: ["Look at the sun.","I see a star.","The flower is red.","It is a big tree."],
  },
  teachingHints: {
    opening: '今天我们去神奇的大自然中看看吧!',
    reviewCardIds: [],
    newCardIds: ["sun","moon","star","tree","flower","grass","cloud","river","rainbow","stone","leaf","forest"],
    quizQuestions: ["Where is the sun?","Where is the star?","Where is the flower?","Where is the tree?"],
    closing: '今天我们认识了 sun, moon, star, tree, flower, grass, cloud, river, rainbow, stone, leaf, forest!',
  },
  phases: {
    introduction: {
      sceneCaption: '蓝天白云下是一片美丽的森林小溪',
      narrationHint: '带着孩子欣赏自然风光,用温暖细腻的语言描述它们。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the sun?', correctCardId: 'sun', distractorCardIds: ["moon","star"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the star?', correctCardId: 'star', distractorCardIds: ["sun","moon"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the flower?', correctCardId: 'flower', distractorCardIds: ["sun","moon"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the tree?', correctCardId: 'tree', distractorCardIds: ["sun","moon"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_sun', targetText: 'Look at the sun.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_star', targetText: 'I see a star.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_flower', targetText: 'The flower is red.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_tree', targetText: 'It is a big tree.' }
      ],
    },
  },
};

import type { Course } from '@/types/course';

export const clothesCourse: Course = {
  id: 'clothes',
  title: '衣物 Clothes',
  description: '学习常见衣物的英文名称',
  targetAge: [3, 6],
  tone: 'mint',
  cards: [
    { id: 'shirt', english: 'shirt', chinese: '衬衫', imageUrl: '/images/clothes/shirt.png', kind: 'word', drillParts: ['shirt'], difficulty: 1, tags: ['clothes'] },
    { id: 'pants', english: 'pants', chinese: '裤子', imageUrl: '/images/clothes/pants.png', kind: 'word', drillParts: ['pants'], difficulty: 1, tags: ['clothes'] },
    { id: 'shoes', english: 'shoes', chinese: '鞋子', imageUrl: '/images/clothes/shoes.png', kind: 'word', drillParts: ['shoes'], difficulty: 1, tags: ['clothes'] },
    { id: 'hat', english: 'hat', chinese: '帽子', imageUrl: '/images/clothes/hat.png', kind: 'word', drillParts: ['hat'], difficulty: 1, tags: ['clothes'] },
    { id: 'socks', english: 'socks', chinese: '袜子', imageUrl: '/images/clothes/socks.png', kind: 'word', drillParts: ['socks'], difficulty: 1, tags: ['clothes'] },
    { id: 'dress', english: 'dress', chinese: '连衣裙', imageUrl: '/images/clothes/dress.png', kind: 'word', drillParts: ['dress'], difficulty: 1, tags: ['clothes'] },
    { id: 'coat', english: 'coat', chinese: '外套', imageUrl: '/images/clothes/coat.png', kind: 'word', drillParts: ['coat'], difficulty: 1, tags: ['clothes'] },
    { id: 'shorts', english: 'shorts', chinese: '短裤', imageUrl: '/images/clothes/shorts.png', kind: 'word', drillParts: ['shorts'], difficulty: 1, tags: ['clothes'] },
    { id: 'skirt', english: 'skirt', chinese: '裙子', imageUrl: '/images/clothes/skirt.png', kind: 'word', drillParts: ['skirt'], difficulty: 1, tags: ['clothes'] },
    { id: 'scarf', english: 'scarf', chinese: '围巾', imageUrl: '/images/clothes/scarf.png', kind: 'word', drillParts: ['scarf'], difficulty: 1, tags: ['clothes'] },
    { id: 'gloves', english: 'gloves', chinese: '手套', imageUrl: '/images/clothes/gloves.png', kind: 'word', drillParts: ['gloves'], difficulty: 1, tags: ['clothes'] },
    { id: 'boots', english: 'boots', chinese: '靴子', imageUrl: '/images/clothes/boots.png', kind: 'word', drillParts: ['boots'], difficulty: 1, tags: ['clothes'] },
    { id: 'sentence_hat', english: 'I wear my hat.', chinese: '我戴我的帽子。', imageUrl: '/images/clothes/hat.png', kind: 'sentence', drillParts: ['I wear', 'my hat'], difficulty: 1, tags: ['clothes', 'sentence'] },
    { id: 'sentence_shoes', english: 'I see shoes.', chinese: '我看见鞋子。', imageUrl: '/images/clothes/shoes.png', kind: 'sentence', drillParts: ['I see', 'shoes'], difficulty: 1, tags: ['clothes', 'sentence'] },
    { id: 'sentence_coat', english: 'This is a coat.', chinese: '这是一件外套。', imageUrl: '/images/clothes/coat.png', kind: 'sentence', drillParts: ['This is', 'a coat'], difficulty: 1, tags: ['clothes', 'sentence'] },
    { id: 'sentence_boots', english: 'I like my boots.', chinese: '我喜欢我的靴子。', imageUrl: '/images/clothes/boots.png', kind: 'sentence', drillParts: ['I like', 'my boots'], difficulty: 1, tags: ['clothes', 'sentence'] },
  ],
  objectives: {
    sentences: ['I wear my hat.', 'I see shoes.', 'This is a coat.', 'I like my boots.'],
  },
  teachingHints: {
    opening: '今天我们整理魔法衣柜,认识几件衣物!',
    reviewCardIds: [],
    newCardIds: ['shirt', 'pants', 'shoes', 'hat', 'socks', 'dress', 'coat', 'shorts', 'skirt', 'scarf', 'gloves', 'boots'],
    quizQuestions: ['Where is the hat?', 'Find shoes.', 'Which one is shirt?', 'Find boots.'],
    closing: '今天我们认识了 shirt, pants, shoes, hat, socks, dress, coat, shorts, skirt, scarf, gloves, boots!',
  },
  phases: {
    introduction: {
      sceneCaption: '魔法衣柜里挂着不同衣物',
      narrationHint: '逐件介绍衣物,语气自然,可用 I wear my ...。不要纠正孩子暂时没说出的内容。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the hat?', correctCardId: 'hat', distractorCardIds: ['shirt', 'socks'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find shoes.', correctCardId: 'shoes', distractorCardIds: ['pants', 'dress'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is shirt?', correctCardId: 'shirt', distractorCardIds: ['hat', 'shoes'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find boots.', correctCardId: 'boots', distractorCardIds: ['scarf', 'gloves'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_hat', targetText: 'I wear my hat.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_shoes', targetText: 'I see shoes.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_coat', targetText: 'This is a coat.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_boots', targetText: 'I like my boots.' },
      ],
    },
  },
};

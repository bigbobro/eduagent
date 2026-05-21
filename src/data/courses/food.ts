import type { Course } from '@/types/course';

export const foodCourse: Course = {
  id: 'food',
  title: '食物 Food',
  description: '学习常见食物的英文名称',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [
    { id: 'apple', english: 'apple', chinese: '苹果', imageUrl: '/images/food/apple.png', kind: 'word', drillParts: ['app', 'le'], difficulty: 1, tags: ['food'] },
    { id: 'banana', english: 'banana', chinese: '香蕉', imageUrl: '/images/food/banana.png', kind: 'word', drillParts: ['ba', 'na', 'na'], difficulty: 1, tags: ['food'] },
    { id: 'bread', english: 'bread', chinese: '面包', imageUrl: '/images/food/bread.png', kind: 'word', drillParts: ['bread'], difficulty: 1, tags: ['food'] },
    { id: 'milk', english: 'milk', chinese: '牛奶', imageUrl: '/images/food/milk.png', kind: 'word', drillParts: ['milk'], difficulty: 1, tags: ['food'] },
    { id: 'egg', english: 'egg', chinese: '鸡蛋', imageUrl: '/images/food/egg.png', kind: 'word', drillParts: ['egg'], difficulty: 1, tags: ['food'] },
    { id: 'rice', english: 'rice', chinese: '米饭', imageUrl: '/images/food/rice.png', kind: 'word', drillParts: ['rice'], difficulty: 2, tags: ['food'] },
    { id: 'water', english: 'water', chinese: '水', imageUrl: '/images/food/water.png', kind: 'word', drillParts: ['wa', 'ter'], difficulty: 1, tags: ['food'] },
    { id: 'juice', english: 'juice', chinese: '果汁', imageUrl: '/images/food/juice.png', kind: 'word', drillParts: ['juice'], difficulty: 1, tags: ['food'] },
    { id: 'cake', english: 'cake', chinese: '蛋糕', imageUrl: '/images/food/cake.png', kind: 'word', drillParts: ['cake'], difficulty: 1, tags: ['food'] },
    { id: 'cheese', english: 'cheese', chinese: '奶酪', imageUrl: '/images/food/cheese.png', kind: 'word', drillParts: ['cheese'], difficulty: 1, tags: ['food'] },
    { id: 'carrot', english: 'carrot', chinese: '胡萝卜', imageUrl: '/images/food/carrot.png', kind: 'word', drillParts: ['car', 'rot'], difficulty: 2, tags: ['food'] },
    { id: 'chicken', english: 'chicken', chinese: '鸡肉', imageUrl: '/images/food/chicken.png', kind: 'word', drillParts: ['chick', 'en'], difficulty: 2, tags: ['food'] },
    { id: 'sentence_apple', english: 'This is an apple.', chinese: '这是一个苹果。', imageUrl: '/images/food/apple.png', kind: 'sentence', drillParts: ['This is', 'an apple'], difficulty: 1, tags: ['food', 'sentence'] },
    { id: 'sentence_milk', english: 'I like milk.', chinese: '我喜欢牛奶。', imageUrl: '/images/food/milk.png', kind: 'sentence', drillParts: ['I like', 'milk'], difficulty: 1, tags: ['food', 'sentence'] },
    { id: 'sentence_water', english: 'I want water.', chinese: '我想要水。', imageUrl: '/images/food/water.png', kind: 'sentence', drillParts: ['I want', 'water'], difficulty: 1, tags: ['food', 'sentence'] },
    { id: 'sentence_rice', english: 'I eat rice.', chinese: '我吃米饭。', imageUrl: '/images/food/rice.png', kind: 'sentence', drillParts: ['I eat', 'rice'], difficulty: 1, tags: ['food', 'sentence'] },
  ],
  objectives: {
    sentences: ['This is an apple.', 'I like milk.', 'I want water.', 'I eat rice.'],
  },
  teachingHints: {
    opening: '今天我们看看餐桌上有什么食物!',
    reviewCardIds: [],
    newCardIds: ['apple', 'banana', 'bread', 'milk', 'egg', 'rice', 'water', 'juice', 'cake', 'cheese', 'carrot', 'chicken'],
    quizQuestions: ['Where is the apple?', 'Find the milk.', 'Which one is bread?', 'Find the water.'],
    closing: '今天我们认识了 apple, banana, bread, milk, egg, rice, water, juice, cake, cheese, carrot, chicken!',
  },
  phases: {
    introduction: {
      sceneCaption: '餐桌上摆着各种食物',
      narrationHint: '逐个指认餐桌上的食物,语气温和不催促,每张说完停 1-2 秒让孩子看图。不要问孩子能不能说出来。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the apple?', correctCardId: 'apple', distractorCardIds: ['milk', 'bread'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the milk.', correctCardId: 'milk', distractorCardIds: ['rice', 'egg'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is bread?', correctCardId: 'bread', distractorCardIds: ['banana', 'apple'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the water.', correctCardId: 'water', distractorCardIds: ['juice', 'cheese'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_apple', targetText: 'This is an apple.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_milk', targetText: 'I like milk.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_water', targetText: 'I want water.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_rice', targetText: 'I eat rice.' },
      ],
    },
  },
};

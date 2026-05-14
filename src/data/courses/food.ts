import { Course } from '@/types/course';

export const foodCourse: Course = {
  id: 'food',
  title: '食物 Food',
  description: '学习常见食物的英文名称',
  targetAge: [3, 6],
  theme: 'food',
  cards: [
    { id: 'apple', english: 'apple', chinese: '苹果', imageUrl: '/images/food/apple.png', kind: 'word', drillParts: ['app', 'le'], difficulty: 1, tags: ['food'] },
    { id: 'banana', english: 'banana', chinese: '香蕉', imageUrl: '/images/food/banana.png', kind: 'word', drillParts: ['ba', 'na', 'na'], difficulty: 1, tags: ['food'] },
    { id: 'bread', english: 'bread', chinese: '面包', imageUrl: '/images/food/bread.png', kind: 'word', drillParts: ['bread'], difficulty: 1, tags: ['food'] },
    { id: 'milk', english: 'milk', chinese: '牛奶', imageUrl: '/images/food/milk.png', kind: 'word', drillParts: ['milk'], difficulty: 1, tags: ['food'] },
    { id: 'egg', english: 'egg', chinese: '鸡蛋', imageUrl: '/images/food/egg.png', kind: 'word', drillParts: ['egg'], difficulty: 1, tags: ['food'] },
    { id: 'rice', english: 'rice', chinese: '米饭', imageUrl: '/images/food/rice.png', kind: 'word', drillParts: ['rice'], difficulty: 2, tags: ['food'] },
  ],
  objectives: {
    sentences: ['This is a ___.', 'I like ___.'],
  },
  teachingHints: {
    opening: '今天我们看看餐桌上有什么食物!',
    reviewCardIds: [],
    newCardIds: ['apple', 'banana', 'bread', 'milk', 'egg', 'rice'],
    quizQuestions: ['Where is the apple?', 'Find the milk.', '哪个是 bread?'],
    closing: '今天我们认识了 apple, banana, bread, milk, egg, rice!',
  },
  phases: {
    introduction: {
      sceneImage: '/images/food/scene.svg',
      sceneCaption: '餐桌上摆着各种食物',
      narrationHint: '逐个指认餐桌上的食物,语气温和不催促,每张说完停 1-2 秒让孩子看图。不要问孩子能不能说出来。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the apple?', correctCardId: 'apple', distractorCardIds: ['milk', 'bread'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the milk.', correctCardId: 'milk', distractorCardIds: ['rice', 'egg'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is bread?', correctCardId: 'bread', distractorCardIds: ['banana', 'apple'] },
        { id: 'q4', type: 'repeat-after-me', cardId: 'apple', targetText: 'This is an apple.' },
        { id: 'q5', type: 'repeat-after-me', cardId: 'milk', targetText: 'I like milk.' },
      ],
    },
  },
};

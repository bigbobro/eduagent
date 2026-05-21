import type { Course } from '@/types/course';

export const shapesCourse: Course = {
  id: 'shapes',
  title: '形状 Shapes',
  description: '学习常见形状的英文名称',
  targetAge: [3, 6],
  tone: 'lilac',
  cards: [
    { id: 'circle', english: 'circle', chinese: '圆形', imageUrl: '/images/shapes/circle.png', kind: 'word', drillParts: ['cir', 'cle'], difficulty: 1, tags: ['shapes'] },
    { id: 'square', english: 'square', chinese: '正方形', imageUrl: '/images/shapes/square.png', kind: 'word', drillParts: ['square'], difficulty: 1, tags: ['shapes'] },
    { id: 'triangle', english: 'triangle', chinese: '三角形', imageUrl: '/images/shapes/triangle.png', kind: 'word', drillParts: ['tri', 'an', 'gle'], difficulty: 2, tags: ['shapes'] },
    { id: 'star', english: 'star', chinese: '星形', imageUrl: '/images/shapes/star.png', kind: 'word', drillParts: ['star'], difficulty: 1, tags: ['shapes'] },
    { id: 'heart', english: 'heart', chinese: '心形', imageUrl: '/images/shapes/heart.png', kind: 'word', drillParts: ['heart'], difficulty: 1, tags: ['shapes'] },
    { id: 'rectangle', english: 'rectangle', chinese: '长方形', imageUrl: '/images/shapes/rectangle.png', kind: 'word', drillParts: ['rec', 'tan', 'gle'], difficulty: 2, tags: ['shapes'] },
    { id: 'oval', english: 'oval', chinese: '椭圆形', imageUrl: '/images/shapes/oval.png', kind: 'word', drillParts: ['o', 'val'], difficulty: 2, tags: ['shapes'] },
    { id: 'diamond', english: 'diamond', chinese: '菱形', imageUrl: '/images/shapes/diamond.png', kind: 'word', drillParts: ['di', 'a', 'mond'], difficulty: 2, tags: ['shapes'] },
    { id: 'line', english: 'line', chinese: '线', imageUrl: '/images/shapes/line.png', kind: 'word', drillParts: ['line'], difficulty: 1, tags: ['shapes'] },
    { id: 'arrow', english: 'arrow', chinese: '箭头', imageUrl: '/images/shapes/arrow.png', kind: 'word', drillParts: ['ar', 'row'], difficulty: 2, tags: ['shapes'] },
    { id: 'cube', english: 'cube', chinese: '立方体', imageUrl: '/images/shapes/cube.png', kind: 'word', drillParts: ['cube'], difficulty: 2, tags: ['shapes'] },
    { id: 'cone', english: 'cone', chinese: '圆锥体', imageUrl: '/images/shapes/cone.png', kind: 'word', drillParts: ['cone'], difficulty: 2, tags: ['shapes'] },
    { id: 'sentence_circle', english: 'It is a circle.', chinese: '它是一个圆形。', imageUrl: '/images/shapes/circle.png', kind: 'sentence', drillParts: ['It is', 'a circle'], difficulty: 1, tags: ['shapes', 'sentence'] },
    { id: 'sentence_star', english: 'I see a star.', chinese: '我看见一个星形。', imageUrl: '/images/shapes/star.png', kind: 'sentence', drillParts: ['I see', 'a star'], difficulty: 1, tags: ['shapes', 'sentence'] },
    { id: 'sentence_square', english: 'This is a square.', chinese: '这是一个正方形。', imageUrl: '/images/shapes/square.png', kind: 'sentence', drillParts: ['This is', 'a square'], difficulty: 1, tags: ['shapes', 'sentence'] },
    { id: 'sentence_heart', english: 'I like the heart.', chinese: '我喜欢这个心形。', imageUrl: '/images/shapes/heart.png', kind: 'sentence', drillParts: ['I like', 'the heart'], difficulty: 1, tags: ['shapes', 'sentence'] },
  ],
  objectives: {
    sentences: ['It is a circle.', 'I see a star.', 'This is a square.', 'I like the heart.'],
  },
  teachingHints: {
    opening: '今天我们打开形状魔法书,认识几种形状!',
    reviewCardIds: [],
    newCardIds: ['circle', 'square', 'triangle', 'star', 'heart', 'rectangle', 'oval', 'diamond', 'line', 'arrow', 'cube', 'cone'],
    quizQuestions: ['Where is circle?', 'Find star.', 'Which one is triangle?', 'Find square.'],
    closing: '今天我们认识了 circle, square, triangle, star, heart, rectangle, oval, diamond, line, arrow, cube, cone!',
  },
  phases: {
    introduction: {
      sceneCaption: '形状魔法书里浮出不同形状',
      narrationHint: '逐个指认形状,用 It is a ... 和 I see a ... 做短句示范。不要要求孩子一次记住全部。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is circle?', correctCardId: 'circle', distractorCardIds: ['square', 'heart'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find star.', correctCardId: 'star', distractorCardIds: ['triangle', 'rectangle'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is triangle?', correctCardId: 'triangle', distractorCardIds: ['circle', 'star'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find square.', correctCardId: 'square', distractorCardIds: ['oval', 'diamond'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_circle', targetText: 'It is a circle.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_star', targetText: 'I see a star.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_square', targetText: 'This is a square.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_heart', targetText: 'I like the heart.' },
      ],
    },
  },
};

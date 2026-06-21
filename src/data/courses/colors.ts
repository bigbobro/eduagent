import type { Course } from '@/types/course';

export const colorsCourse: Course = {
  id: 'colors',
  title: '颜色 Colors',
  description: '学习常见颜色的英文名称',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'red', english: 'red', chinese: '红色', imageUrl: '/images/colors/red.png', kind: 'word', drillParts: ['red'], difficulty: 1, tags: ['color'] },
    { id: 'blue', english: 'blue', chinese: '蓝色', imageUrl: '/images/colors/blue.png', kind: 'word', drillParts: ['blue'], difficulty: 1, tags: ['color'] },
    { id: 'yellow', english: 'yellow', chinese: '黄色', imageUrl: '/images/colors/yellow.png', kind: 'word', drillParts: ['yel', 'low'], difficulty: 1, tags: ['color'] },
    { id: 'green', english: 'green', chinese: '绿色', imageUrl: '/images/colors/green.png', kind: 'word', drillParts: ['green'], difficulty: 1, tags: ['color'] },
    { id: 'purple', english: 'purple', chinese: '紫色', imageUrl: '/images/colors/purple.png', kind: 'word', drillParts: ['pur', 'ple'], difficulty: 2, tags: ['color'] },
    { id: 'pink', english: 'pink', chinese: '粉色', imageUrl: '/images/colors/pink.png', kind: 'word', drillParts: ['pink'], difficulty: 1, tags: ['color'] },
    { id: 'orange', english: 'orange', chinese: '橙色', imageUrl: '/images/colors/orange.png', kind: 'word', drillParts: ['or', 'ange'], difficulty: 2, tags: ['color'] },
    { id: 'black', english: 'black', chinese: '黑色', imageUrl: '/images/colors/black.png', kind: 'word', drillParts: ['black'], difficulty: 1, tags: ['color'] },
    { id: 'white', english: 'white', chinese: '白色', imageUrl: '/images/colors/white.png', kind: 'word', drillParts: ['white'], difficulty: 1, tags: ['color'] },
    { id: 'brown', english: 'brown', chinese: '棕色', imageUrl: '/images/colors/brown.png', kind: 'word', drillParts: ['brown'], difficulty: 1, tags: ['color'] },
    { id: 'gray', english: 'gray', chinese: '灰色', imageUrl: '/images/colors/gray.png', kind: 'word', drillParts: ['gray'], asrAliases: ['grey'], difficulty: 1, tags: ['color'] },
    { id: 'gold', english: 'gold', chinese: '金色', imageUrl: '/images/colors/gold.png', kind: 'word', drillParts: ['gold'], difficulty: 1, tags: ['color'] },
    { id: 'sentence_red', english: 'It is red.', chinese: '它是红色的。', imageUrl: '/images/colors/red.png', kind: 'sentence', drillParts: ['It is', 'red'], difficulty: 1, tags: ['color', 'sentence'] },
    { id: 'sentence_blue', english: 'I see blue.', chinese: '我看见蓝色。', imageUrl: '/images/colors/blue.png', kind: 'sentence', drillParts: ['I see', 'blue'], difficulty: 1, tags: ['color', 'sentence'] },
    { id: 'sentence_pink', english: 'I like pink.', chinese: '我喜欢粉色。', imageUrl: '/images/colors/pink.png', kind: 'sentence', drillParts: ['I like', 'pink'], difficulty: 1, tags: ['color', 'sentence'] },
    { id: 'sentence_green', english: 'This is green.', chinese: '这是绿色的。', imageUrl: '/images/colors/green.png', kind: 'sentence', drillParts: ['This is', 'green'], difficulty: 1, tags: ['color', 'sentence'] },
  ],
  objectives: {
    sentences: ['It is red.', 'I see blue.', 'I like pink.', 'This is green.'],
  },
  teachingHints: {
    opening: '今天我们打开魔法调色盘,认识几种颜色!',
    reviewCardIds: [],
    newCardIds: ['red', 'blue', 'yellow', 'green', 'purple', 'pink', 'orange', 'black', 'white', 'brown', 'gray', 'gold'],
    quizQuestions: ['Where is red?', 'Find blue.', 'Which one is yellow?', 'Find green.'],
    closing: '今天我们认识了 red, blue, yellow, green, purple, pink, orange, black, white, brown, gray, gold!',
  },
  phases: {
    introduction: {
      sceneCaption: '魔法调色盘里亮起不同颜色',
      narrationHint: '逐个指认调色盘里的颜色,每个颜色都配一句很短的英文示范。不要要求孩子马上跟读。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is red?', correctCardId: 'red', distractorCardIds: ['blue', 'green'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find blue.', correctCardId: 'blue', distractorCardIds: ['yellow', 'pink'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is yellow?', correctCardId: 'yellow', distractorCardIds: ['purple', 'red'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find green.', correctCardId: 'green', distractorCardIds: ['orange', 'white'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_red', targetText: 'It is red.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_blue', targetText: 'I see blue.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_pink', targetText: 'I like pink.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_green', targetText: 'This is green.' },
      ],
    },
  },
};

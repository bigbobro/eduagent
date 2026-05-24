import type { Course } from '@/types/course';

export const hobbiesCourse: Course = {
  id: 'hobbies',
  title: '兴趣与爱好 Hobbies',
  description: '学习常见兴趣活动的英文名称',
  targetAge: [3, 6],
  tone: 'lilac',
  cards: [
    { id: 'drawing', english: 'drawing', chinese: '画画', imageUrl: '/images/hobbies/drawing.png', kind: 'word', drillParts: ["draw","ing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'reading', english: 'reading', chinese: '读书', imageUrl: '/images/hobbies/reading.png', kind: 'word', drillParts: ["read","ing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'singing', english: 'singing', chinese: '唱歌', imageUrl: '/images/hobbies/singing.png', kind: 'word', drillParts: ["sing","ing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'dancing', english: 'dancing', chinese: '跳舞', imageUrl: '/images/hobbies/dancing.png', kind: 'word', drillParts: ["dan","cing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'cooking', english: 'cooking', chinese: '烹饪', imageUrl: '/images/hobbies/cooking.png', kind: 'word', drillParts: ["cook","ing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'swimming', english: 'swimming', chinese: '游泳', imageUrl: '/images/hobbies/swimming.png', kind: 'word', drillParts: ["swim","ming"], difficulty: 1, tags: ['hobbies'] },
    { id: 'running', english: 'running', chinese: '跑步', imageUrl: '/images/hobbies/running.png', kind: 'word', drillParts: ["run","ning"], difficulty: 1, tags: ['hobbies'] },
    { id: 'writing', english: 'writing', chinese: '写字', imageUrl: '/images/hobbies/writing.png', kind: 'word', drillParts: ["writ","ing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'skating', english: 'skating', chinese: '滑冰', imageUrl: '/images/hobbies/skating.png', kind: 'word', drillParts: ["skat","ing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'painting', english: 'painting', chinese: '涂色', imageUrl: '/images/hobbies/painting.png', kind: 'word', drillParts: ["paint","ing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'biking', english: 'biking', chinese: '骑车', imageUrl: '/images/hobbies/biking.png', kind: 'word', drillParts: ["bik","ing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'playing', english: 'playing', chinese: '玩耍', imageUrl: '/images/hobbies/playing.png', kind: 'word', drillParts: ["play","ing"], difficulty: 1, tags: ['hobbies'] },
    { id: 'sentence_reading', english: 'I like reading books.', chinese: '我喜欢读书。', imageUrl: '/images/hobbies/reading.png', kind: 'sentence', drillParts: ["I like","reading books"], difficulty: 1, tags: ['hobbies', 'sentence'] },
    { id: 'sentence_singing', english: 'She is good at singing.', chinese: '她很擅长唱歌。', imageUrl: '/images/hobbies/singing.png', kind: 'sentence', drillParts: ["She is good","at singing"], difficulty: 1, tags: ['hobbies', 'sentence'] },
    { id: 'sentence_swimming', english: 'Swimming is fun.', chinese: '游泳很有趣。', imageUrl: '/images/hobbies/swimming.png', kind: 'sentence', drillParts: ["Swimming","is fun"], difficulty: 1, tags: ['hobbies', 'sentence'] },
    { id: 'sentence_drawing', english: 'He enjoys drawing cars.', chinese: '他喜欢画小汽车。', imageUrl: '/images/hobbies/drawing.png', kind: 'sentence', drillParts: ["He enjoys","drawing cars"], difficulty: 1, tags: ['hobbies', 'sentence'] }
  ],
  objectives: {
    sentences: ["I like reading books.","She is good at singing.","Swimming is fun.","He enjoys drawing cars."],
  },
  teachingHints: {
    opening: '今天我们翻开兴趣日记本,看看麻吉都有什么快乐的业余爱好吧!',
    reviewCardIds: [],
    newCardIds: ["drawing","reading","singing","dancing","cooking","swimming","running","writing","skating","painting","biking","playing"],
    quizQuestions: ["Where is the reading?","Where is the singing?","Where is the swimming?","Where is the drawing?"],
    closing: '今天我们认识了 drawing, reading, singing, dancing, cooking, swimming, running, writing, skating, painting, biking, playing!',
  },
  phases: {
    introduction: {
      sceneCaption: '麻吉小猫正在画布前用画笔认真涂色',
      narrationHint: '语气充满赞许和成就感,鼓励孩子说出自己的兴趣。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the reading?', correctCardId: 'reading', distractorCardIds: ["drawing","singing"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the singing?', correctCardId: 'singing', distractorCardIds: ["drawing","reading"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the swimming?', correctCardId: 'swimming', distractorCardIds: ["drawing","reading"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the drawing?', correctCardId: 'drawing', distractorCardIds: ["reading","singing"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_reading', targetText: 'I like reading books.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_singing', targetText: 'She is good at singing.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_swimming', targetText: 'Swimming is fun.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_drawing', targetText: 'He enjoys drawing cars.' }
      ],
    },
  },
};

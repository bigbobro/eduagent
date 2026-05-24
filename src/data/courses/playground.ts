import type { Course } from '@/types/course';

export const playgroundCourse: Course = {
  id: 'playground',
  title: '游乐场与公园 Playground',
  description: '学习公园与游乐场常见器械的英文名称',
  targetAge: [3, 6],
  tone: 'butter',
  cards: [
    { id: 'slide', english: 'slide', chinese: '滑梯', imageUrl: '/images/playground/slide.png', kind: 'word', drillParts: ["slide"], difficulty: 1, tags: ['playground'] },
    { id: 'swing', english: 'swing', chinese: '秋千', imageUrl: '/images/playground/swing.png', kind: 'word', drillParts: ["swing"], difficulty: 1, tags: ['playground'] },
    { id: 'seesaw', english: 'seesaw', chinese: '跷跷板', imageUrl: '/images/playground/seesaw.png', kind: 'word', drillParts: ["see","saw"], difficulty: 1, tags: ['playground'] },
    { id: 'park', english: 'park', chinese: '公园', imageUrl: '/images/playground/park.png', kind: 'word', drillParts: ["park"], difficulty: 1, tags: ['playground'] },
    { id: 'balloon', english: 'balloon', chinese: '气球', imageUrl: '/images/playground/balloon.png', kind: 'word', drillParts: ["bal","loon"], difficulty: 1, tags: ['playground'] },
    { id: 'sandbox', english: 'sandbox', chinese: '沙坑', imageUrl: '/images/playground/sandbox.png', kind: 'word', drillParts: ["sand","box"], difficulty: 1, tags: ['playground'] },
    { id: 'grass', english: 'grass', chinese: '草地', imageUrl: '/images/playground/grass.png', kind: 'word', drillParts: ["grass"], difficulty: 1, tags: ['playground'] },
    { id: 'bench', english: 'bench', chinese: '长椅', imageUrl: '/images/playground/bench.png', kind: 'word', drillParts: ["bench"], difficulty: 1, tags: ['playground'] },
    { id: 'pool', english: 'pool', chinese: '水池', imageUrl: '/images/playground/pool.png', kind: 'word', drillParts: ["pool"], difficulty: 1, tags: ['playground'] },
    { id: 'flower', english: 'flower', chinese: '花朵', imageUrl: '/images/playground/flower.png', kind: 'word', drillParts: ["flow","er"], difficulty: 1, tags: ['playground'] },
    { id: 'kite', english: 'kite', chinese: '风筝', imageUrl: '/images/playground/kite.png', kind: 'word', drillParts: ["kite"], difficulty: 1, tags: ['playground'] },
    { id: 'path', english: 'path', chinese: '小路', imageUrl: '/images/playground/path.png', kind: 'word', drillParts: ["path"], difficulty: 1, tags: ['playground'] },
    { id: 'sentence_park', english: 'Let us play in the park.', chinese: '我们去公园玩吧。', imageUrl: '/images/playground/park.png', kind: 'sentence', drillParts: ["Let us play","in the park"], difficulty: 1, tags: ['playground', 'sentence'] },
    { id: 'sentence_slide', english: 'I like the slide.', chinese: '我喜欢滑梯。', imageUrl: '/images/playground/slide.png', kind: 'sentence', drillParts: ["I like","the slide"], difficulty: 1, tags: ['playground', 'sentence'] },
    { id: 'sentence_swing', english: 'I sit on the swing.', chinese: '我坐在秋千上。', imageUrl: '/images/playground/swing.png', kind: 'sentence', drillParts: ["I sit on","the swing"], difficulty: 1, tags: ['playground', 'sentence'] },
    { id: 'sentence_kite', english: 'Fly the red kite.', chinese: '飞红色的风筝。', imageUrl: '/images/playground/kite.png', kind: 'sentence', drillParts: ["Fly the","red kite"], difficulty: 1, tags: ['playground', 'sentence'] }
  ],
  objectives: {
    sentences: ["Let us play in the park.","I like the slide.","I sit on the swing.","Fly the red kite."],
  },
  teachingHints: {
    opening: '今天我们系紧鞋带,去魔幻公园游乐场痛快玩耍吧!',
    reviewCardIds: [],
    newCardIds: ["slide","swing","seesaw","park","balloon","sandbox","grass","bench","pool","flower","kite","path"],
    quizQuestions: ["Where is the park?","Where is the slide?","Where is the swing?","Where is the kite?"],
    closing: '今天我们认识了 slide, swing, seesaw, park, balloon, sandbox, grass, bench, pool, flower, kite, path!',
  },
  phases: {
    introduction: {
      sceneCaption: '公园里树木葱郁,中央摆放着红黄相间的滑梯',
      narrationHint: '营造快乐、无拘无束的游玩感受,与幼儿的兴趣产生强烈共鸣。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the park?', correctCardId: 'park', distractorCardIds: ["slide","swing"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the slide?', correctCardId: 'slide', distractorCardIds: ["swing","seesaw"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the swing?', correctCardId: 'swing', distractorCardIds: ["slide","seesaw"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the kite?', correctCardId: 'kite', distractorCardIds: ["slide","swing"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_park', targetText: 'Let us play in the park.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_slide', targetText: 'I like the slide.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_swing', targetText: 'I sit on the swing.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_kite', targetText: 'Fly the red kite.' }
      ],
    },
  },
};

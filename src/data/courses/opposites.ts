import type { Course } from '@/types/course';

export const oppositesCourse: Course = {
  id: 'opposites',
  title: '奇妙的反义词 Opposites',
  description: '学习事物大小长短等对比词汇',
  targetAge: [3, 6],
  tone: 'lilac',
  cards: [
    { id: 'big', english: 'big', chinese: '大的', imageUrl: '/images/opposites/big.png', kind: 'word', drillParts: ["big"], difficulty: 1, tags: ['opposites'] },
    { id: 'small', english: 'small', chinese: '小的', imageUrl: '/images/opposites/small.png', kind: 'word', drillParts: ["small"], difficulty: 1, tags: ['opposites'] },
    { id: 'tall', english: 'tall', chinese: '高的', imageUrl: '/images/opposites/tall.png', kind: 'word', drillParts: ["tall"], difficulty: 1, tags: ['opposites'] },
    { id: 'short', english: 'short', chinese: '矮的/短的', imageUrl: '/images/opposites/short.png', kind: 'word', drillParts: ["short"], difficulty: 1, tags: ['opposites'] },
    { id: 'long', english: 'long', chinese: '长的', imageUrl: '/images/opposites/long.png', kind: 'word', drillParts: ["long"], difficulty: 1, tags: ['opposites'] },
    { id: 'fast', english: 'fast', chinese: '快的', imageUrl: '/images/opposites/fast.png', kind: 'word', drillParts: ["fast"], difficulty: 1, tags: ['opposites'] },
    { id: 'slow', english: 'slow', chinese: '慢的', imageUrl: '/images/opposites/slow.png', kind: 'word', drillParts: ["slow"], difficulty: 1, tags: ['opposites'] },
    { id: 'heavy', english: 'heavy', chinese: '重的', imageUrl: '/images/opposites/heavy.png', kind: 'word', drillParts: ["hea","vy"], difficulty: 1, tags: ['opposites'] },
    { id: 'light', english: 'light', chinese: '轻的', imageUrl: '/images/opposites/light.png', kind: 'word', drillParts: ["light"], difficulty: 1, tags: ['opposites'] },
    { id: 'clean', english: 'clean', chinese: '干净的', imageUrl: '/images/opposites/clean.png', kind: 'word', drillParts: ["clean"], difficulty: 1, tags: ['opposites'] },
    { id: 'dirty', english: 'dirty', chinese: '脏的', imageUrl: '/images/opposites/dirty.png', kind: 'word', drillParts: ["dir","ty"], difficulty: 1, tags: ['opposites'] },
    { id: 'happy', english: 'happy', chinese: '开心的', imageUrl: '/images/opposites/happy.png', kind: 'word', drillParts: ["hap","py"], difficulty: 1, tags: ['opposites'] },
    { id: 'sentence_big', english: 'This is a big house.', chinese: '这是一座大房子。', imageUrl: '/images/opposites/big.png', kind: 'sentence', drillParts: ["This is","a big house"], difficulty: 1, tags: ['opposites', 'sentence'] },
    { id: 'sentence_slow', english: 'The snail is slow.', chinese: '蜗牛很慢。', imageUrl: '/images/opposites/slow.png', kind: 'sentence', drillParts: ["The snail","is slow"], difficulty: 1, tags: ['opposites', 'sentence'] },
    { id: 'sentence_clean', english: 'My hands are clean.', chinese: '我的手很干净。', imageUrl: '/images/opposites/clean.png', kind: 'sentence', drillParts: ["My hands","are clean"], difficulty: 1, tags: ['opposites', 'sentence'] },
    { id: 'sentence_long', english: 'The pencil is long.', chinese: '铅笔很长。', imageUrl: '/images/opposites/long.png', kind: 'sentence', drillParts: ["The pencil","is long"], difficulty: 1, tags: ['opposites', 'sentence'] }
  ],
  objectives: {
    sentences: ["This is a big house.","The snail is slow.","My hands are clean.","The pencil is long."],
  },
  teachingHints: {
    opening: '今天我们照照对比魔法镜,学习奇妙的反义词吧!',
    reviewCardIds: [],
    newCardIds: ["big","small","tall","short","long","fast","slow","heavy","light","clean","dirty","happy"],
    quizQuestions: ["Where is the big?","Where is the slow?","Where is the clean?","Where is the long?"],
    closing: '今天我们认识了 big, small, tall, short, long, fast, slow, heavy, light, clean, dirty, happy!',
  },
  phases: {
    introduction: {
      sceneCaption: '一大一小两只可爱的动物面对面坐着',
      narrationHint: '在念大（big）和重（heavy）时可以用低沉发音,念小（small）和轻（light）时用清亮声音。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the big?', correctCardId: 'big', distractorCardIds: ["small","tall"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the slow?', correctCardId: 'slow', distractorCardIds: ["big","small"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the clean?', correctCardId: 'clean', distractorCardIds: ["big","small"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the long?', correctCardId: 'long', distractorCardIds: ["big","small"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_big', targetText: 'This is a big house.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_slow', targetText: 'The snail is slow.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_clean', targetText: 'My hands are clean.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_long', targetText: 'The pencil is long.' }
      ],
    },
  },
};

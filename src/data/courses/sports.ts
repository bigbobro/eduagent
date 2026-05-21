import type { Course } from '@/types/course';

export const sportsCourse: Course = {
  id: 'sports',
  title: '运动 Sports',
  description: '学习常见运动的英文名称',
  targetAge: [3, 6],
  tone: 'mint',
  cards: [
    { id: 'soccer', english: 'soccer', chinese: '足球', imageUrl: '/images/sports/soccer.png', kind: 'word', drillParts: ['soc', 'cer'], difficulty: 1, tags: ['sports'] },
    { id: 'basketball', english: 'basketball', chinese: '篮球', imageUrl: '/images/sports/basketball.png', kind: 'word', drillParts: ['bas', 'ket', 'ball'], difficulty: 2, tags: ['sports'] },
    { id: 'tennis', english: 'tennis', chinese: '网球', imageUrl: '/images/sports/tennis.png', kind: 'word', drillParts: ['ten', 'nis'], difficulty: 1, tags: ['sports'] },
    { id: 'swimming', english: 'swimming', chinese: '游泳', imageUrl: '/images/sports/swimming.png', kind: 'word', drillParts: ['swim', 'ming'], difficulty: 2, tags: ['sports'] },
    { id: 'running', english: 'running', chinese: '跑步', imageUrl: '/images/sports/running.png', kind: 'word', drillParts: ['run', 'ning'], difficulty: 1, tags: ['sports'] },
    { id: 'baseball', english: 'baseball', chinese: '棒球', imageUrl: '/images/sports/baseball.png', kind: 'word', drillParts: ['base', 'ball'], difficulty: 2, tags: ['sports'] },
    { id: 'jumping', english: 'jumping', chinese: '跳跃', imageUrl: '/images/sports/jumping.png', kind: 'word', drillParts: ['jump', 'ing'], difficulty: 1, tags: ['sports'] },
    { id: 'cycling', english: 'cycling', chinese: '骑车', imageUrl: '/images/sports/cycling.png', kind: 'word', drillParts: ['cy', 'cling'], difficulty: 2, tags: ['sports'] },
    { id: 'dancing', english: 'dancing', chinese: '跳舞', imageUrl: '/images/sports/dancing.png', kind: 'word', drillParts: ['dan', 'cing'], difficulty: 1, tags: ['sports'] },
    { id: 'skating', english: 'skating', chinese: '滑冰', imageUrl: '/images/sports/skating.png', kind: 'word', drillParts: ['skat', 'ing'], difficulty: 2, tags: ['sports'] },
    { id: 'volleyball', english: 'volleyball', chinese: '排球', imageUrl: '/images/sports/volleyball.png', kind: 'word', drillParts: ['vol', 'ley', 'ball'], difficulty: 2, tags: ['sports'] },
    { id: 'badminton', english: 'badminton', chinese: '羽毛球', imageUrl: '/images/sports/badminton.png', kind: 'word', drillParts: ['bad', 'min', 'ton'], difficulty: 2, tags: ['sports'] },
    { id: 'sentence_soccer', english: 'I can play soccer.', chinese: '我会踢足球。', imageUrl: '/images/sports/soccer.png', kind: 'sentence', drillParts: ['I can play', 'soccer'], difficulty: 1, tags: ['sports', 'sentence'] },
    { id: 'sentence_running', english: 'I like running.', chinese: '我喜欢跑步。', imageUrl: '/images/sports/running.png', kind: 'sentence', drillParts: ['I like', 'running'], difficulty: 1, tags: ['sports', 'sentence'] },
    { id: 'sentence_tennis', english: 'I play tennis.', chinese: '我打网球。', imageUrl: '/images/sports/tennis.png', kind: 'sentence', drillParts: ['I play', 'tennis'], difficulty: 1, tags: ['sports', 'sentence'] },
    { id: 'sentence_swimming', english: 'I like swimming.', chinese: '我喜欢游泳。', imageUrl: '/images/sports/swimming.png', kind: 'sentence', drillParts: ['I like', 'swimming'], difficulty: 1, tags: ['sports', 'sentence'] },
  ],
  objectives: {
    sentences: ['I can play soccer.', 'I like running.', 'I play tennis.', 'I like swimming.'],
  },
  teachingHints: {
    opening: '今天我们去魔法操场,认识几种运动!',
    reviewCardIds: [],
    newCardIds: ['soccer', 'basketball', 'tennis', 'swimming', 'running', 'baseball', 'jumping', 'cycling', 'dancing', 'skating', 'volleyball', 'badminton'],
    quizQuestions: ['Where is soccer?', 'Find swimming.', 'Which one is tennis?', 'Find running.'],
    closing: '今天我们认识了 soccer, basketball, tennis, swimming, running, baseball, jumping, cycling, dancing, skating, volleyball, badminton!',
  },
  phases: {
    introduction: {
      sceneCaption: '魔法操场上摆着不同运动的小道具',
      narrationHint: '逐个指认操场上的运动道具,先说单词,再自然带一句 I like 或 I can play。不要催促孩子马上作答。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is soccer?', correctCardId: 'soccer', distractorCardIds: ['tennis', 'running'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find swimming.', correctCardId: 'swimming', distractorCardIds: ['basketball', 'baseball'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is tennis?', correctCardId: 'tennis', distractorCardIds: ['soccer', 'swimming'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find running.', correctCardId: 'running', distractorCardIds: ['dancing', 'skating'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_soccer', targetText: 'I can play soccer.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_running', targetText: 'I like running.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_tennis', targetText: 'I play tennis.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_swimming', targetText: 'I like swimming.' },
      ],
    },
  },
};

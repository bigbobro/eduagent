import type { Course } from '@/types/course';

export const bodyCourse: Course = {
  id: 'body',
  title: '身体 Body',
  description: '学习常见身体部位的英文名称',
  targetAge: [3, 6],
  tone: 'butter',
  cards: [
    { id: 'head', english: 'head', chinese: '头', imageUrl: '/images/body/head.png', kind: 'word', drillParts: ['head'], difficulty: 1, tags: ['body'] },
    { id: 'hand', english: 'hand', chinese: '手', imageUrl: '/images/body/hand.png', kind: 'word', drillParts: ['hand'], difficulty: 1, tags: ['body'] },
    { id: 'foot', english: 'foot', chinese: '脚', imageUrl: '/images/body/foot.png', kind: 'word', drillParts: ['foot'], difficulty: 1, tags: ['body'] },
    { id: 'eye', english: 'eye', chinese: '眼睛', imageUrl: '/images/body/eye.png', kind: 'word', drillParts: ['eye'], difficulty: 1, tags: ['body'] },
    { id: 'ear', english: 'ear', chinese: '耳朵', imageUrl: '/images/body/ear.png', kind: 'word', drillParts: ['ear'], difficulty: 1, tags: ['body'] },
    { id: 'nose', english: 'nose', chinese: '鼻子', imageUrl: '/images/body/nose.png', kind: 'word', drillParts: ['nose'], difficulty: 1, tags: ['body'] },
    { id: 'mouth', english: 'mouth', chinese: '嘴巴', imageUrl: '/images/body/mouth.png', kind: 'word', drillParts: ['mouth'], difficulty: 1, tags: ['body'] },
    { id: 'arm', english: 'arm', chinese: '手臂', imageUrl: '/images/body/arm.png', kind: 'word', drillParts: ['arm'], difficulty: 1, tags: ['body'] },
    { id: 'leg', english: 'leg', chinese: '腿', imageUrl: '/images/body/leg.png', kind: 'word', drillParts: ['leg'], difficulty: 1, tags: ['body'] },
    { id: 'hair', english: 'hair', chinese: '头发', imageUrl: '/images/body/hair.png', kind: 'word', drillParts: ['hair'], difficulty: 1, tags: ['body'] },
    { id: 'face', english: 'face', chinese: '脸', imageUrl: '/images/body/face.png', kind: 'word', drillParts: ['face'], difficulty: 1, tags: ['body'] },
    { id: 'teeth', english: 'teeth', chinese: '牙齿', imageUrl: '/images/body/teeth.png', kind: 'word', drillParts: ['teeth'], difficulty: 1, tags: ['body'] },
    { id: 'sentence_head', english: 'This is my head.', chinese: '这是我的头。', imageUrl: '/images/body/head.png', kind: 'sentence', drillParts: ['This is', 'my head'], difficulty: 1, tags: ['body', 'sentence'] },
    { id: 'sentence_hand', english: 'Touch your hand.', chinese: '摸摸你的手。', imageUrl: '/images/body/hand.png', kind: 'sentence', drillParts: ['Touch your', 'hand'], difficulty: 1, tags: ['body', 'sentence'] },
    { id: 'sentence_nose', english: 'I see your nose.', chinese: '我看见你的鼻子。', imageUrl: '/images/body/nose.png', kind: 'sentence', drillParts: ['I see', 'your nose'], difficulty: 1, tags: ['body', 'sentence'] },
    { id: 'sentence_face', english: 'This is my face.', chinese: '这是我的脸。', imageUrl: '/images/body/face.png', kind: 'sentence', drillParts: ['This is', 'my face'], difficulty: 1, tags: ['body', 'sentence'] },
  ],
  objectives: {
    sentences: ['This is my head.', 'Touch your hand.', 'I see your nose.', 'This is my face.'],
  },
  teachingHints: {
    opening: '今天我们和麻吉一起认识身体部位!',
    reviewCardIds: [],
    newCardIds: ['head', 'hand', 'foot', 'eye', 'ear', 'nose', 'mouth', 'arm', 'leg', 'hair', 'face', 'teeth'],
    quizQuestions: ['Where is hand?', 'Find nose.', 'Which one is eye?', 'Find face.'],
    closing: '今天我们认识了 head, hand, foot, eye, ear, nose, mouth, arm, leg, hair, face, teeth!',
  },
  phases: {
    introduction: {
      sceneCaption: '麻吉旁边出现身体部位的小卡片',
      narrationHint: '逐个指认身体部位,用 This is my ... 和 Touch your ... 做示范。不要要求孩子做复杂动作。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is hand?', correctCardId: 'hand', distractorCardIds: ['foot', 'ear'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find nose.', correctCardId: 'nose', distractorCardIds: ['head', 'eye'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is eye?', correctCardId: 'eye', distractorCardIds: ['hand', 'nose'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find face.', correctCardId: 'face', distractorCardIds: ['hair', 'teeth'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_head', targetText: 'This is my head.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_hand', targetText: 'Touch your hand.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_nose', targetText: 'I see your nose.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_face', targetText: 'This is my face.' },
      ],
    },
  },
};

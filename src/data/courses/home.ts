import type { Course } from '@/types/course';

export const homeCourse: Course = {
  id: 'home',
  title: '温馨的家 Home',
  description: '学习家里常见房间和家具的英文名称',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [
    { id: 'home', english: 'home', chinese: '家', imageUrl: '/images/home/home.png', kind: 'word', drillParts: ['home'], difficulty: 1, tags: ['home'] },
    { id: 'room', english: 'room', chinese: '房间', imageUrl: '/images/home/room.png', kind: 'word', drillParts: ['room'], difficulty: 1, tags: ['home'] },
    { id: 'bed', english: 'bed', chinese: '床', imageUrl: '/images/home/bed.png', kind: 'word', drillParts: ['bed'], difficulty: 1, tags: ['home'] },
    { id: 'chair', english: 'chair', chinese: '椅子', imageUrl: '/images/home/chair.png', kind: 'word', drillParts: ['chair'], difficulty: 1, tags: ['home'] },
    { id: 'table', english: 'table', chinese: '桌子', imageUrl: '/images/home/table.png', kind: 'word', drillParts: ['ta', 'ble'], difficulty: 1, tags: ['home'] },
    { id: 'door', english: 'door', chinese: '门', imageUrl: '/images/home/door.png', kind: 'word', drillParts: ['door'], difficulty: 1, tags: ['home'] },
    { id: 'window', english: 'window', chinese: '窗户', imageUrl: '/images/home/window.png', kind: 'word', drillParts: ['win', 'dow'], difficulty: 1, tags: ['home'] },
    { id: 'sofa', english: 'sofa', chinese: '沙发', imageUrl: '/images/home/sofa.png', kind: 'word', drillParts: ['so', 'fa'], difficulty: 1, tags: ['home'] },
    { id: 'lamp', english: 'lamp', chinese: '台灯', imageUrl: '/images/home/lamp.png', kind: 'word', drillParts: ['lamp'], difficulty: 1, tags: ['home'] },
    { id: 'clock', english: 'clock', chinese: '钟表', imageUrl: '/images/home/clock.png', kind: 'word', drillParts: ['clock'], difficulty: 1, tags: ['home'] },
    { id: 'key', english: 'key', chinese: '钥匙', imageUrl: '/images/home/key.png', kind: 'word', drillParts: ['key'], difficulty: 1, tags: ['home'] },
    { id: 'toybox', english: 'toybox', chinese: '玩具箱', imageUrl: '/images/home/toybox.png', kind: 'word', drillParts: ['toy', 'box'], difficulty: 2, tags: ['home'] },
    { id: 'sentence_bed', english: 'This is my bed.', chinese: '这是我的床。', imageUrl: '/images/home/bed.png', kind: 'sentence', drillParts: ['This is', 'my bed'], difficulty: 1, tags: ['home', 'sentence'] },
    { id: 'sentence_door', english: 'Open the door.', chinese: '开门。', imageUrl: '/images/home/door.png', kind: 'sentence', drillParts: ['Open', 'the door'], difficulty: 1, tags: ['home', 'sentence'] },
    { id: 'sentence_chair', english: 'I sit on the chair.', chinese: '我坐在椅子上。', imageUrl: '/images/home/chair.png', kind: 'sentence', drillParts: ['I sit on', 'the chair'], difficulty: 1, tags: ['home', 'sentence'] },
    { id: 'sentence_key', english: 'Where is the key?', chinese: '钥匙在哪里？', imageUrl: '/images/home/key.png', kind: 'sentence', drillParts: ['Where is', 'the key'], difficulty: 1, tags: ['home', 'sentence'] },
  ],
  objectives: {
    sentences: ['This is my bed.', 'Open the door.', 'I sit on the chair.', 'Where is the key?'],
  },
  teachingHints: {
    opening: '今天我们来看看我们温馨的家,认识家里的房间和家具吧!',
    reviewCardIds: [],
    newCardIds: ['home', 'room', 'bed', 'chair', 'table', 'door', 'window', 'sofa', 'lamp', 'clock', 'key', 'toybox'],
    quizQuestions: ['Where is the bed?', 'Find the door.', 'Which one is the chair?', 'Find the key.'],
    closing: '今天我们认识了 home, room, bed, chair, table, door, window, sofa, lamp, clock, key, toybox!',
  },
  phases: {
    introduction: {
      sceneCaption: '温馨舒适的房间里摆放着各种家具',
      narrationHint: '逐个指认房间里的家具与物品,语气温和不催促,每张说完停 1-2 秒让孩子看图。不要问孩子能不能说出来。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the bed?', correctCardId: 'bed', distractorCardIds: ['chair', 'table'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the door.', correctCardId: 'door', distractorCardIds: ['window', 'sofa'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is the chair?', correctCardId: 'chair', distractorCardIds: ['lamp', 'clock'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the key.', correctCardId: 'key', distractorCardIds: ['toybox', 'home'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_bed', targetText: 'This is my bed.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_door', targetText: 'Open the door.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_chair', targetText: 'I sit on the chair.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_key', targetText: 'Where is the key?' },
      ],
    },
  },
};

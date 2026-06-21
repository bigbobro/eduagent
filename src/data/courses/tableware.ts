import type { Course } from '@/types/course';

export const tablewareCourse: Course = {
  id: 'tableware',
  title: '餐具厨具 Tableware',
  description: '学习餐桌和厨房里常见用品的英文名称',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [
    { id: 'plate', english: 'plate', chinese: '盘子', imageUrl: '/images/tableware/plate.png', kind: 'word', drillParts: ['plate'], difficulty: 1, tags: ['tableware'] },
    { id: 'bowl', english: 'bowl', chinese: '碗', imageUrl: '/images/tableware/bowl.png', kind: 'word', drillParts: ['bowl'], difficulty: 1, tags: ['tableware'] },
    { id: 'spoon', english: 'spoon', chinese: '勺子', imageUrl: '/images/tableware/spoon.png', kind: 'word', drillParts: ['spoon'], difficulty: 1, tags: ['tableware'] },
    { id: 'fork', english: 'fork', chinese: '叉子', imageUrl: '/images/tableware/fork.png', kind: 'word', drillParts: ['fork'], asrAliases: ['fool'], difficulty: 1, tags: ['tableware'] },
    { id: 'knife', english: 'knife', chinese: '餐刀', imageUrl: '/images/tableware/knife.png', kind: 'word', drillParts: ['knife'], difficulty: 1, tags: ['tableware'] },
    { id: 'chopsticks', english: 'chopsticks', chinese: '筷子', imageUrl: '/images/tableware/chopsticks.png', kind: 'word', drillParts: ['chop', 'sticks'], difficulty: 2, tags: ['tableware'] },
    { id: 'napkin', english: 'napkin', chinese: '餐巾', imageUrl: '/images/tableware/napkin.png', kind: 'word', drillParts: ['nap', 'kin'], difficulty: 1, tags: ['tableware'] },
    { id: 'tray', english: 'tray', chinese: '托盘', imageUrl: '/images/tableware/tray.png', kind: 'word', drillParts: ['tray'], difficulty: 1, tags: ['tableware'] },
    { id: 'kettle', english: 'kettle', chinese: '水壶', imageUrl: '/images/tableware/kettle.png', kind: 'word', drillParts: ['ket', 'tle'], difficulty: 1, tags: ['tableware'] },
    { id: 'pot', english: 'pot', chinese: '锅', imageUrl: '/images/tableware/pot.png', kind: 'word', drillParts: ['pot'], difficulty: 1, tags: ['tableware'] },
    { id: 'pan', english: 'pan', chinese: '平底锅', imageUrl: '/images/tableware/pan.png', kind: 'word', drillParts: ['pan'], difficulty: 1, tags: ['tableware'] },
    { id: 'oven', english: 'oven', chinese: '烤箱', imageUrl: '/images/tableware/oven.png', kind: 'word', drillParts: ['ov', 'en'], difficulty: 1, tags: ['tableware'] },
    { id: 'sentence_plate', english: 'I see a plate.', chinese: '我看见一个盘子。', imageUrl: '/images/tableware/plate.png', kind: 'sentence', drillParts: ['I see', 'a plate'], difficulty: 1, tags: ['tableware', 'sentence'] },
    { id: 'sentence_bowl', english: 'The bowl is big.', chinese: '这个碗很大。', imageUrl: '/images/tableware/bowl.png', kind: 'sentence', drillParts: ['The bowl', 'is big'], difficulty: 1, tags: ['tableware', 'sentence'] },
    { id: 'sentence_spoon', english: 'I use a spoon.', chinese: '我使用勺子。', imageUrl: '/images/tableware/spoon.png', kind: 'sentence', drillParts: ['I use', 'a spoon'], difficulty: 1, tags: ['tableware', 'sentence'] },
    { id: 'sentence_kettle', english: 'The kettle is hot.', chinese: '水壶是热的。', imageUrl: '/images/tableware/kettle.png', kind: 'sentence', drillParts: ['The kettle', 'is hot'], difficulty: 1, tags: ['tableware', 'sentence'] },
  ],
  objectives: {
    sentences: ['I see a plate.', 'The bowl is big.', 'I use a spoon.', 'The kettle is hot.'],
  },
  teachingHints: {
    opening: '今天我们来到餐桌旁,认识餐具和简单厨具。',
    reviewCardIds: [],
    newCardIds: ['plate', 'bowl', 'spoon', 'fork', 'knife', 'chopsticks', 'napkin', 'tray', 'kettle', 'pot', 'pan', 'oven'],
    quizQuestions: ['Where is the plate?', 'Find the bowl.', 'Where is the spoon?', 'Find the kettle.'],
    closing: '今天我们认识了 plate, bowl, spoon, fork, knife, chopsticks, napkin, tray, kettle, pot, pan, oven!',
  },
  phases: {
    introduction: {
      sceneCaption: '干净餐桌上摆着盘子、碗、勺子和温暖的小水壶',
      narrationHint: '用准备吃饭的生活场景介绍餐具,不要加入食物词汇。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the plate?', correctCardId: 'plate', distractorCardIds: ['bowl', 'fork'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the bowl.', correctCardId: 'bowl', distractorCardIds: ['plate', 'tray'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the spoon?', correctCardId: 'spoon', distractorCardIds: ['fork', 'knife'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the kettle.', correctCardId: 'kettle', distractorCardIds: ['pot', 'pan'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_plate', targetText: 'I see a plate.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_bowl', targetText: 'The bowl is big.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_spoon', targetText: 'I use a spoon.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_kettle', targetText: 'The kettle is hot.' },
      ],
    },
  },
};

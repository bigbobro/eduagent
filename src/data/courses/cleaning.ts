import type { Course } from '@/types/course';

export const cleaningCourse: Course = {
  id: 'cleaning',
  title: '清洁用品 Cleaning',
  description: '学习家里常见清洁用品的英文名称',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'broom', english: 'broom', chinese: '扫帚', imageUrl: '/images/cleaning/broom.png', kind: 'word', drillParts: ['broom'], difficulty: 1, tags: ['cleaning'] },
    { id: 'mop', english: 'mop', chinese: '拖把', imageUrl: '/images/cleaning/mop.png', kind: 'word', drillParts: ['mop'], difficulty: 1, tags: ['cleaning'] },
    { id: 'sponge', english: 'sponge', chinese: '海绵', imageUrl: '/images/cleaning/sponge.png', kind: 'word', drillParts: ['sponge'], difficulty: 1, tags: ['cleaning'] },
    { id: 'trash_can', english: 'trash can', chinese: '垃圾桶', imageUrl: '/images/cleaning/trash_can.png', kind: 'word', drillParts: ['trash', 'can'], difficulty: 1, tags: ['cleaning'] },
    { id: 'vacuum', english: 'vacuum', chinese: '吸尘器', imageUrl: '/images/cleaning/vacuum.png', kind: 'word', drillParts: ['vac', 'u', 'um'], difficulty: 2, tags: ['cleaning'] },
    { id: 'duster', english: 'duster', chinese: '除尘掸', imageUrl: '/images/cleaning/duster.png', kind: 'word', drillParts: ['dust', 'er'], difficulty: 1, tags: ['cleaning'] },
    { id: 'spray_bottle', english: 'spray bottle', chinese: '喷壶', imageUrl: '/images/cleaning/spray_bottle.png', kind: 'word', drillParts: ['spray', 'bottle'], difficulty: 2, tags: ['cleaning'] },
    { id: 'cleaning_cloth', english: 'cleaning cloth', chinese: '清洁布', imageUrl: '/images/cleaning/cleaning_cloth.png', kind: 'word', drillParts: ['clean', 'ing', 'cloth'], difficulty: 2, tags: ['cleaning'] },
    { id: 'dustpan', english: 'dustpan', chinese: '簸箕', imageUrl: '/images/cleaning/dustpan.png', kind: 'word', drillParts: ['dust', 'pan'], difficulty: 1, tags: ['cleaning'] },
    { id: 'detergent', english: 'detergent', chinese: '清洁剂', imageUrl: '/images/cleaning/detergent.png', kind: 'word', drillParts: ['de', 'ter', 'gent'], difficulty: 2, tags: ['cleaning'] },
    { id: 'wipes', english: 'wipes', chinese: '湿巾', imageUrl: '/images/cleaning/wipes.png', kind: 'word', drillParts: ['wipes'], difficulty: 1, tags: ['cleaning'] },
    { id: 'laundry_basket', english: 'laundry basket', chinese: '洗衣篮', imageUrl: '/images/cleaning/laundry_basket.png', kind: 'word', drillParts: ['laun', 'dry', 'basket'], difficulty: 2, tags: ['cleaning'] },
    { id: 'sentence_broom', english: 'I use a broom.', chinese: '我使用扫帚。', imageUrl: '/images/cleaning/broom.png', kind: 'sentence', drillParts: ['I use', 'a broom'], difficulty: 1, tags: ['cleaning', 'sentence'] },
    { id: 'sentence_sponge', english: 'The sponge is wet.', chinese: '海绵是湿的。', imageUrl: '/images/cleaning/sponge.png', kind: 'sentence', drillParts: ['The sponge', 'is wet'], difficulty: 1, tags: ['cleaning', 'sentence'] },
    { id: 'sentence_vacuum', english: 'The vacuum is loud.', chinese: '吸尘器声音很响。', imageUrl: '/images/cleaning/vacuum.png', kind: 'sentence', drillParts: ['The vacuum', 'is loud'], difficulty: 1, tags: ['cleaning', 'sentence'] },
    { id: 'sentence_mop', english: 'I see a mop.', chinese: '我看见一个拖把。', imageUrl: '/images/cleaning/mop.png', kind: 'sentence', drillParts: ['I see', 'a mop'], difficulty: 1, tags: ['cleaning', 'sentence'] },
  ],
  objectives: {
    sentences: ['I use a broom.', 'The sponge is wet.', 'The vacuum is loud.', 'I see a mop.'],
  },
  teachingHints: {
    opening: '今天我们把小房间打扫干净,认识清洁用品。',
    reviewCardIds: [],
    newCardIds: ['broom', 'mop', 'sponge', 'trash_can', 'vacuum', 'duster', 'spray_bottle', 'cleaning_cloth', 'dustpan', 'detergent', 'wipes', 'laundry_basket'],
    quizQuestions: ['Where is the broom?', 'Find the sponge.', 'Where is the vacuum?', 'Find the mop.'],
    closing: '今天我们认识了 broom, mop, sponge, trash can, vacuum, duster, spray bottle, cleaning cloth, dustpan, detergent, wipes, laundry basket!',
  },
  phases: {
    introduction: {
      sceneCaption: '阳光房间里整齐摆着扫帚、拖把、海绵和清洁篮',
      narrationHint: '用轻松整理房间的语气介绍,避开 bathroom 课程已有的洗漱用品。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the broom?', correctCardId: 'broom', distractorCardIds: ['mop', 'sponge'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the sponge.', correctCardId: 'sponge', distractorCardIds: ['wipes', 'duster'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the vacuum?', correctCardId: 'vacuum', distractorCardIds: ['trash_can', 'dustpan'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the mop.', correctCardId: 'mop', distractorCardIds: ['broom', 'cleaning_cloth'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_broom', targetText: 'I use a broom.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_sponge', targetText: 'The sponge is wet.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_vacuum', targetText: 'The vacuum is loud.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_mop', targetText: 'I see a mop.' },
      ],
    },
  },
};

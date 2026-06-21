import type { Course } from '@/types/course';

export const toolsCourse: Course = {
  id: 'tools',
  title: '小工具 Tools',
  description: '学习常见小工具和简单材料的英文名称',
  targetAge: [3, 6],
  tone: 'mint',
  cards: [
    { id: 'hammer', english: 'hammer', chinese: '锤子', imageUrl: '/images/tools/hammer.png', kind: 'word', drillParts: ['ham', 'mer'], difficulty: 1, tags: ['tools'] },
    { id: 'screwdriver', english: 'screwdriver', chinese: '螺丝刀', imageUrl: '/images/tools/screwdriver.png', kind: 'word', drillParts: ['screw', 'driv', 'er'], difficulty: 2, tags: ['tools'] },
    { id: 'wrench', english: 'wrench', chinese: '扳手', imageUrl: '/images/tools/wrench.png', kind: 'word', drillParts: ['wrench'], difficulty: 1, tags: ['tools'] },
    { id: 'saw', english: 'saw', chinese: '锯子', imageUrl: '/images/tools/saw.png', kind: 'word', drillParts: ['saw'], difficulty: 1, tags: ['tools'] },
    { id: 'tape', english: 'tape', chinese: '胶带', imageUrl: '/images/tools/tape.png', kind: 'word', drillParts: ['tape'], difficulty: 1, tags: ['tools'] },
    { id: 'glue', english: 'glue', chinese: '胶水', imageUrl: '/images/tools/glue.png', kind: 'word', drillParts: ['glue'], difficulty: 1, tags: ['tools'] },
    { id: 'scissors', english: 'scissors', chinese: '剪刀', imageUrl: '/images/tools/scissors.png', kind: 'word', drillParts: ['scis', 'sors'], difficulty: 2, tags: ['tools'] },
    { id: 'toolbox', english: 'toolbox', chinese: '工具箱', imageUrl: '/images/tools/toolbox.png', kind: 'word', drillParts: ['tool', 'box'], asrAliases: ['true box'], difficulty: 1, tags: ['tools'] },
    { id: 'nail', english: 'nail', chinese: '钉子', imageUrl: '/images/tools/nail.png', kind: 'word', drillParts: ['nail'], difficulty: 1, tags: ['tools'] },
    { id: 'screw', english: 'screw', chinese: '螺丝', imageUrl: '/images/tools/screw.png', kind: 'word', drillParts: ['screw'], difficulty: 1, tags: ['tools'] },
    { id: 'pliers', english: 'pliers', chinese: '钳子', imageUrl: '/images/tools/pliers.png', kind: 'word', drillParts: ['pli', 'ers'], difficulty: 2, tags: ['tools'] },
    { id: 'bolt', english: 'bolt', chinese: '螺栓', imageUrl: '/images/tools/bolt.png', kind: 'word', drillParts: ['bolt'], difficulty: 1, tags: ['tools'] },
    { id: 'sentence_hammer', english: 'I see a hammer.', chinese: '我看见一把锤子。', imageUrl: '/images/tools/hammer.png', kind: 'sentence', drillParts: ['I see', 'a hammer'], difficulty: 1, tags: ['tools', 'sentence'] },
    { id: 'sentence_tape', english: 'The tape is sticky.', chinese: '胶带是黏黏的。', imageUrl: '/images/tools/tape.png', kind: 'sentence', drillParts: ['The tape', 'is sticky'], difficulty: 1, tags: ['tools', 'sentence'] },
    { id: 'sentence_scissors', english: 'I use scissors.', chinese: '我使用剪刀。', imageUrl: '/images/tools/scissors.png', kind: 'sentence', drillParts: ['I use', 'scissors'], difficulty: 1, tags: ['tools', 'sentence'] },
    { id: 'sentence_bolt', english: 'The bolt is small.', chinese: '螺栓很小。', imageUrl: '/images/tools/bolt.png', kind: 'sentence', drillParts: ['The bolt', 'is small'], difficulty: 1, tags: ['tools', 'sentence'] },
  ],
  objectives: {
    sentences: ['I see a hammer.', 'The tape is sticky.', 'I use scissors.', 'The bolt is small.'],
  },
  teachingHints: {
    opening: '今天我们打开小工具箱,认识这些安全的小工具。',
    reviewCardIds: [],
    newCardIds: ['hammer', 'screwdriver', 'wrench', 'saw', 'tape', 'glue', 'scissors', 'toolbox', 'nail', 'screw', 'pliers', 'bolt'],
    quizQuestions: ['Where is the hammer?', 'Find the tape.', 'Where are the scissors?', 'Find the bolt.'],
    closing: '今天我们认识了 hammer, screwdriver, wrench, saw, tape, glue, scissors, toolbox, nail, screw, pliers, bolt!',
  },
  phases: {
    introduction: {
      sceneCaption: '小木桌上整齐摆着安全的小工具和工具箱',
      narrationHint: '用好奇但安全的语气介绍工具,强调只看图认读,不鼓励孩子自己操作真实工具。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the hammer?', correctCardId: 'hammer', distractorCardIds: ['wrench', 'tape'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the tape.', correctCardId: 'tape', distractorCardIds: ['glue', 'nail'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where are the scissors?', correctCardId: 'scissors', distractorCardIds: ['pliers', 'saw'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the bolt.', correctCardId: 'bolt', distractorCardIds: ['screw', 'nail'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_hammer', targetText: 'I see a hammer.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_tape', targetText: 'The tape is sticky.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_scissors', targetText: 'I use scissors.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_bolt', targetText: 'The bolt is small.' },
      ],
    },
  },
};

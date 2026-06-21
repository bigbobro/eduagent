import type { Course } from '@/types/course';

export const artSuppliesCourse: Course = {
  id: 'art-supplies',
  title: '美术用品 Art Supplies',
  description: '学习画画和手工常用材料的英文名称',
  targetAge: [3, 6],
  tone: 'lilac',
  cards: [
    { id: 'paintbrush', english: 'paintbrush', chinese: '画笔', imageUrl: '/images/art-supplies/paintbrush.png', kind: 'word', drillParts: ['paint', 'brush'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'palette', english: 'palette', chinese: '调色盘', imageUrl: '/images/art-supplies/palette.png', kind: 'word', drillParts: ['pal', 'ette'], difficulty: 2, tags: ['art-supplies'] },
    { id: 'easel', english: 'easel', chinese: '画架', imageUrl: '/images/art-supplies/easel.png', kind: 'word', drillParts: ['ea', 'sel'], difficulty: 2, tags: ['art-supplies'] },
    { id: 'canvas', english: 'canvas', chinese: '画布', imageUrl: '/images/art-supplies/canvas.png', kind: 'word', drillParts: ['can', 'vas'], asrAliases: ['candice'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'marker', english: 'marker', chinese: '马克笔', imageUrl: '/images/art-supplies/marker.png', kind: 'word', drillParts: ['mark', 'er'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'chalk', english: 'chalk', chinese: '粉笔', imageUrl: '/images/art-supplies/chalk.png', kind: 'word', drillParts: ['chalk'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'clay', english: 'clay', chinese: '黏土', imageUrl: '/images/art-supplies/clay.png', kind: 'word', drillParts: ['clay'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'sticker', english: 'sticker', chinese: '贴纸', imageUrl: '/images/art-supplies/sticker.png', kind: 'word', drillParts: ['stick', 'er'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'apron', english: 'apron', chinese: '围裙', imageUrl: '/images/art-supplies/apron.png', kind: 'word', drillParts: ['a', 'pron'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'glitter', english: 'glitter', chinese: '亮片粉', imageUrl: '/images/art-supplies/glitter.png', kind: 'word', drillParts: ['glit', 'ter'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'ink', english: 'ink', chinese: '墨水', imageUrl: '/images/art-supplies/ink.png', kind: 'word', drillParts: ['ink'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'stamp', english: 'stamp', chinese: '印章', imageUrl: '/images/art-supplies/stamp.png', kind: 'word', drillParts: ['stamp'], difficulty: 1, tags: ['art-supplies'] },
    { id: 'sentence_paintbrush', english: 'I use a paintbrush.', chinese: '我使用画笔。', imageUrl: '/images/art-supplies/paintbrush.png', kind: 'sentence', drillParts: ['I use', 'a paintbrush'], difficulty: 1, tags: ['art-supplies', 'sentence'] },
    { id: 'sentence_clay', english: 'The clay is soft.', chinese: '黏土很软。', imageUrl: '/images/art-supplies/clay.png', kind: 'sentence', drillParts: ['The clay', 'is soft'], difficulty: 1, tags: ['art-supplies', 'sentence'] },
    { id: 'sentence_sticker', english: 'I like this sticker.', chinese: '我喜欢这张贴纸。', imageUrl: '/images/art-supplies/sticker.png', kind: 'sentence', drillParts: ['I like', 'this sticker'], difficulty: 1, tags: ['art-supplies', 'sentence'] },
    { id: 'sentence_canvas', english: 'The canvas is white.', chinese: '画布是白色的。', imageUrl: '/images/art-supplies/canvas.png', kind: 'sentence', drillParts: ['The canvas', 'is white'], difficulty: 1, tags: ['art-supplies', 'sentence'] },
  ],
  objectives: {
    sentences: ['I use a paintbrush.', 'The clay is soft.', 'I like this sticker.', 'The canvas is white.'],
  },
  teachingHints: {
    opening: '今天我们来到小画室,看看画画和手工需要哪些材料。',
    reviewCardIds: [],
    newCardIds: ['paintbrush', 'palette', 'easel', 'canvas', 'marker', 'chalk', 'clay', 'sticker', 'apron', 'glitter', 'ink', 'stamp'],
    quizQuestions: ['Where is the paintbrush?', 'Find the clay.', 'Where is the sticker?', 'Find the canvas.'],
    closing: '今天我们认识了 paintbrush, palette, easel, canvas, marker, chalk, clay, sticker, apron, glitter, ink, stamp!',
  },
  phases: {
    introduction: {
      sceneCaption: '小画室里摆着画笔、画布、黏土和亮闪闪的贴纸',
      narrationHint: '用创作前准备材料的语气介绍,避开已经在 school 课程里学过的文具。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the paintbrush?', correctCardId: 'paintbrush', distractorCardIds: ['palette', 'canvas'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the clay.', correctCardId: 'clay', distractorCardIds: ['chalk', 'ink'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the sticker?', correctCardId: 'sticker', distractorCardIds: ['stamp', 'glitter'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the canvas.', correctCardId: 'canvas', distractorCardIds: ['easel', 'apron'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_paintbrush', targetText: 'I use a paintbrush.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_clay', targetText: 'The clay is soft.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_sticker', targetText: 'I like this sticker.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_canvas', targetText: 'The canvas is white.' },
      ],
    },
  },
};

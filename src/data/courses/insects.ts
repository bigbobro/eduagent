import type { Course } from '@/types/course';

export const insectsCourse: Course = {
  id: 'insects',
  title: '昆虫世界 Insects',
  description: '学习草地上常见小昆虫的英文名称',
  targetAge: [3, 6],
  tone: 'mint',
  cards: [
    { id: 'ant', english: 'ant', chinese: '蚂蚁', imageUrl: '/images/insects/ant.png', kind: 'word', drillParts: ["ant"], difficulty: 1, tags: ['insects'] },
    { id: 'bee', english: 'bee', chinese: '蜜蜂', imageUrl: '/images/insects/bee.png', kind: 'word', drillParts: ["bee"], difficulty: 1, tags: ['insects'] },
    { id: 'butterfly', english: 'butterfly', chinese: '蝴蝶', imageUrl: '/images/insects/butterfly.png', kind: 'word', drillParts: ["but","ter","fly"], difficulty: 1, tags: ['insects'] },
    { id: 'ladybug', english: 'ladybug', chinese: '瓢虫', imageUrl: '/images/insects/ladybug.png', kind: 'word', drillParts: ["la","dy","bug"], difficulty: 1, tags: ['insects'] },
    { id: 'snail', english: 'snail', chinese: '蜗牛', imageUrl: '/images/insects/snail.png', kind: 'word', drillParts: ["snail"], difficulty: 1, tags: ['insects'] },
    { id: 'spider', english: 'spider', chinese: '蜘蛛', imageUrl: '/images/insects/spider.png', kind: 'word', drillParts: ["spi","der"], difficulty: 1, tags: ['insects'] },
    { id: 'worm', english: 'worm', chinese: '小虫', imageUrl: '/images/insects/worm.png', kind: 'word', drillParts: ["worm"], difficulty: 1, tags: ['insects'] },
    { id: 'fly', english: 'fly', chinese: '苍蝇', imageUrl: '/images/insects/fly.png', kind: 'word', drillParts: ["fly"], difficulty: 1, tags: ['insects'] },
    { id: 'mosquito', english: 'mosquito', chinese: '蚊子', imageUrl: '/images/insects/mosquito.png', kind: 'word', drillParts: ["mos","qui","to"], difficulty: 1, tags: ['insects'] },
    { id: 'beetle', english: 'beetle', chinese: '甲壳虫', imageUrl: '/images/insects/beetle.png', kind: 'word', drillParts: ["bee","tle"], difficulty: 1, tags: ['insects'] },
    { id: 'dragonfly', english: 'dragonfly', chinese: '蜻蜓', imageUrl: '/images/insects/dragonfly.png', kind: 'word', drillParts: ["drag","on","fly"], difficulty: 1, tags: ['insects'] },
    { id: 'grasshopper', english: 'grasshopper', chinese: '蚂蚱', imageUrl: '/images/insects/grasshopper.png', kind: 'word', drillParts: ["grass","hop","per"], difficulty: 2, tags: ['insects'] },
    { id: 'sentence_bee', english: 'I see a bee.', chinese: '我看见一只蜜蜂。', imageUrl: '/images/insects/bee.png', kind: 'sentence', drillParts: ["I see","a bee"], difficulty: 1, tags: ['insects', 'sentence'] },
    { id: 'sentence_butterfly', english: 'The butterfly is pretty.', chinese: '蝴蝶真漂亮。', imageUrl: '/images/insects/butterfly.png', kind: 'sentence', drillParts: ["The butterfly","is pretty"], difficulty: 1, tags: ['insects', 'sentence'] },
    { id: 'sentence_snail', english: 'Look at the snail.', chinese: '看那只蜗牛。', imageUrl: '/images/insects/snail.png', kind: 'sentence', drillParts: ["Look at","the snail"], difficulty: 1, tags: ['insects', 'sentence'] },
    { id: 'sentence_ant', english: 'The ant is small.', chinese: '蚂蚁很小。', imageUrl: '/images/insects/ant.png', kind: 'sentence', drillParts: ["The ant","is small"], difficulty: 1, tags: ['insects', 'sentence'] }
  ],
  objectives: {
    sentences: ["I see a bee.","The butterfly is pretty.","Look at the snail.","The ant is small."],
  },
  teachingHints: {
    opening: '今天我们带上放大镜,去草丛里寻找可爱的小昆虫吧!',
    reviewCardIds: [],
    newCardIds: ["ant","bee","butterfly","ladybug","snail","spider","worm","fly","mosquito","beetle","dragonfly","grasshopper"],
    quizQuestions: ["Where is the bee?","Where is the butterfly?","Where is the snail?","Where is the ant?"],
    closing: '今天我们认识了 ant, bee, butterfly, ladybug, snail, spider, worm, fly, mosquito, beetle, dragonfly, grasshopper!',
  },
  phases: {
    introduction: {
      sceneCaption: '草丛里飞舞着小蜜蜂和色彩鲜艳的蝴蝶',
      narrationHint: '用温柔呵护的心态看待这些小生命,带孩子安全探索。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the bee?', correctCardId: 'bee', distractorCardIds: ["ant","butterfly"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the butterfly?', correctCardId: 'butterfly', distractorCardIds: ["ant","bee"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the snail?', correctCardId: 'snail', distractorCardIds: ["ant","bee"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the ant?', correctCardId: 'ant', distractorCardIds: ["bee","butterfly"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_bee', targetText: 'I see a bee.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_butterfly', targetText: 'The butterfly is pretty.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_snail', targetText: 'Look at the snail.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_ant', targetText: 'The ant is small.' }
      ],
    },
  },
};

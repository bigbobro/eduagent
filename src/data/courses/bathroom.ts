import type { Course } from '@/types/course';

export const bathroomCourse: Course = {
  id: 'bathroom',
  title: '卫生间与洗漱 Bathroom',
  description: '学习日常洗漱卫生的英文名称',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'soap', english: 'soap', chinese: '肥皂', imageUrl: '/images/bathroom/soap.png', kind: 'word', drillParts: ["soap"], difficulty: 1, tags: ['bathroom'] },
    { id: 'towel', english: 'towel', chinese: '毛巾', imageUrl: '/images/bathroom/towel.png', kind: 'word', drillParts: ["tow","el"], difficulty: 1, tags: ['bathroom'] },
    { id: 'mirror', english: 'mirror', chinese: '镜子', imageUrl: '/images/bathroom/mirror.png', kind: 'word', drillParts: ["mir","ror"], difficulty: 1, tags: ['bathroom'] },
    { id: 'brush', english: 'brush', chinese: '牙刷', imageUrl: '/images/bathroom/brush.png', kind: 'word', drillParts: ["brush"], difficulty: 1, tags: ['bathroom'] },
    { id: 'comb', english: 'comb', chinese: '梳子', imageUrl: '/images/bathroom/comb.png', kind: 'word', drillParts: ["comb"], difficulty: 1, tags: ['bathroom'] },
    { id: 'cup', english: 'cup', chinese: '杯子', imageUrl: '/images/bathroom/cup.png', kind: 'word', drillParts: ["cup"], difficulty: 1, tags: ['bathroom'] },
    { id: 'water', english: 'water', chinese: '水', imageUrl: '/images/bathroom/water.png', kind: 'word', drillParts: ["wa","ter"], difficulty: 1, tags: ['bathroom'] },
    { id: 'bath', english: 'bath', chinese: '洗澡', imageUrl: '/images/bathroom/bath.png', kind: 'word', drillParts: ["bath"], difficulty: 1, tags: ['bathroom'] },
    { id: 'shampoo', english: 'shampoo', chinese: '洗发露', imageUrl: '/images/bathroom/shampoo.png', kind: 'word', drillParts: ["sham","poo"], difficulty: 1, tags: ['bathroom'] },
    { id: 'paper', english: 'paper', chinese: '纸巾', imageUrl: '/images/bathroom/paper.png', kind: 'word', drillParts: ["pa","per"], difficulty: 1, tags: ['bathroom'] },
    { id: 'sink', english: 'sink', chinese: '洗手池', imageUrl: '/images/bathroom/sink.png', kind: 'word', drillParts: ["sink"], difficulty: 1, tags: ['bathroom'] },
    { id: 'tub', english: 'tub', chinese: '浴缸', imageUrl: '/images/bathroom/tub.png', kind: 'word', drillParts: ["tub"], difficulty: 1, tags: ['bathroom'] },
    { id: 'sentence_soap', english: 'Wash hands with soap.', chinese: '用肥皂洗手。', imageUrl: '/images/bathroom/soap.png', kind: 'sentence', drillParts: ["Wash hands","with soap"], difficulty: 1, tags: ['bathroom', 'sentence'] },
    { id: 'sentence_towel', english: 'I need a clean towel.', chinese: '我需要一条干净的毛巾。', imageUrl: '/images/bathroom/towel.png', kind: 'sentence', drillParts: ["I need","a clean towel"], difficulty: 1, tags: ['bathroom', 'sentence'] },
    { id: 'sentence_mirror', english: 'Look in the mirror.', chinese: '照镜子。', imageUrl: '/images/bathroom/mirror.png', kind: 'sentence', drillParts: ["Look in","the mirror"], difficulty: 1, tags: ['bathroom', 'sentence'] },
    { id: 'sentence_brush', english: 'Brush your teeth.', chinese: '刷你的牙齿。', imageUrl: '/images/bathroom/brush.png', kind: 'sentence', drillParts: ["Brush","your teeth"], difficulty: 1, tags: ['bathroom', 'sentence'] }
  ],
  objectives: {
    sentences: ["Wash hands with soap.","I need a clean towel.","Look in the mirror.","Brush your teeth."],
  },
  teachingHints: {
    opening: '今天我们拿起小牙刷,学习怎样把自己整理得干净又漂亮吧!',
    reviewCardIds: [],
    newCardIds: ["soap","towel","mirror","brush","comb","cup","water","bath","shampoo","paper","sink","tub"],
    quizQuestions: ["Where is the soap?","Where is the towel?","Where is the mirror?","Where is the brush?"],
    closing: '今天我们认识了 soap, towel, mirror, brush, comb, cup, water, bath, shampoo, paper, sink, tub!',
  },
  phases: {
    introduction: {
      sceneCaption: '干净温馨的卫生间里,脸盆架上搭着彩色的小毛巾',
      narrationHint: '传达讲卫生、爱干净的生活好习惯。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the soap?', correctCardId: 'soap', distractorCardIds: ["towel","mirror"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the towel?', correctCardId: 'towel', distractorCardIds: ["soap","mirror"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the mirror?', correctCardId: 'mirror', distractorCardIds: ["soap","towel"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the brush?', correctCardId: 'brush', distractorCardIds: ["soap","towel"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_soap', targetText: 'Wash hands with soap.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_towel', targetText: 'I need a clean towel.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_mirror', targetText: 'Look in the mirror.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_brush', targetText: 'Brush your teeth.' }
      ],
    },
  },
};

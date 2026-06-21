import type { Course } from '@/types/course';

export const spaceCourse: Course = {
  id: 'space',
  title: '探索太空 Space',
  description: '学习基础的太空天文英文名称',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'earth', english: 'earth', chinese: '地球', imageUrl: '/images/space/earth.png', kind: 'word', drillParts: ["earth"], difficulty: 1, tags: ['space'] },
    { id: 'moon', english: 'moon', chinese: '月亮', imageUrl: '/images/space/moon.png', kind: 'word', drillParts: ["moon"], difficulty: 1, tags: ['space'] },
    { id: 'sun', english: 'sun', chinese: '太阳', imageUrl: '/images/space/sun.png', kind: 'word', drillParts: ["sun"], difficulty: 1, tags: ['space'] },
    { id: 'star', english: 'star', chinese: '星星', imageUrl: '/images/space/star.png', kind: 'word', drillParts: ["star"], asrAliases: ["store"], difficulty: 1, tags: ['space'] },
    { id: 'space', english: 'space', chinese: '太空', imageUrl: '/images/space/space.png', kind: 'word', drillParts: ["space"], difficulty: 1, tags: ['space'] },
    { id: 'rocket', english: 'rocket', chinese: '火箭', imageUrl: '/images/space/rocket.png', kind: 'word', drillParts: ["rock","et"], difficulty: 1, tags: ['space'] },
    { id: 'planet', english: 'planet', chinese: '行星', imageUrl: '/images/space/planet.png', kind: 'word', drillParts: ["plan","et"], difficulty: 1, tags: ['space'] },
    { id: 'astronaut', english: 'astronaut', chinese: '宇航员', imageUrl: '/images/space/astronaut.png', kind: 'word', drillParts: ["as","tro","naut"], difficulty: 2, tags: ['space'] },
    { id: 'spaceship', english: 'spaceship', chinese: '太空飞船', imageUrl: '/images/space/spaceship.png', kind: 'word', drillParts: ["space","ship"], difficulty: 2, tags: ['space'] },
    { id: 'sky', english: 'sky', chinese: '天空', imageUrl: '/images/space/sky.png', kind: 'word', drillParts: ["sky"], difficulty: 1, tags: ['space'] },
    { id: 'alien', english: 'alien', chinese: '外星人', imageUrl: '/images/space/alien.png', kind: 'word', drillParts: ["al","ien"], difficulty: 1, tags: ['space'] },
    { id: 'UFO', english: 'UFO', chinese: '飞碟', imageUrl: '/images/space/UFO.png', kind: 'word', drillParts: ["U","F","O"], difficulty: 1, tags: ['space'] },
    { id: 'sentence_earth', english: 'We live on the earth.', chinese: '我们住在地球上。', imageUrl: '/images/space/earth.png', kind: 'sentence', drillParts: ["We live on","the earth"], difficulty: 1, tags: ['space', 'sentence'] },
    { id: 'sentence_rocket', english: 'Launch the rocket.', chinese: '发射火箭。', imageUrl: '/images/space/rocket.png', kind: 'sentence', drillParts: ["Launch","the rocket"], difficulty: 1, tags: ['space', 'sentence'] },
    { id: 'sentence_spaceship', english: 'I see a spaceship.', chinese: '我看见一艘太空飞船。', imageUrl: '/images/space/spaceship.png', kind: 'sentence', drillParts: ["I see a","spaceship"], difficulty: 1, tags: ['space', 'sentence'] },
    { id: 'sentence_astronaut', english: 'The astronaut is brave.', chinese: '这个宇航员真勇敢。', imageUrl: '/images/space/astronaut.png', kind: 'sentence', drillParts: ["The astronaut","is brave"], difficulty: 1, tags: ['space', 'sentence'] }
  ],
  objectives: {
    sentences: ["We live on the earth.","Launch the rocket.","I see a spaceship.","The astronaut is brave."],
  },
  teachingHints: {
    opening: '今天我们穿上厚厚的宇航服,去奇妙的太空漫步吧!',
    reviewCardIds: [],
    newCardIds: ["earth","moon","sun","star","space","rocket","planet","astronaut","spaceship","sky","alien","UFO"],
    quizQuestions: ["Where is the earth?","Where is the rocket?","Where is the spaceship?","Where is the astronaut?"],
    closing: '今天我们认识了 earth, moon, sun, star, space, rocket, planet, astronaut, spaceship, sky, alien, UFO!',
  },
  phases: {
    introduction: {
      sceneCaption: '深邃璀璨的太空中,蓝黄交织的星球静静旋转',
      narrationHint: '激发孩子探求宇宙奥秘和科学幻想的渴望。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the earth?', correctCardId: 'earth', distractorCardIds: ["moon","sun"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the rocket?', correctCardId: 'rocket', distractorCardIds: ["earth","moon"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the spaceship?', correctCardId: 'spaceship', distractorCardIds: ["earth","moon"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the astronaut?', correctCardId: 'astronaut', distractorCardIds: ["earth","moon"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_earth', targetText: 'We live on the earth.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_rocket', targetText: 'Launch the rocket.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_spaceship', targetText: 'I see a spaceship.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_astronaut', targetText: 'The astronaut is brave.' }
      ],
    },
  },
};

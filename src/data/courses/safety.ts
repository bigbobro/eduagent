import type { Course } from '@/types/course';

export const safetyCourse: Course = {
  id: 'safety',
  title: '安全 Safety',
  description: '学习常见安全用品和安全提示物的英文名称',
  targetAge: [3, 6],
  tone: 'butter',
  cards: [
    { id: 'bandage', english: 'bandage', chinese: '创可贴', imageUrl: '/images/safety/bandage.png', kind: 'word', drillParts: ['ban', 'dage'], difficulty: 1, tags: ['safety'] },
    { id: 'first_aid_kit', english: 'first aid kit', chinese: '急救包', imageUrl: '/images/safety/first_aid_kit.png', kind: 'word', drillParts: ['first', 'aid', 'kit'], difficulty: 2, tags: ['safety'] },
    { id: 'whistle', english: 'whistle', chinese: '哨子', imageUrl: '/images/safety/whistle.png', kind: 'word', drillParts: ['whis', 'tle'], difficulty: 2, tags: ['safety'] },
    { id: 'life_jacket', english: 'life jacket', chinese: '救生衣', imageUrl: '/images/safety/life_jacket.png', kind: 'word', drillParts: ['life', 'jacket'], difficulty: 2, tags: ['safety'] },
    { id: 'fire_extinguisher', english: 'fire extinguisher', chinese: '灭火器', imageUrl: '/images/safety/fire_extinguisher.png', kind: 'word', drillParts: ['fire', 'ex', 'tin', 'guish', 'er'], difficulty: 2, tags: ['safety'] },
    { id: 'alarm', english: 'alarm', chinese: '警报器', imageUrl: '/images/safety/alarm.png', kind: 'word', drillParts: ['a', 'larm'], difficulty: 1, tags: ['safety'] },
    { id: 'lock', english: 'lock', chinese: '锁', imageUrl: '/images/safety/lock.png', kind: 'word', drillParts: ['lock'], difficulty: 1, tags: ['safety'] },
    { id: 'gate', english: 'gate', chinese: '门栏', imageUrl: '/images/safety/gate.png', kind: 'word', drillParts: ['gate'], difficulty: 1, tags: ['safety'] },
    { id: 'stairs', english: 'stairs', chinese: '楼梯', imageUrl: '/images/safety/stairs.png', kind: 'word', drillParts: ['stairs'], difficulty: 1, tags: ['safety'] },
    { id: 'handrail', english: 'handrail', chinese: '扶手', imageUrl: '/images/safety/handrail.png', kind: 'word', drillParts: ['hand', 'rail'], difficulty: 1, tags: ['safety'] },
    { id: 'kneepads', english: 'kneepads', chinese: '护膝', imageUrl: '/images/safety/kneepads.png', kind: 'word', drillParts: ['knee', 'pads'], asrAliases: ['neepads'], difficulty: 1, tags: ['safety'] },
    { id: 'elbow_pads', english: 'elbow pads', chinese: '护肘', imageUrl: '/images/safety/elbow_pads.png', kind: 'word', drillParts: ['el', 'bow', 'pads'], difficulty: 2, tags: ['safety'] },
    { id: 'sentence_bandage', english: 'I need a bandage.', chinese: '我需要一个创可贴。', imageUrl: '/images/safety/bandage.png', kind: 'sentence', drillParts: ['I need', 'a bandage'], difficulty: 1, tags: ['safety', 'sentence'] },
    { id: 'sentence_alarm', english: 'The alarm is loud.', chinese: '警报器声音很响。', imageUrl: '/images/safety/alarm.png', kind: 'sentence', drillParts: ['The alarm', 'is loud'], difficulty: 1, tags: ['safety', 'sentence'] },
    { id: 'sentence_handrail', english: 'Hold the handrail.', chinese: '扶好扶手。', imageUrl: '/images/safety/handrail.png', kind: 'sentence', drillParts: ['Hold', 'the handrail'], difficulty: 1, tags: ['safety', 'sentence'] },
    { id: 'sentence_gate', english: 'The gate is closed.', chinese: '门栏关上了。', imageUrl: '/images/safety/gate.png', kind: 'sentence', drillParts: ['The gate', 'is closed'], difficulty: 1, tags: ['safety', 'sentence'] },
  ],
  objectives: {
    sentences: ['I need a bandage.', 'The alarm is loud.', 'Hold the handrail.', 'The gate is closed.'],
  },
  teachingHints: {
    opening: '今天我们学习保护自己的安全用品和安全提示。',
    reviewCardIds: [],
    newCardIds: ['bandage', 'first_aid_kit', 'whistle', 'life_jacket', 'fire_extinguisher', 'alarm', 'lock', 'gate', 'stairs', 'handrail', 'kneepads', 'elbow_pads'],
    quizQuestions: ['Where is the bandage?', 'Find the alarm.', 'Where is the handrail?', 'Find the gate.'],
    closing: '今天我们认识了 bandage, first aid kit, whistle, life jacket, fire extinguisher, alarm, lock, gate, stairs, handrail, kneepads, elbow pads!',
  },
  phases: {
    introduction: {
      sceneCaption: '安全小屋里摆着创可贴、急救包、扶手和警报器',
      narrationHint: '用温和可靠的语气介绍安全物品,避免制造恐惧感。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the bandage?', correctCardId: 'bandage', distractorCardIds: ['whistle', 'lock'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the alarm.', correctCardId: 'alarm', distractorCardIds: ['gate', 'stairs'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the handrail?', correctCardId: 'handrail', distractorCardIds: ['kneepads', 'life_jacket'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the gate.', correctCardId: 'gate', distractorCardIds: ['bandage', 'lock'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_bandage', targetText: 'I need a bandage.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_alarm', targetText: 'The alarm is loud.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_handrail', targetText: 'Hold the handrail.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_gate', targetText: 'The gate is closed.' },
      ],
    },
  },
};

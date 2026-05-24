import type { Course } from '@/types/course';

export const oceanCourse: Course = {
  id: 'ocean',
  title: '神秘海洋 Ocean Animals',
  description: '学习海洋生物的英文名称',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'shark', english: 'shark', chinese: '鲨鱼', imageUrl: '/images/ocean/shark.png', kind: 'word', drillParts: ["shark"], difficulty: 1, tags: ['ocean'] },
    { id: 'whale', english: 'whale', chinese: '鲸鱼', imageUrl: '/images/ocean/whale.png', kind: 'word', drillParts: ["whale"], difficulty: 1, tags: ['ocean'] },
    { id: 'dolphin', english: 'dolphin', chinese: '海豚', imageUrl: '/images/ocean/dolphin.png', kind: 'word', drillParts: ["dol","phin"], difficulty: 1, tags: ['ocean'] },
    { id: 'octopus', english: 'octopus', chinese: '章鱼', imageUrl: '/images/ocean/octopus.png', kind: 'word', drillParts: ["oc","to","pus"], difficulty: 1, tags: ['ocean'] },
    { id: 'turtle', english: 'turtle', chinese: '海龟', imageUrl: '/images/ocean/turtle.png', kind: 'word', drillParts: ["tur","tle"], difficulty: 1, tags: ['ocean'] },
    { id: 'crab', english: 'crab', chinese: '螃蟹', imageUrl: '/images/ocean/crab.png', kind: 'word', drillParts: ["crab"], difficulty: 1, tags: ['ocean'] },
    { id: 'jellyfish', english: 'jellyfish', chinese: '水母', imageUrl: '/images/ocean/jellyfish.png', kind: 'word', drillParts: ["jel","ly","fish"], difficulty: 2, tags: ['ocean'] },
    { id: 'starfish', english: 'starfish', chinese: '海星', imageUrl: '/images/ocean/starfish.png', kind: 'word', drillParts: ["star","fish"], difficulty: 1, tags: ['ocean'] },
    { id: 'seahorse', english: 'seahorse', chinese: '海马', imageUrl: '/images/ocean/seahorse.png', kind: 'word', drillParts: ["sea","horse"], difficulty: 1, tags: ['ocean'] },
    { id: 'lobster', english: 'lobster', chinese: '龙虾', imageUrl: '/images/ocean/lobster.png', kind: 'word', drillParts: ["lob","ster"], difficulty: 2, tags: ['ocean'] },
    { id: 'shell', english: 'shell', chinese: '贝壳', imageUrl: '/images/ocean/shell.png', kind: 'word', drillParts: ["shell"], difficulty: 1, tags: ['ocean'] },
    { id: 'squid', english: 'squid', chinese: '鱿鱼', imageUrl: '/images/ocean/squid.png', kind: 'word', drillParts: ["squid"], difficulty: 1, tags: ['ocean'] },
    { id: 'sentence_turtle', english: 'I see a turtle.', chinese: '我看见一只海龟。', imageUrl: '/images/ocean/turtle.png', kind: 'sentence', drillParts: ["I see","a turtle"], difficulty: 1, tags: ['ocean', 'sentence'] },
    { id: 'sentence_shark', english: 'The shark can swim.', chinese: '鲨鱼会游泳。', imageUrl: '/images/ocean/shark.png', kind: 'sentence', drillParts: ["The shark","can swim"], difficulty: 1, tags: ['ocean', 'sentence'] },
    { id: 'sentence_dolphin', english: 'Look at the dolphin.', chinese: '看那只海豚。', imageUrl: '/images/ocean/dolphin.png', kind: 'sentence', drillParts: ["Look at","the dolphin"], difficulty: 1, tags: ['ocean', 'sentence'] },
    { id: 'sentence_shell', english: 'Find the small shell.', chinese: '找到那个小贝壳。', imageUrl: '/images/ocean/shell.png', kind: 'sentence', drillParts: ["Find the","small shell"], difficulty: 1, tags: ['ocean', 'sentence'] }
  ],
  objectives: {
    sentences: ["I see a turtle.","The shark can swim.","Look at the dolphin.","Find the small shell."],
  },
  teachingHints: {
    opening: '今天我们穿上潜水服,去神秘的海底探险吧!',
    reviewCardIds: [],
    newCardIds: ["shark","whale","dolphin","octopus","turtle","crab","jellyfish","starfish","seahorse","lobster","shell","squid"],
    quizQuestions: ["Where is the turtle?","Where is the shark?","Where is the dolphin?","Where is the shell?"],
    closing: '今天我们认识了 shark, whale, dolphin, octopus, turtle, crab, jellyfish, starfish, seahorse, lobster, shell, squid!',
  },
  phases: {
    introduction: {
      sceneCaption: '湛蓝的海水中游过五颜六色的海洋小动物',
      narrationHint: '配合深海环境和奇妙生物的语气,满足孩子对未知海洋的好奇。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the turtle?', correctCardId: 'turtle', distractorCardIds: ["shark","whale"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the shark?', correctCardId: 'shark', distractorCardIds: ["whale","dolphin"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the dolphin?', correctCardId: 'dolphin', distractorCardIds: ["shark","whale"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the shell?', correctCardId: 'shell', distractorCardIds: ["shark","whale"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_turtle', targetText: 'I see a turtle.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_shark', targetText: 'The shark can swim.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_dolphin', targetText: 'Look at the dolphin.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_shell', targetText: 'Find the small shell.' }
      ],
    },
  },
};

import type { Course } from '@/types/course';

export const actionsCourse: Course = {
  id: 'actions',
  title: '日常动作 Actions',
  description: '学习基本的身体动作英文名称',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [
    { id: 'run', english: 'run', chinese: '跑', imageUrl: '/images/actions/run.png', kind: 'word', drillParts: ["run"], difficulty: 1, tags: ['actions'] },
    { id: 'jump', english: 'jump', chinese: '跳', imageUrl: '/images/actions/jump.png', kind: 'word', drillParts: ["jump"], difficulty: 1, tags: ['actions'] },
    { id: 'walk', english: 'walk', chinese: '走', imageUrl: '/images/actions/walk.png', kind: 'word', drillParts: ["walk"], difficulty: 1, tags: ['actions'] },
    { id: 'sleep', english: 'sleep', chinese: '睡觉', imageUrl: '/images/actions/sleep.png', kind: 'word', drillParts: ["sleep"], difficulty: 1, tags: ['actions'] },
    { id: 'eat', english: 'eat', chinese: '吃', imageUrl: '/images/actions/eat.png', kind: 'word', drillParts: ["eat"], difficulty: 1, tags: ['actions'] },
    { id: 'drink', english: 'drink', chinese: '喝', imageUrl: '/images/actions/drink.png', kind: 'word', drillParts: ["drink"], difficulty: 1, tags: ['actions'] },
    { id: 'sing', english: 'sing', chinese: '唱', imageUrl: '/images/actions/sing.png', kind: 'word', drillParts: ["sing"], difficulty: 1, tags: ['actions'] },
    { id: 'dance', english: 'dance', chinese: '跳舞', imageUrl: '/images/actions/dance.png', kind: 'word', drillParts: ["dance"], difficulty: 1, tags: ['actions'] },
    { id: 'read', english: 'read', chinese: '阅读', imageUrl: '/images/actions/read.png', kind: 'word', drillParts: ["read"], difficulty: 1, tags: ['actions'] },
    { id: 'draw', english: 'draw', chinese: '画画', imageUrl: '/images/actions/draw.png', kind: 'word', drillParts: ["draw"], difficulty: 1, tags: ['actions'] },
    { id: 'play', english: 'play', chinese: '玩耍', imageUrl: '/images/actions/play.png', kind: 'word', drillParts: ["play"], difficulty: 1, tags: ['actions'] },
    { id: 'smile', english: 'smile', chinese: '微笑', imageUrl: '/images/actions/smile.png', kind: 'word', drillParts: ["smile"], difficulty: 1, tags: ['actions'] },
    { id: 'sentence_run', english: 'I can run.', chinese: '我会跑。', imageUrl: '/images/actions/run.png', kind: 'sentence', drillParts: ["I can","run"], difficulty: 1, tags: ['actions', 'sentence'] },
    { id: 'sentence_sing', english: 'I like to sing.', chinese: '我喜欢唱歌。', imageUrl: '/images/actions/sing.png', kind: 'sentence', drillParts: ["I like","to sing"], difficulty: 1, tags: ['actions', 'sentence'] },
    { id: 'sentence_jump', english: 'Look, I can jump.', chinese: '看，我会跳。', imageUrl: '/images/actions/jump.png', kind: 'sentence', drillParts: ["Look","I can jump"], difficulty: 1, tags: ['actions', 'sentence'] },
    { id: 'sentence_sleep', english: 'I sleep in bed.', chinese: '我在床上睡觉。', imageUrl: '/images/actions/sleep.png', kind: 'sentence', drillParts: ["I sleep","in bed"], difficulty: 1, tags: ['actions', 'sentence'] }
  ],
  objectives: {
    sentences: ["I can run.","I like to sing.","Look, I can jump.","I sleep in bed."],
  },
  teachingHints: {
    opening: '今天我们跟着麻吉一起动起来吧!',
    reviewCardIds: [],
    newCardIds: ["run","jump","walk","sleep","eat","drink","sing","dance","read","draw","play","smile"],
    quizQuestions: ["Where is the run?","Where is the sing?","Where is the jump?","Where is the sleep?"],
    closing: '今天我们认识了 run, jump, walk, sleep, eat, drink, sing, dance, read, draw, play, smile!',
  },
  phases: {
    introduction: {
      sceneCaption: '麻吉小猫正在草地上快乐地玩耍运动',
      narrationHint: '配合活泼搞笑的语气,可以引导孩子在现实中也跟着做动作。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the run?', correctCardId: 'run', distractorCardIds: ["jump","walk"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the sing?', correctCardId: 'sing', distractorCardIds: ["run","jump"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the jump?', correctCardId: 'jump', distractorCardIds: ["run","walk"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the sleep?', correctCardId: 'sleep', distractorCardIds: ["run","jump"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_run', targetText: 'I can run.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_sing', targetText: 'I like to sing.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_jump', targetText: 'Look, I can jump.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_sleep', targetText: 'I sleep in bed.' }
      ],
    },
  },
};

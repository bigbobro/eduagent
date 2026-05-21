import type { Course } from '@/types/course';

export const toysCourse: Course = {
  id: 'toys',
  title: '玩具 Toys',
  description: '学习常见玩具的英文名称',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [
    { id: 'ball', english: 'ball', chinese: '球', imageUrl: '/images/toys/ball.png', kind: 'word', drillParts: ['ball'], difficulty: 1, tags: ['toys'] },
    { id: 'doll', english: 'doll', chinese: '娃娃', imageUrl: '/images/toys/doll.png', kind: 'word', drillParts: ['doll'], difficulty: 1, tags: ['toys'] },
    { id: 'kite', english: 'kite', chinese: '风筝', imageUrl: '/images/toys/kite.png', kind: 'word', drillParts: ['kite'], difficulty: 1, tags: ['toys'] },
    { id: 'blocks', english: 'blocks', chinese: '积木', imageUrl: '/images/toys/blocks.png', kind: 'word', drillParts: ['blocks'], difficulty: 1, tags: ['toys'] },
    { id: 'train', english: 'train', chinese: '小火车', imageUrl: '/images/toys/train.png', kind: 'word', drillParts: ['train'], difficulty: 1, tags: ['toys'] },
    { id: 'teddy', english: 'teddy', chinese: '泰迪熊', imageUrl: '/images/toys/teddy.png', kind: 'word', drillParts: ['ted', 'dy'], difficulty: 2, tags: ['toys'] },
    { id: 'car', english: 'car', chinese: '小汽车', imageUrl: '/images/toys/car.png', kind: 'word', drillParts: ['car'], difficulty: 1, tags: ['toys'] },
    { id: 'robot', english: 'robot', chinese: '机器人', imageUrl: '/images/toys/robot.png', kind: 'word', drillParts: ['ro', 'bot'], difficulty: 2, tags: ['toys'] },
    { id: 'puzzle', english: 'puzzle', chinese: '拼图', imageUrl: '/images/toys/puzzle.png', kind: 'word', drillParts: ['puz', 'zle'], difficulty: 2, tags: ['toys'] },
    { id: 'yoyo', english: 'yoyo', chinese: '悠悠球', imageUrl: '/images/toys/yoyo.png', kind: 'word', drillParts: ['yo', 'yo'], difficulty: 1, tags: ['toys'] },
    { id: 'drum', english: 'drum', chinese: '小鼓', imageUrl: '/images/toys/drum.png', kind: 'word', drillParts: ['drum'], difficulty: 1, tags: ['toys'] },
    { id: 'plane', english: 'plane', chinese: '玩具飞机', imageUrl: '/images/toys/plane.png', kind: 'word', drillParts: ['plane'], difficulty: 1, tags: ['toys'] },
    { id: 'sentence_ball', english: 'I have a ball.', chinese: '我有一个球。', imageUrl: '/images/toys/ball.png', kind: 'sentence', drillParts: ['I have', 'a ball'], difficulty: 1, tags: ['toys', 'sentence'] },
    { id: 'sentence_teddy', english: 'I like my teddy.', chinese: '我喜欢我的泰迪熊。', imageUrl: '/images/toys/teddy.png', kind: 'sentence', drillParts: ['I like', 'my teddy'], difficulty: 1, tags: ['toys', 'sentence'] },
    { id: 'sentence_car', english: 'This is a car.', chinese: '这是一辆小汽车。', imageUrl: '/images/toys/car.png', kind: 'sentence', drillParts: ['This is', 'a car'], difficulty: 1, tags: ['toys', 'sentence'] },
    { id: 'sentence_robot', english: 'I see a robot.', chinese: '我看见一个机器人。', imageUrl: '/images/toys/robot.png', kind: 'sentence', drillParts: ['I see', 'a robot'], difficulty: 1, tags: ['toys', 'sentence'] },
  ],
  objectives: {
    sentences: ['I have a ball.', 'I like my teddy.', 'This is a car.', 'I see a robot.'],
  },
  teachingHints: {
    opening: '今天我们打开玩具箱,看看里面有什么玩具!',
    reviewCardIds: [],
    newCardIds: ['ball', 'doll', 'kite', 'blocks', 'train', 'teddy', 'car', 'robot', 'puzzle', 'yoyo', 'drum', 'plane'],
    quizQuestions: ['Where is the ball?', 'Find the kite.', 'Which one is train?', 'Find the robot.'],
    closing: '今天我们认识了 ball, doll, kite, blocks, train, teddy, car, robot, puzzle, yoyo, drum, plane!',
  },
  phases: {
    introduction: {
      sceneCaption: '魔法玩具箱里摆着不同玩具',
      narrationHint: '逐个介绍玩具,先说单词,再带一句 I have a ... 或 I like my ...。不要要求孩子马上跟读。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the ball?', correctCardId: 'ball', distractorCardIds: ['kite', 'doll'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the kite.', correctCardId: 'kite', distractorCardIds: ['blocks', 'teddy'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is train?', correctCardId: 'train', distractorCardIds: ['ball', 'doll'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the robot.', correctCardId: 'robot', distractorCardIds: ['puzzle', 'plane'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_ball', targetText: 'I have a ball.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_teddy', targetText: 'I like my teddy.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_car', targetText: 'This is a car.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_robot', targetText: 'I see a robot.' },
      ],
    },
  },
};

import type { Course } from '@/types/course';

export const animalsCourse: Course = {
  id: 'animals',
  title: '动物 Animals',
  description: '学习常见小动物的英文名称',
  targetAge: [3, 6],
  tone: 'butter',
  cards: [
    { id: 'cat', english: 'cat', chinese: '猫', imageUrl: '/images/animals/cat.png', kind: 'word', drillParts: ['cat'], difficulty: 1, tags: ['animals'] },
    { id: 'dog', english: 'dog', chinese: '狗', imageUrl: '/images/animals/dog.png', kind: 'word', drillParts: ['dog'], difficulty: 1, tags: ['animals'] },
    { id: 'bird', english: 'bird', chinese: '小鸟', imageUrl: '/images/animals/bird.png', kind: 'word', drillParts: ['bird'], difficulty: 1, tags: ['animals'] },
    { id: 'fish', english: 'fish', chinese: '鱼', imageUrl: '/images/animals/fish.png', kind: 'word', drillParts: ['fish'], difficulty: 1, tags: ['animals'] },
    { id: 'rabbit', english: 'rabbit', chinese: '兔子', imageUrl: '/images/animals/rabbit.png', kind: 'word', drillParts: ['rab', 'bit'], difficulty: 2, tags: ['animals'] },
    { id: 'turtle', english: 'turtle', chinese: '乌龟', imageUrl: '/images/animals/turtle.png', kind: 'word', drillParts: ['tur', 'tle'], difficulty: 2, tags: ['animals'] },
    { id: 'lion', english: 'lion', chinese: '狮子', imageUrl: '/images/animals/lion.png', kind: 'word', drillParts: ['li', 'on'], difficulty: 2, tags: ['animals'] },
    { id: 'elephant', english: 'elephant', chinese: '大象', imageUrl: '/images/animals/elephant.png', kind: 'word', drillParts: ['el', 'e', 'phant'], difficulty: 2, tags: ['animals'] },
    { id: 'monkey', english: 'monkey', chinese: '猴子', imageUrl: '/images/animals/monkey.png', kind: 'word', drillParts: ['mon', 'key'], difficulty: 2, tags: ['animals'] },
    { id: 'panda', english: 'panda', chinese: '熊猫', imageUrl: '/images/animals/panda.png', kind: 'word', drillParts: ['pan', 'da'], difficulty: 2, tags: ['animals'] },
    { id: 'duck', english: 'duck', chinese: '鸭子', imageUrl: '/images/animals/duck.png', kind: 'word', drillParts: ['duck'], difficulty: 1, tags: ['animals'] },
    { id: 'frog', english: 'frog', chinese: '青蛙', imageUrl: '/images/animals/frog.png', kind: 'word', drillParts: ['frog'], difficulty: 1, tags: ['animals'] },
    { id: 'sentence_cat', english: 'This is a cat.', chinese: '这是一只猫。', imageUrl: '/images/animals/cat.png', kind: 'sentence', drillParts: ['This is', 'a cat'], difficulty: 1, tags: ['animals', 'sentence'] },
    { id: 'sentence_dog', english: 'I see a dog.', chinese: '我看见一只狗。', imageUrl: '/images/animals/dog.png', kind: 'sentence', drillParts: ['I see', 'a dog'], difficulty: 1, tags: ['animals', 'sentence'] },
    { id: 'sentence_fish', english: 'I like fish.', chinese: '我喜欢鱼。', imageUrl: '/images/animals/fish.png', kind: 'sentence', drillParts: ['I like', 'fish'], difficulty: 1, tags: ['animals', 'sentence'] },
    { id: 'sentence_panda', english: 'This is a panda.', chinese: '这是一只熊猫。', imageUrl: '/images/animals/panda.png', kind: 'sentence', drillParts: ['This is', 'a panda'], difficulty: 1, tags: ['animals', 'sentence'] },
  ],
  objectives: {
    sentences: ['This is a cat.', 'I see a dog.', 'I like fish.', 'This is a panda.'],
  },
  teachingHints: {
    opening: '今天我们去魔法小院,认识几只小动物!',
    reviewCardIds: [],
    newCardIds: ['cat', 'dog', 'bird', 'fish', 'rabbit', 'turtle', 'lion', 'elephant', 'monkey', 'panda', 'duck', 'frog'],
    quizQuestions: ['Where is the cat?', 'Find the dog.', 'Which one is fish?', 'Find the panda.'],
    closing: '今天我们认识了 cat, dog, bird, fish, rabbit, turtle, lion, elephant, monkey, panda, duck, frog!',
  },
  phases: {
    introduction: {
      sceneCaption: '魔法小院里来了几只小动物',
      narrationHint: '逐个指认小动物,用轻柔语气说 This is a ... 或 I see a ...。不要要求孩子马上回答。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the cat?', correctCardId: 'cat', distractorCardIds: ['dog', 'fish'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the dog.', correctCardId: 'dog', distractorCardIds: ['bird', 'rabbit'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is fish?', correctCardId: 'fish', distractorCardIds: ['cat', 'turtle'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the panda.', correctCardId: 'panda', distractorCardIds: ['monkey', 'duck'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_cat', targetText: 'This is a cat.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_dog', targetText: 'I see a dog.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_fish', targetText: 'I like fish.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_panda', targetText: 'This is a panda.' },
      ],
    },
  },
};

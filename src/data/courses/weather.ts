import type { Course } from '@/types/course';

export const weatherCourse: Course = {
  id: 'weather',
  title: '天气 Weather',
  description: '学习常见天气词的英文说法',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'sunny', english: 'sunny', chinese: '晴朗的', imageUrl: '/images/weather/sunny.png', kind: 'word', drillParts: ['sun', 'ny'], difficulty: 1, tags: ['weather'] },
    { id: 'rainy', english: 'rainy', chinese: '下雨的', imageUrl: '/images/weather/rainy.png', kind: 'word', drillParts: ['rain', 'y'], difficulty: 1, tags: ['weather'] },
    { id: 'windy', english: 'windy', chinese: '有风的', imageUrl: '/images/weather/windy.png', kind: 'word', drillParts: ['wind', 'y'], difficulty: 1, tags: ['weather'] },
    { id: 'cloudy', english: 'cloudy', chinese: '多云的', imageUrl: '/images/weather/cloudy.png', kind: 'word', drillParts: ['cloud', 'y'], difficulty: 1, tags: ['weather'] },
    { id: 'snowy', english: 'snowy', chinese: '下雪的', imageUrl: '/images/weather/snowy.png', kind: 'word', drillParts: ['snow', 'y'], difficulty: 1, tags: ['weather'] },
    { id: 'rainbow', english: 'rainbow', chinese: '彩虹', imageUrl: '/images/weather/rainbow.png', kind: 'word', drillParts: ['rain', 'bow'], difficulty: 2, tags: ['weather'] },
    { id: 'hot', english: 'hot', chinese: '热的', imageUrl: '/images/weather/hot.png', kind: 'word', drillParts: ['hot'], difficulty: 1, tags: ['weather'] },
    { id: 'cold', english: 'cold', chinese: '冷的', imageUrl: '/images/weather/cold.png', kind: 'word', drillParts: ['cold'], difficulty: 1, tags: ['weather'] },
    { id: 'warm', english: 'warm', chinese: '暖和的', imageUrl: '/images/weather/warm.png', kind: 'word', drillParts: ['warm'], difficulty: 1, tags: ['weather'] },
    { id: 'cool', english: 'cool', chinese: '凉爽的', imageUrl: '/images/weather/cool.png', kind: 'word', drillParts: ['cool'], difficulty: 1, tags: ['weather'] },
    { id: 'stormy', english: 'stormy', chinese: '暴风雨的', imageUrl: '/images/weather/stormy.png', kind: 'word', drillParts: ['storm', 'y'], difficulty: 2, tags: ['weather'] },
    { id: 'foggy', english: 'foggy', chinese: '有雾的', imageUrl: '/images/weather/foggy.png', kind: 'word', drillParts: ['fog', 'gy'], difficulty: 2, tags: ['weather'] },
    { id: 'sentence_sunny', english: 'It is sunny.', chinese: '天气晴朗。', imageUrl: '/images/weather/sunny.png', kind: 'sentence', drillParts: ['It is', 'sunny'], difficulty: 1, tags: ['weather', 'sentence'] },
    { id: 'sentence_rainy', english: 'It is rainy.', chinese: '下雨了。', imageUrl: '/images/weather/rainy.png', kind: 'sentence', drillParts: ['It is', 'rainy'], difficulty: 1, tags: ['weather', 'sentence'] },
    { id: 'sentence_rainbow', english: 'I see a rainbow.', chinese: '我看见彩虹。', imageUrl: '/images/weather/rainbow.png', kind: 'sentence', drillParts: ['I see', 'a rainbow'], difficulty: 1, tags: ['weather', 'sentence'] },
    { id: 'sentence_cold', english: 'It is cold.', chinese: '天气冷。', imageUrl: '/images/weather/cold.png', kind: 'sentence', drillParts: ['It is', 'cold'], difficulty: 1, tags: ['weather', 'sentence'] },
  ],
  objectives: {
    sentences: ['It is sunny.', 'It is rainy.', 'I see a rainbow.', 'It is cold.'],
  },
  teachingHints: {
    opening: '今天我们看看魔法窗外的天气!',
    reviewCardIds: [],
    newCardIds: ['sunny', 'rainy', 'windy', 'cloudy', 'snowy', 'rainbow', 'hot', 'cold', 'warm', 'cool', 'stormy', 'foggy'],
    quizQuestions: ['Where is sunny?', 'Find rainy.', 'Which one is rainbow?', 'Find cold.'],
    closing: '今天我们认识了 sunny, rainy, windy, cloudy, snowy, rainbow, hot, cold, warm, cool, stormy, foggy!',
  },
  phases: {
    introduction: {
      sceneCaption: '魔法窗外出现不同天气',
      narrationHint: '逐个介绍天气词,用 It is ... 和 I see a rainbow 做自然示范。不要让孩子马上回答天气问题。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is sunny?', correctCardId: 'sunny', distractorCardIds: ['rainy', 'cloudy'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find rainy.', correctCardId: 'rainy', distractorCardIds: ['snowy', 'windy'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is rainbow?', correctCardId: 'rainbow', distractorCardIds: ['sunny', 'cloudy'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find cold.', correctCardId: 'cold', distractorCardIds: ['hot', 'warm'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_sunny', targetText: 'It is sunny.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_rainy', targetText: 'It is rainy.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_rainbow', targetText: 'I see a rainbow.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_cold', targetText: 'It is cold.' },
      ],
    },
  },
};

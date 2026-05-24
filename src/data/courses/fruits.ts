import type { Course } from '@/types/course';

export const fruitsCourse: Course = {
  id: 'fruits',
  title: '水果乐园 Fruits',
  description: '学习常见水果的英文名称',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [
    { id: 'grape', english: 'grape', chinese: '葡萄', imageUrl: '/images/fruits/grape.png', kind: 'word', drillParts: ["grape"], difficulty: 1, tags: ['fruits'] },
    { id: 'orange', english: 'orange', chinese: '橙子', imageUrl: '/images/fruits/orange.png', kind: 'word', drillParts: ["or","ange"], difficulty: 1, tags: ['fruits'] },
    { id: 'pear', english: 'pear', chinese: '梨', imageUrl: '/images/fruits/pear.png', kind: 'word', drillParts: ["pear"], difficulty: 1, tags: ['fruits'] },
    { id: 'peach', english: 'peach', chinese: '桃子', imageUrl: '/images/fruits/peach.png', kind: 'word', drillParts: ["peach"], difficulty: 1, tags: ['fruits'] },
    { id: 'cherry', english: 'cherry', chinese: '樱桃', imageUrl: '/images/fruits/cherry.png', kind: 'word', drillParts: ["cher","ry"], difficulty: 1, tags: ['fruits'] },
    { id: 'melon', english: 'melon', chinese: '甜瓜', imageUrl: '/images/fruits/melon.png', kind: 'word', drillParts: ["mel","on"], difficulty: 1, tags: ['fruits'] },
    { id: 'lemon', english: 'lemon', chinese: '柠檬', imageUrl: '/images/fruits/lemon.png', kind: 'word', drillParts: ["lem","on"], difficulty: 1, tags: ['fruits'] },
    { id: 'mango', english: 'mango', chinese: '芒果', imageUrl: '/images/fruits/mango.png', kind: 'word', drillParts: ["man","go"], difficulty: 1, tags: ['fruits'] },
    { id: 'kiwi', english: 'kiwi', chinese: '猕猴桃', imageUrl: '/images/fruits/kiwi.png', kind: 'word', drillParts: ["ki","wi"], difficulty: 1, tags: ['fruits'] },
    { id: 'banana', english: 'banana', chinese: '香蕉', imageUrl: '/images/fruits/banana.png', kind: 'word', drillParts: ["ba","na","na"], difficulty: 1, tags: ['fruits'] },
    { id: 'strawberry', english: 'strawberry', chinese: '草莓', imageUrl: '/images/fruits/strawberry.png', kind: 'word', drillParts: ["straw","ber","ry"], difficulty: 2, tags: ['fruits'] },
    { id: 'pineapple', english: 'pineapple', chinese: '菠萝', imageUrl: '/images/fruits/pineapple.png', kind: 'word', drillParts: ["pine","ap","ple"], difficulty: 2, tags: ['fruits'] },
    { id: 'sentence_peach', english: 'I like sweet peach.', chinese: '我喜欢甜桃子。', imageUrl: '/images/fruits/peach.png', kind: 'sentence', drillParts: ["I like","sweet peach"], difficulty: 1, tags: ['fruits', 'sentence'] },
    { id: 'sentence_pear', english: 'This is a pear.', chinese: '这是一个梨。', imageUrl: '/images/fruits/pear.png', kind: 'sentence', drillParts: ["This is","a pear"], difficulty: 1, tags: ['fruits', 'sentence'] },
    { id: 'sentence_grape', english: 'I see the grape.', chinese: '我看见了葡萄。', imageUrl: '/images/fruits/grape.png', kind: 'sentence', drillParts: ["I see","the grape"], difficulty: 1, tags: ['fruits', 'sentence'] },
    { id: 'sentence_banana', english: 'Give me a banana.', chinese: '给我一根香蕉。', imageUrl: '/images/fruits/banana.png', kind: 'sentence', drillParts: ["Give me","a banana"], difficulty: 1, tags: ['fruits', 'sentence'] }
  ],
  objectives: {
    sentences: ["I like sweet peach.","This is a pear.","I see the grape.","Give me a banana."],
  },
  teachingHints: {
    opening: '今天我们推着购物车,去水果乐园认识甜甜的水果吧!',
    reviewCardIds: [],
    newCardIds: ["grape","orange","pear","peach","cherry","melon","lemon","mango","kiwi","banana","strawberry","pineapple"],
    quizQuestions: ["Where is the peach?","Where is the pear?","Where is the grape?","Where is the banana?"],
    closing: '今天我们认识了 grape, orange, pear, peach, cherry, melon, lemon, mango, kiwi, banana, strawberry, pineapple!',
  },
  phases: {
    introduction: {
      sceneCaption: '色彩斑斓的水果摊摆放着红彤彤、金黄黄的水果',
      narrationHint: '讲水果词汇时表现出美味向往的情绪,增加代入感。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the peach?', correctCardId: 'peach', distractorCardIds: ["grape","orange"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the pear?', correctCardId: 'pear', distractorCardIds: ["grape","orange"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the grape?', correctCardId: 'grape', distractorCardIds: ["orange","pear"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the banana?', correctCardId: 'banana', distractorCardIds: ["grape","orange"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_peach', targetText: 'I like sweet peach.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_pear', targetText: 'This is a pear.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_grape', targetText: 'I see the grape.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_banana', targetText: 'Give me a banana.' }
      ],
    },
  },
};

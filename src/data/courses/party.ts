import type { Course } from '@/types/course';

export const partyCourse: Course = {
  id: 'party',
  title: '快乐派对 Party',
  description: '学习节日和生日派对常见词汇',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [
    { id: 'cake', english: 'cake', chinese: '蛋糕', imageUrl: '/images/party/cake.png', kind: 'word', drillParts: ["cake"], difficulty: 1, tags: ['party'] },
    { id: 'candle', english: 'candle', chinese: '蜡烛', imageUrl: '/images/party/candle.png', kind: 'word', drillParts: ["can","dle"], difficulty: 1, tags: ['party'] },
    { id: 'balloon', english: 'balloon', chinese: '气球', imageUrl: '/images/party/balloon.png', kind: 'word', drillParts: ["bal","loon"], difficulty: 1, tags: ['party'] },
    { id: 'gift', english: 'gift', chinese: '礼物', imageUrl: '/images/party/gift.png', kind: 'word', drillParts: ["gift"], difficulty: 1, tags: ['party'] },
    { id: 'card', english: 'card', chinese: '贺卡', imageUrl: '/images/party/card.png', kind: 'word', drillParts: ["card"], difficulty: 1, tags: ['party'] },
    { id: 'hat', english: 'hat', chinese: '帽子', imageUrl: '/images/party/hat.png', kind: 'word', drillParts: ["hat"], difficulty: 1, tags: ['party'] },
    { id: 'mask', english: 'mask', chinese: '面具', imageUrl: '/images/party/mask.png', kind: 'word', drillParts: ["mask"], difficulty: 1, tags: ['party'] },
    { id: 'party', english: 'party', chinese: '派对', imageUrl: '/images/party/party.png', kind: 'word', drillParts: ["par","ty"], difficulty: 1, tags: ['party'] },
    { id: 'candy', english: 'candy', chinese: '糖果', imageUrl: '/images/party/candy.png', kind: 'word', drillParts: ["can","dy"], difficulty: 1, tags: ['party'] },
    { id: 'friend', english: 'friend', chinese: '朋友', imageUrl: '/images/party/friend.png', kind: 'word', drillParts: ["friend"], difficulty: 1, tags: ['party'] },
    { id: 'game', english: 'game', chinese: '游戏', imageUrl: '/images/party/game.png', kind: 'word', drillParts: ["game"], difficulty: 1, tags: ['party'] },
    { id: 'light', english: 'light', chinese: '灯光', imageUrl: '/images/party/light.png', kind: 'word', drillParts: ["light"], difficulty: 1, tags: ['party'] },
    { id: 'sentence_cake', english: 'This is a birthday cake.', chinese: '这是一个生日蛋糕。', imageUrl: '/images/party/cake.png', kind: 'sentence', drillParts: ["This is","a birthday cake"], difficulty: 1, tags: ['party', 'sentence'] },
    { id: 'sentence_gift', english: 'Open your gift.', chinese: '打开你的礼物。', imageUrl: '/images/party/gift.png', kind: 'sentence', drillParts: ["Open","your gift"], difficulty: 1, tags: ['party', 'sentence'] },
    { id: 'sentence_candle', english: 'Blow out the candle.', chinese: '吹灭蜡烛。', imageUrl: '/images/party/candle.png', kind: 'sentence', drillParts: ["Blow out","the candle"], difficulty: 1, tags: ['party', 'sentence'] },
    { id: 'sentence_party', english: 'Welcome to my party.', chinese: '欢迎来到我的派对。', imageUrl: '/images/party/party.png', kind: 'sentence', drillParts: ["Welcome","to my party"], difficulty: 1, tags: ['party', 'sentence'] }
  ],
  objectives: {
    sentences: ["This is a birthday cake.","Open your gift.","Blow out the candle.","Welcome to my party."],
  },
  teachingHints: {
    opening: '今天我们戴上彩虹小纸帽,去参加好玩的派对吧!',
    reviewCardIds: [],
    newCardIds: ["cake","candle","balloon","gift","card","hat","mask","party","candy","friend","game","light"],
    quizQuestions: ["Where is the cake?","Where is the gift?","Where is the candle?","Where is the party?"],
    closing: '今天我们认识了 cake, candle, balloon, gift, card, hat, mask, party, candy, friend, game, light!',
  },
  phases: {
    introduction: {
      sceneCaption: '房间里挂满了彩带、气球,中央是一只插着蜡烛的蛋糕',
      narrationHint: '表现出十分裂解兴奋的情绪状态。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the cake?', correctCardId: 'cake', distractorCardIds: ["candle","balloon"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the gift?', correctCardId: 'gift', distractorCardIds: ["cake","candle"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the candle?', correctCardId: 'candle', distractorCardIds: ["cake","balloon"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the party?', correctCardId: 'party', distractorCardIds: ["cake","candle"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_cake', targetText: 'This is a birthday cake.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_gift', targetText: 'Open your gift.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_candle', targetText: 'Blow out the candle.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_party', targetText: 'Welcome to my party.' }
      ],
    },
  },
};

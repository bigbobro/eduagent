import type { Course } from '@/types/course';

export const feelingsCourse: Course = {
  id: 'feelings',
  title: '我的情绪 Feelings',
  description: '学习表达内心情感的英文名称',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [
    { id: 'happy', english: 'happy', chinese: '开心的', imageUrl: '/images/feelings/happy.png', kind: 'word', drillParts: ["hap","py"], difficulty: 1, tags: ['feelings'] },
    { id: 'sad', english: 'sad', chinese: '难过的', imageUrl: '/images/feelings/sad.png', kind: 'word', drillParts: ["sad"], difficulty: 1, tags: ['feelings'] },
    { id: 'angry', english: 'angry', chinese: '生气的', imageUrl: '/images/feelings/angry.png', kind: 'word', drillParts: ["an","gry"], difficulty: 1, tags: ['feelings'] },
    { id: 'scared', english: 'scared', chinese: '害怕的', imageUrl: '/images/feelings/scared.png', kind: 'word', drillParts: ["scared"], difficulty: 1, tags: ['feelings'] },
    { id: 'tired', english: 'tired', chinese: '疲倦的', imageUrl: '/images/feelings/tired.png', kind: 'word', drillParts: ["tired"], difficulty: 1, tags: ['feelings'] },
    { id: 'excited', english: 'excited', chinese: '兴奋的', imageUrl: '/images/feelings/excited.png', kind: 'word', drillParts: ["ex","ci","ted"], difficulty: 1, tags: ['feelings'] },
    { id: 'hungry', english: 'hungry', chinese: '饿的', imageUrl: '/images/feelings/hungry.png', kind: 'word', drillParts: ["hun","gry"], difficulty: 1, tags: ['feelings'] },
    { id: 'thirsty', english: 'thirsty', chinese: '渴的', imageUrl: '/images/feelings/thirsty.png', kind: 'word', drillParts: ["thirs","ty"], difficulty: 1, tags: ['feelings'] },
    { id: 'hot', english: 'hot', chinese: '热的', imageUrl: '/images/feelings/hot.png', kind: 'word', drillParts: ["hot"], difficulty: 1, tags: ['feelings'] },
    { id: 'cold', english: 'cold', chinese: '冷的', imageUrl: '/images/feelings/cold.png', kind: 'word', drillParts: ["cold"], difficulty: 1, tags: ['feelings'] },
    { id: 'brave', english: 'brave', chinese: '勇敢的', imageUrl: '/images/feelings/brave.png', kind: 'word', drillParts: ["brave"], difficulty: 1, tags: ['feelings'] },
    { id: 'surprised', english: 'surprised', chinese: '惊讶的', imageUrl: '/images/feelings/surprised.png', kind: 'word', drillParts: ["sur","prised"], difficulty: 2, tags: ['feelings'] },
    { id: 'sentence_happy', english: 'I am very happy.', chinese: '我非常开心。', imageUrl: '/images/feelings/happy.png', kind: 'sentence', drillParts: ["I am","very happy"], difficulty: 1, tags: ['feelings', 'sentence'] },
    { id: 'sentence_sad', english: 'Do not be sad.', chinese: '不要难过。', imageUrl: '/images/feelings/sad.png', kind: 'sentence', drillParts: ["Do not","be sad"], difficulty: 1, tags: ['feelings', 'sentence'] },
    { id: 'sentence_hungry', english: 'I am hungry.', chinese: '我饿了。', imageUrl: '/images/feelings/hungry.png', kind: 'sentence', drillParts: ["I am","hungry"], difficulty: 1, tags: ['feelings', 'sentence'] },
    { id: 'sentence_brave', english: 'He is a brave boy.', chinese: '他是一个勇敢的男孩。', imageUrl: '/images/feelings/brave.png', kind: 'sentence', drillParts: ["He is","a brave boy"], difficulty: 1, tags: ['feelings', 'sentence'] }
  ],
  objectives: {
    sentences: ["I am very happy.","Do not be sad.","I am hungry.","He is a brave boy."],
  },
  teachingHints: {
    opening: '今天我们跟着表情魔法板,认识我们心中的小情绪吧!',
    reviewCardIds: [],
    newCardIds: ["happy","sad","angry","scared","tired","excited","hungry","thirsty","hot","cold","brave","surprised"],
    quizQuestions: ["Where is the happy?","Where is the sad?","Where is the hungry?","Where is the brave?"],
    closing: '今天我们认识了 happy, sad, angry, scared, tired, excited, hungry, thirsty, hot, cold, brave, surprised!',
  },
  phases: {
    introduction: {
      sceneCaption: '麻吉小猫做出各种各样滑稽好玩的表情',
      narrationHint: '读单词时把情感融入发音中（如高兴地笑、伤心地哭腔）。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the happy?', correctCardId: 'happy', distractorCardIds: ["sad","angry"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the sad?', correctCardId: 'sad', distractorCardIds: ["happy","angry"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the hungry?', correctCardId: 'hungry', distractorCardIds: ["happy","sad"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the brave?', correctCardId: 'brave', distractorCardIds: ["happy","sad"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_happy', targetText: 'I am very happy.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_sad', targetText: 'Do not be sad.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_hungry', targetText: 'I am hungry.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_brave', targetText: 'He is a brave boy.' }
      ],
    },
  },
};

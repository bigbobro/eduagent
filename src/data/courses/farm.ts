import type { Course } from '@/types/course';

export const farmCourse: Course = {
  id: 'farm',
  title: '欢乐农场 Farm Animals',
  description: '学习农场常见动物的英文名称',
  targetAge: [3, 6],
  tone: 'butter',
  cards: [
    { id: 'cow', english: 'cow', chinese: '奶牛', imageUrl: '/images/farm/cow.png', kind: 'word', drillParts: ["cow"], difficulty: 1, tags: ['farm'] },
    { id: 'horse', english: 'horse', chinese: '马', imageUrl: '/images/farm/horse.png', kind: 'word', drillParts: ["horse"], difficulty: 1, tags: ['farm'] },
    { id: 'sheep', english: 'sheep', chinese: '绵羊', imageUrl: '/images/farm/sheep.png', kind: 'word', drillParts: ["sheep"], difficulty: 1, tags: ['farm'] },
    { id: 'pig', english: 'pig', chinese: '猪', imageUrl: '/images/farm/pig.png', kind: 'word', drillParts: ["pig"], difficulty: 1, tags: ['farm'] },
    { id: 'chicken', english: 'chicken', chinese: '鸡', imageUrl: '/images/farm/chicken.png', kind: 'word', drillParts: ["chick","en"], difficulty: 1, tags: ['farm'] },
    { id: 'duck', english: 'duck', chinese: '鸭子', imageUrl: '/images/farm/duck.png', kind: 'word', drillParts: ["duck"], difficulty: 1, tags: ['farm'] },
    { id: 'goat', english: 'goat', chinese: '山羊', imageUrl: '/images/farm/goat.png', kind: 'word', drillParts: ["goat"], difficulty: 1, tags: ['farm'] },
    { id: 'goose', english: 'goose', chinese: '鹅', imageUrl: '/images/farm/goose.png', kind: 'word', drillParts: ["goose"], difficulty: 1, tags: ['farm'] },
    { id: 'donkey', english: 'donkey', chinese: '驴', imageUrl: '/images/farm/donkey.png', kind: 'word', drillParts: ["don","key"], difficulty: 1, tags: ['farm'] },
    { id: 'cat', english: 'cat', chinese: '猫', imageUrl: '/images/farm/cat.png', kind: 'word', drillParts: ["cat"], difficulty: 1, tags: ['farm'] },
    { id: 'dog', english: 'dog', chinese: '狗', imageUrl: '/images/farm/dog.png', kind: 'word', drillParts: ["dog"], difficulty: 1, tags: ['farm'] },
    { id: 'rabbit', english: 'rabbit', chinese: '兔子', imageUrl: '/images/farm/rabbit.png', kind: 'word', drillParts: ["rab","bit"], difficulty: 1, tags: ['farm'] },
    { id: 'sentence_sheep', english: 'This is a sheep.', chinese: '这是一只绵羊。', imageUrl: '/images/farm/sheep.png', kind: 'sentence', drillParts: ["This is","a sheep"], difficulty: 1, tags: ['farm', 'sentence'] },
    { id: 'sentence_horse', english: 'I like the horse.', chinese: '我喜欢这匹马。', imageUrl: '/images/farm/horse.png', kind: 'sentence', drillParts: ["I like","the horse"], difficulty: 1, tags: ['farm', 'sentence'] },
    { id: 'sentence_cow', english: 'The cow is big.', chinese: '那只奶牛很大。', imageUrl: '/images/farm/cow.png', kind: 'sentence', drillParts: ["The cow","is big"], difficulty: 1, tags: ['farm', 'sentence'] },
    { id: 'sentence_duck', english: 'Look at the duck.', chinese: '看那只鸭子。', imageUrl: '/images/farm/duck.png', kind: 'sentence', drillParts: ["Look at","the duck"], difficulty: 1, tags: ['farm', 'sentence'] }
  ],
  objectives: {
    sentences: ["This is a sheep.","I like the horse.","The cow is big.","Look at the duck."],
  },
  teachingHints: {
    opening: '今天我们跟着拖拉机,去欢乐的农场和动物打招呼吧!',
    reviewCardIds: [],
    newCardIds: ["cow","horse","sheep","pig","chicken","duck","goat","goose","donkey","cat","dog","rabbit"],
    quizQuestions: ["Where is the sheep?","Where is the horse?","Where is the cow?","Where is the duck?"],
    closing: '今天我们认识了 cow, horse, sheep, pig, chicken, duck, goat, goose, donkey, cat, dog, rabbit!',
  },
  phases: {
    introduction: {
      sceneCaption: '红瓦顶的农舍旁,围栏里住着各种温顺的动物',
      narrationHint: '可以伴随模仿动物的叫声（如哞哞、咩咩）,调动学习气氛。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the sheep?', correctCardId: 'sheep', distractorCardIds: ["cow","horse"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the horse?', correctCardId: 'horse', distractorCardIds: ["cow","sheep"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the cow?', correctCardId: 'cow', distractorCardIds: ["horse","sheep"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the duck?', correctCardId: 'duck', distractorCardIds: ["cow","horse"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_sheep', targetText: 'This is a sheep.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_horse', targetText: 'I like the horse.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_cow', targetText: 'The cow is big.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_duck', targetText: 'Look at the duck.' }
      ],
    },
  },
};

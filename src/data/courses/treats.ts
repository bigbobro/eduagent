import type { Course } from '@/types/course';

export const treatsCourse: Course = {
  id: 'treats',
  title: '甜点与零食 Sweet Treats',
  description: '学习各种美味甜点与零食的英文名称',
  targetAge: [3, 6],
  tone: 'peach',
  cards: [
    { id: 'cake', english: 'cake', chinese: '蛋糕', imageUrl: '/images/treats/cake.png', kind: 'word', drillParts: ["cake"], difficulty: 1, tags: ['treats'] },
    { id: 'cookie', english: 'cookie', chinese: '饼干', imageUrl: '/images/treats/cookie.png', kind: 'word', drillParts: ["cook","ie"], difficulty: 1, tags: ['treats'] },
    { id: 'chocolate', english: 'chocolate', chinese: '巧克力', imageUrl: '/images/treats/chocolate.png', kind: 'word', drillParts: ["choc","o","late"], difficulty: 1, tags: ['treats'] },
    { id: 'honey', english: 'honey', chinese: '蜂蜜', imageUrl: '/images/treats/honey.png', kind: 'word', drillParts: ["hon","ey"], difficulty: 1, tags: ['treats'] },
    { id: 'candy', english: 'candy', chinese: '糖果', imageUrl: '/images/treats/candy.png', kind: 'word', drillParts: ["can","dy"], difficulty: 1, tags: ['treats'] },
    { id: 'pudding', english: 'pudding', chinese: '布丁', imageUrl: '/images/treats/pudding.png', kind: 'word', drillParts: ["pud","ding"], difficulty: 1, tags: ['treats'] },
    { id: 'pie', english: 'pie', chinese: '派', imageUrl: '/images/treats/pie.png', kind: 'word', drillParts: ["pie"], asrAliases: ["派"], difficulty: 1, tags: ['treats'] },
    { id: 'jelly', english: 'jelly', chinese: '果冻', imageUrl: '/images/treats/jelly.png', kind: 'word', drillParts: ["jel","ly"], difficulty: 1, tags: ['treats'] },
    { id: 'donut', english: 'donut', chinese: '甜甜圈', imageUrl: '/images/treats/donut.png', kind: 'word', drillParts: ["do","nut"], difficulty: 1, tags: ['treats'] },
    { id: 'muffin', english: 'muffin', chinese: '麦芬', imageUrl: '/images/treats/muffin.png', kind: 'word', drillParts: ["muf","fin"], difficulty: 1, tags: ['treats'] },
    { id: 'icecream', english: 'ice cream', chinese: '冰淇淋', imageUrl: '/images/treats/icecream.png', kind: 'word', drillParts: ["ice","cream"], difficulty: 1, tags: ['treats'] },
    { id: 'lollipop', english: 'lollipop', chinese: '棒棒糖', imageUrl: '/images/treats/lollipop.png', kind: 'word', drillParts: ["lol","li","pop"], difficulty: 2, tags: ['treats'] },
    { id: 'sentence_chocolate', english: 'I like chocolate.', chinese: '我喜欢巧克力。', imageUrl: '/images/treats/chocolate.png', kind: 'sentence', drillParts: ["I like","chocolate"], difficulty: 1, tags: ['treats', 'sentence'] },
    { id: 'sentence_cookie', english: 'I eat a cookie.', chinese: '我吃一块饼干。', imageUrl: '/images/treats/cookie.png', kind: 'sentence', drillParts: ["I eat","a cookie"], difficulty: 1, tags: ['treats', 'sentence'] },
    { id: 'sentence_honey', english: 'This is sweet honey.', chinese: '这是甜蜂蜜。', imageUrl: '/images/treats/honey.png', kind: 'sentence', drillParts: ["This is","sweet honey"], difficulty: 1, tags: ['treats', 'sentence'] },
    { id: 'sentence_jelly', english: 'I like jelly.', chinese: '我喜欢果冻。', imageUrl: '/images/treats/jelly.png', kind: 'sentence', drillParts: ["I like","jelly"], difficulty: 1, tags: ['treats', 'sentence'] }
  ],
  objectives: {
    sentences: ["I like chocolate.","I eat a cookie.","This is sweet honey.","I like jelly."],
  },
  teachingHints: {
    opening: '今天我们去糖果小屋,尝尝美味的甜点和零食吧!',
    reviewCardIds: [],
    newCardIds: ["cake","cookie","chocolate","honey","candy","pudding","pie","jelly","donut","muffin","icecream","lollipop"],
    quizQuestions: ["Where is the chocolate?","Where is the cookie?","Where is the honey?","Where is the jelly?"],
    closing: '今天我们认识了 cake, cookie, chocolate, honey, candy, pudding, pie, jelly, donut, muffin, ice cream, lollipop!',
  },
  phases: {
    introduction: {
      sceneCaption: '彩色的糖果屋前挂满了五颜六色的棒棒糖和甜甜圈',
      narrationHint: '讲到美味食物时,用开心、甜蜜的语气带领孩子认读。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the chocolate?', correctCardId: 'chocolate', distractorCardIds: ["cake","cookie"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the cookie?', correctCardId: 'cookie', distractorCardIds: ["cake","chocolate"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the honey?', correctCardId: 'honey', distractorCardIds: ["cake","cookie"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the jelly?', correctCardId: 'jelly', distractorCardIds: ["cake","cookie"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_chocolate', targetText: 'I like chocolate.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_cookie', targetText: 'I eat a cookie.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_honey', targetText: 'This is sweet honey.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_jelly', targetText: 'I like jelly.' }
      ],
    },
  },
};

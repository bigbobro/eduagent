import type { Course } from '@/types/course';

export const schoolCourse: Course = {
  id: 'school',
  title: '我的学校 School',
  description: '学习校园与教室里的常见词汇',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'school', english: 'school', chinese: '学校', imageUrl: '/images/school/school.png', kind: 'word', drillParts: ["school"], difficulty: 1, tags: ['school'] },
    { id: 'classroom', english: 'classroom', chinese: '教室', imageUrl: '/images/school/classroom.png', kind: 'word', drillParts: ["class","room"], difficulty: 1, tags: ['school'] },
    { id: 'teacher', english: 'teacher', chinese: '老师', imageUrl: '/images/school/teacher.png', kind: 'word', drillParts: ["teach","er"], difficulty: 1, tags: ['school'] },
    { id: 'friend', english: 'friend', chinese: '朋友', imageUrl: '/images/school/friend.png', kind: 'word', drillParts: ["friend"], difficulty: 1, tags: ['school'] },
    { id: 'desk', english: 'desk', chinese: '书桌', imageUrl: '/images/school/desk.png', kind: 'word', drillParts: ["desk"], difficulty: 1, tags: ['school'] },
    { id: 'board', english: 'board', chinese: '黑板', imageUrl: '/images/school/board.png', kind: 'word', drillParts: ["board"], difficulty: 1, tags: ['school'] },
    { id: 'book', english: 'book', chinese: '书', imageUrl: '/images/school/book.png', kind: 'word', drillParts: ["book"], difficulty: 1, tags: ['school'] },
    { id: 'pencil', english: 'pencil', chinese: '铅笔', imageUrl: '/images/school/pencil.png', kind: 'word', drillParts: ["pen","cil"], difficulty: 1, tags: ['school'] },
    { id: 'bag', english: 'bag', chinese: '书包', imageUrl: '/images/school/bag.png', kind: 'word', drillParts: ["bag"], difficulty: 1, tags: ['school'] },
    { id: 'crayon', english: 'crayon', chinese: '蜡笔', imageUrl: '/images/school/crayon.png', kind: 'word', drillParts: ["cray","on"], difficulty: 1, tags: ['school'] },
    { id: 'ruler', english: 'ruler', chinese: '直尺', imageUrl: '/images/school/ruler.png', kind: 'word', drillParts: ["rul","er"], difficulty: 1, tags: ['school'] },
    { id: 'eraser', english: 'eraser', chinese: '橡皮', imageUrl: '/images/school/eraser.png', kind: 'word', drillParts: ["e","ra","ser"], difficulty: 2, tags: ['school'] },
    { id: 'sentence_school', english: 'I like my school.', chinese: '我喜欢我的学校。', imageUrl: '/images/school/school.png', kind: 'sentence', drillParts: ["I like","my school"], difficulty: 1, tags: ['school', 'sentence'] },
    { id: 'sentence_book', english: 'This is my book.', chinese: '这是我的书。', imageUrl: '/images/school/book.png', kind: 'sentence', drillParts: ["This is","my book"], difficulty: 1, tags: ['school', 'sentence'] },
    { id: 'sentence_pencil', english: 'I have a pencil.', chinese: '我有一支铅笔。', imageUrl: '/images/school/pencil.png', kind: 'sentence', drillParts: ["I have","a pencil"], difficulty: 1, tags: ['school', 'sentence'] },
    { id: 'sentence_friend', english: 'I see my friend.', chinese: '我看见我的朋友。', imageUrl: '/images/school/friend.png', kind: 'sentence', drillParts: ["I see","my friend"], difficulty: 1, tags: ['school', 'sentence'] }
  ],
  objectives: {
    sentences: ["I like my school.","This is my book.","I have a pencil.","I see my friend."],
  },
  teachingHints: {
    opening: '今天我们背上小书包,去魔法学校看看吧!',
    reviewCardIds: [],
    newCardIds: ["school","classroom","teacher","friend","desk","board","book","pencil","bag","crayon","ruler","eraser"],
    quizQuestions: ["Where is the school?","Where is the book?","Where is the pencil?","Where is the friend?"],
    closing: '今天我们认识了 school, classroom, teacher, friend, desk, board, book, pencil, bag, crayon, ruler, eraser!',
  },
  phases: {
    introduction: {
      sceneCaption: '阳光洒满明亮温馨的魔法教室',
      narrationHint: '以温暖鼓励的口吻带领孩子认识文具和校园角色。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the school?', correctCardId: 'school', distractorCardIds: ["classroom","teacher"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the book?', correctCardId: 'book', distractorCardIds: ["school","classroom"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the pencil?', correctCardId: 'pencil', distractorCardIds: ["school","classroom"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the friend?', correctCardId: 'friend', distractorCardIds: ["school","classroom"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_school', targetText: 'I like my school.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_book', targetText: 'This is my book.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_pencil', targetText: 'I have a pencil.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_friend', targetText: 'I see my friend.' }
      ],
    },
  },
};

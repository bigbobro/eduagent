import type { Course } from '@/types/course';

export const familyCourse: Course = {
  id: 'family',
  title: '家人 Family',
  description: '学习家庭成员的英文称呼',
  targetAge: [3, 6],
  tone: 'lilac',
  cards: [
    { id: 'mom', english: 'mom', chinese: '妈妈', imageUrl: '/images/family/mom.png', kind: 'word', drillParts: ['mom'], difficulty: 1, tags: ['family'] },
    { id: 'dad', english: 'dad', chinese: '爸爸', imageUrl: '/images/family/dad.png', kind: 'word', drillParts: ['dad'], difficulty: 1, tags: ['family'] },
    { id: 'grandma', english: 'grandma', chinese: '奶奶', imageUrl: '/images/family/grandma.png', kind: 'word', drillParts: ['grand', 'ma'], difficulty: 2, tags: ['family'] },
    { id: 'grandpa', english: 'grandpa', chinese: '爷爷', imageUrl: '/images/family/grandpa.png', kind: 'word', drillParts: ['grand', 'pa'], difficulty: 2, tags: ['family'] },
    { id: 'sister', english: 'sister', chinese: '姐妹', imageUrl: '/images/family/sister.png', kind: 'word', drillParts: ['sis', 'ter'], difficulty: 2, tags: ['family'] },
    { id: 'brother', english: 'brother', chinese: '兄弟', imageUrl: '/images/family/brother.png', kind: 'word', drillParts: ['bro', 'ther'], difficulty: 2, tags: ['family'] },
    { id: 'baby', english: 'baby', chinese: '宝宝', imageUrl: '/images/family/baby.png', kind: 'word', drillParts: ['ba', 'by'], difficulty: 1, tags: ['family'] },
    { id: 'aunt', english: 'aunt', chinese: '阿姨', imageUrl: '/images/family/aunt.png', kind: 'word', drillParts: ['aunt'], asrAliases: ['ant'], difficulty: 2, tags: ['family'] },
    { id: 'uncle', english: 'uncle', chinese: '叔叔', imageUrl: '/images/family/uncle.png', kind: 'word', drillParts: ['un', 'cle'], difficulty: 2, tags: ['family'] },
    { id: 'cousin', english: 'cousin', chinese: '表亲', imageUrl: '/images/family/cousin.png', kind: 'word', drillParts: ['cou', 'sin'], difficulty: 2, tags: ['family'] },
    { id: 'parents', english: 'parents', chinese: '父母', imageUrl: '/images/family/parents.png', kind: 'word', drillParts: ['par', 'ents'], difficulty: 2, tags: ['family'] },
    { id: 'family', english: 'family', chinese: '家庭', imageUrl: '/images/family/family.png', kind: 'word', drillParts: ['fam', 'i', 'ly'], difficulty: 2, tags: ['family'] },
    { id: 'sentence_mom', english: 'This is my mom.', chinese: '这是我的妈妈。', imageUrl: '/images/family/mom.png', kind: 'sentence', drillParts: ['This is', 'my mom'], difficulty: 1, tags: ['family', 'sentence'] },
    { id: 'sentence_dad', english: 'I love my dad.', chinese: '我爱我的爸爸。', imageUrl: '/images/family/dad.png', kind: 'sentence', drillParts: ['I love', 'my dad'], difficulty: 1, tags: ['family', 'sentence'] },
    { id: 'sentence_sister', english: 'This is my sister.', chinese: '这是我的姐妹。', imageUrl: '/images/family/sister.png', kind: 'sentence', drillParts: ['This is', 'my sister'], difficulty: 1, tags: ['family', 'sentence'] },
    { id: 'sentence_baby', english: 'I see my baby.', chinese: '我看见我的宝宝。', imageUrl: '/images/family/baby.png', kind: 'sentence', drillParts: ['I see', 'my baby'], difficulty: 1, tags: ['family', 'sentence'] },
  ],
  objectives: {
    sentences: ['This is my mom.', 'I love my dad.', 'This is my sister.', 'I see my baby.'],
  },
  teachingHints: {
    opening: '今天我们翻开家庭相册,认识家人的英文称呼!',
    reviewCardIds: [],
    newCardIds: ['mom', 'dad', 'grandma', 'grandpa', 'sister', 'brother', 'baby', 'aunt', 'uncle', 'cousin', 'parents', 'family'],
    quizQuestions: ['Where is mom?', 'Find dad.', 'Which one is grandma?', 'Find baby.'],
    closing: '今天我们认识了 mom, dad, grandma, grandpa, sister, brother, baby, aunt, uncle, cousin, parents, family!',
  },
  phases: {
    introduction: {
      sceneCaption: '温暖的家庭相册里放着家人照片',
      narrationHint: '逐张介绍家庭成员,自然带出 This is my ... 和 I love my ...。不要让孩子感到必须表演。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is mom?', correctCardId: 'mom', distractorCardIds: ['dad', 'sister'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find dad.', correctCardId: 'dad', distractorCardIds: ['grandma', 'brother'] },
        { id: 'q3', type: 'pick-word', prompt: 'Which one is grandma?', correctCardId: 'grandma', distractorCardIds: ['grandpa', 'mom'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find baby.', correctCardId: 'baby', distractorCardIds: ['aunt', 'uncle'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_mom', targetText: 'This is my mom.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_dad', targetText: 'I love my dad.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_sister', targetText: 'This is my sister.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_baby', targetText: 'I see my baby.' },
      ],
    },
  },
};

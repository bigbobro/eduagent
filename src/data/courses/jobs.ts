import type { Course } from '@/types/course';

export const jobsCourse: Course = {
  id: 'jobs',
  title: '我的职业 Jobs',
  description: '学习基础社会职业的英文名称',
  targetAge: [3, 6],
  tone: 'lilac',
  cards: [
    { id: 'teacher', english: 'teacher', chinese: '老师', imageUrl: '/images/jobs/teacher.png', kind: 'word', drillParts: ["teach","er"], difficulty: 1, tags: ['jobs'] },
    { id: 'doctor', english: 'doctor', chinese: '医生', imageUrl: '/images/jobs/doctor.png', kind: 'word', drillParts: ["doc","tor"], difficulty: 1, tags: ['jobs'] },
    { id: 'nurse', english: 'nurse', chinese: '护士', imageUrl: '/images/jobs/nurse.png', kind: 'word', drillParts: ["nurse"], difficulty: 1, tags: ['jobs'] },
    { id: 'police', english: 'police', chinese: '警察', imageUrl: '/images/jobs/police.png', kind: 'word', drillParts: ["po","lice"], difficulty: 1, tags: ['jobs'] },
    { id: 'pilot', english: 'pilot', chinese: '飞行员', imageUrl: '/images/jobs/pilot.png', kind: 'word', drillParts: ["pi","lot"], difficulty: 1, tags: ['jobs'] },
    { id: 'chef', english: 'chef', chinese: '厨师', imageUrl: '/images/jobs/chef.png', kind: 'word', drillParts: ["chef"], difficulty: 1, tags: ['jobs'] },
    { id: 'singer', english: 'singer', chinese: '歌手', imageUrl: '/images/jobs/singer.png', kind: 'word', drillParts: ["sing","er"], difficulty: 1, tags: ['jobs'] },
    { id: 'dancer', english: 'dancer', chinese: '舞者', imageUrl: '/images/jobs/dancer.png', kind: 'word', drillParts: ["dan","cer"], difficulty: 1, tags: ['jobs'] },
    { id: 'artist', english: 'artist', chinese: '画家', imageUrl: '/images/jobs/artist.png', kind: 'word', drillParts: ["ar","tist"], difficulty: 1, tags: ['jobs'] },
    { id: 'driver', english: 'driver', chinese: '司机', imageUrl: '/images/jobs/driver.png', kind: 'word', drillParts: ["driv","er"], difficulty: 1, tags: ['jobs'] },
    { id: 'fireman', english: 'fireman', chinese: '消防员', imageUrl: '/images/jobs/fireman.png', kind: 'word', drillParts: ["fire","man"], difficulty: 1, tags: ['jobs'] },
    { id: 'astronaut', english: 'astronaut', chinese: '宇航员', imageUrl: '/images/jobs/astronaut.png', kind: 'word', drillParts: ["as","tro","naut"], difficulty: 2, tags: ['jobs'] },
    { id: 'sentence_doctor', english: 'I am a doctor.', chinese: '我是一名医生。', imageUrl: '/images/jobs/doctor.png', kind: 'sentence', drillParts: ["I am","a doctor"], difficulty: 1, tags: ['jobs', 'sentence'] },
    { id: 'sentence_teacher', english: 'She is my teacher.', chinese: '她是我的老师。', imageUrl: '/images/jobs/teacher.png', kind: 'sentence', drillParts: ["She is","my teacher"], difficulty: 1, tags: ['jobs', 'sentence'] },
    { id: 'sentence_fireman', english: 'Help the fireman.', chinese: '帮助那个消防员。', imageUrl: '/images/jobs/fireman.png', kind: 'sentence', drillParts: ["Help","the fireman"], difficulty: 1, tags: ['jobs', 'sentence'] },
    { id: 'sentence_pilot', english: 'I see the pilot.', chinese: '我看见了飞行员。', imageUrl: '/images/jobs/pilot.png', kind: 'sentence', drillParts: ["I see","the pilot"], difficulty: 1, tags: ['jobs', 'sentence'] }
  ],
  objectives: {
    sentences: ["I am a doctor.","She is my teacher.","Help the fireman.","I see the pilot."],
  },
  teachingHints: {
    opening: '今天我们翻开梦想职业卡,看看未来你想做什么工作吧!',
    reviewCardIds: [],
    newCardIds: ["teacher","doctor","nurse","police","pilot","chef","singer","dancer","artist","driver","fireman","astronaut"],
    quizQuestions: ["Where is the doctor?","Where is the teacher?","Where is the fireman?","Where is the pilot?"],
    closing: '今天我们认识了 teacher, doctor, nurse, police, pilot, chef, singer, dancer, artist, driver, fireman, astronaut!',
  },
  phases: {
    introduction: {
      sceneCaption: '小朋友们穿着各式各样的职业制服站成一排',
      narrationHint: '传达各种工作的社会贡献,激发孩子的同理心和梦想。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the doctor?', correctCardId: 'doctor', distractorCardIds: ["teacher","nurse"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the teacher?', correctCardId: 'teacher', distractorCardIds: ["doctor","nurse"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the fireman?', correctCardId: 'fireman', distractorCardIds: ["teacher","doctor"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the pilot?', correctCardId: 'pilot', distractorCardIds: ["teacher","doctor"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_doctor', targetText: 'I am a doctor.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_teacher', targetText: 'She is my teacher.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_fireman', targetText: 'Help the fireman.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_pilot', targetText: 'I see the pilot.' }
      ],
    },
  },
};

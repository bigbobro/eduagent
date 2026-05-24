import type { Course } from '@/types/course';

export const instrumentsCourse: Course = {
  id: 'instruments',
  title: '音乐与乐器 Instruments',
  description: '学习常见乐器和音乐词汇',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'piano', english: 'piano', chinese: '钢琴', imageUrl: '/images/instruments/piano.png', kind: 'word', drillParts: ["pi","an","o"], difficulty: 1, tags: ['instruments'] },
    { id: 'guitar', english: 'guitar', chinese: '吉他', imageUrl: '/images/instruments/guitar.png', kind: 'word', drillParts: ["gui","tar"], difficulty: 1, tags: ['instruments'] },
    { id: 'drum', english: 'drum', chinese: '鼓', imageUrl: '/images/instruments/drum.png', kind: 'word', drillParts: ["drum"], difficulty: 1, tags: ['instruments'] },
    { id: 'violin', english: 'violin', chinese: '小提琴', imageUrl: '/images/instruments/violin.png', kind: 'word', drillParts: ["vi","o","lin"], difficulty: 1, tags: ['instruments'] },
    { id: 'flute', english: 'flute', chinese: '长笛', imageUrl: '/images/instruments/flute.png', kind: 'word', drillParts: ["flute"], difficulty: 1, tags: ['instruments'] },
    { id: 'trumpet', english: 'trumpet', chinese: '小号', imageUrl: '/images/instruments/trumpet.png', kind: 'word', drillParts: ["trum","pet"], difficulty: 1, tags: ['instruments'] },
    { id: 'bell', english: 'bell', chinese: '小铃铛', imageUrl: '/images/instruments/bell.png', kind: 'word', drillParts: ["bell"], difficulty: 1, tags: ['instruments'] },
    { id: 'harp', english: 'harp', chinese: '竖琴', imageUrl: '/images/instruments/harp.png', kind: 'word', drillParts: ["harp"], difficulty: 1, tags: ['instruments'] },
    { id: 'music', english: 'music', chinese: '音乐', imageUrl: '/images/instruments/music.png', kind: 'word', drillParts: ["mu","sic"], difficulty: 1, tags: ['instruments'] },
    { id: 'song', english: 'song', chinese: '歌曲', imageUrl: '/images/instruments/song.png', kind: 'word', drillParts: ["song"], difficulty: 1, tags: ['instruments'] },
    { id: 'sing', english: 'sing', chinese: '唱歌', imageUrl: '/images/instruments/sing.png', kind: 'word', drillParts: ["sing"], difficulty: 1, tags: ['instruments'] },
    { id: 'sound', english: 'sound', chinese: '声音', imageUrl: '/images/instruments/sound.png', kind: 'word', drillParts: ["sound"], difficulty: 1, tags: ['instruments'] },
    { id: 'sentence_piano', english: 'I play the piano.', chinese: '我弹钢琴。', imageUrl: '/images/instruments/piano.png', kind: 'sentence', drillParts: ["I play","the piano"], difficulty: 1, tags: ['instruments', 'sentence'] },
    { id: 'sentence_drum', english: 'Hit the drum.', chinese: '敲鼓。', imageUrl: '/images/instruments/drum.png', kind: 'sentence', drillParts: ["Hit","the drum"], difficulty: 1, tags: ['instruments', 'sentence'] },
    { id: 'sentence_music', english: 'Listen to the music.', chinese: '听听音乐。', imageUrl: '/images/instruments/music.png', kind: 'sentence', drillParts: ["Listen to","the music"], difficulty: 1, tags: ['instruments', 'sentence'] },
    { id: 'sentence_song', english: 'I like this song.', chinese: '我喜欢这首歌。', imageUrl: '/images/instruments/song.png', kind: 'sentence', drillParts: ["I like","this song"], difficulty: 1, tags: ['instruments', 'sentence'] }
  ],
  objectives: {
    sentences: ["I play the piano.","Hit the drum.","Listen to the music.","I like this song."],
  },
  teachingHints: {
    opening: '今天我们推开音乐大门,认识好听的乐器吧!',
    reviewCardIds: [],
    newCardIds: ["piano","guitar","drum","violin","flute","trumpet","bell","harp","music","song","sing","sound"],
    quizQuestions: ["Where is the piano?","Where is the drum?","Where is the music?","Where is the song?"],
    closing: '今天我们认识了 piano, guitar, drum, violin, flute, trumpet, bell, harp, music, song, sing, sound!',
  },
  phases: {
    introduction: {
      sceneCaption: '舞台上摆放着各式各样闪闪发光的乐器',
      narrationHint: '保持欢快有节奏律动的声音引导。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the piano?', correctCardId: 'piano', distractorCardIds: ["guitar","drum"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the drum?', correctCardId: 'drum', distractorCardIds: ["piano","guitar"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the music?', correctCardId: 'music', distractorCardIds: ["piano","guitar"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the song?', correctCardId: 'song', distractorCardIds: ["piano","guitar"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_piano', targetText: 'I play the piano.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_drum', targetText: 'Hit the drum.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_music', targetText: 'Listen to the music.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_song', targetText: 'I like this song.' }
      ],
    },
  },
};

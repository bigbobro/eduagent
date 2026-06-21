import type { Course } from '@/types/course';

export const magicCourse: Course = {
  id: 'magic',
  title: '童话与魔法 Fairytale & Magic',
  description: '学习童话世界与魔法用品的英文名称',
  targetAge: [3, 6],
  tone: 'lilac',
  cards: [
    { id: 'king', english: 'king', chinese: '国王', imageUrl: '/images/magic/king.png', kind: 'word', drillParts: ["king"], difficulty: 1, tags: ['magic'] },
    { id: 'queen', english: 'queen', chinese: '女王', imageUrl: '/images/magic/queen.png', kind: 'word', drillParts: ["queen"], difficulty: 1, tags: ['magic'] },
    { id: 'castle', english: 'castle', chinese: '城堡', imageUrl: '/images/magic/castle.png', kind: 'word', drillParts: ["cas","tle"], difficulty: 1, tags: ['magic'] },
    { id: 'dragon', english: 'dragon', chinese: '恶龙', imageUrl: '/images/magic/dragon.png', kind: 'word', drillParts: ["drag","on"], difficulty: 1, tags: ['magic'] },
    { id: 'spell', english: 'spell', chinese: '咒语', imageUrl: '/images/magic/spell.png', kind: 'word', drillParts: ["spell"], difficulty: 1, tags: ['magic'] },
    { id: 'wand', english: 'wand', chinese: '魔杖', imageUrl: '/images/magic/wand.png', kind: 'word', drillParts: ["wand"], difficulty: 1, tags: ['magic'] },
    { id: 'crown', english: 'crown', chinese: '皇冠', imageUrl: '/images/magic/crown.png', kind: 'word', drillParts: ["crown"], difficulty: 1, tags: ['magic'] },
    { id: 'fairy', english: 'fairy', chinese: '仙女', imageUrl: '/images/magic/fairy.png', kind: 'word', drillParts: ["fair","y"], difficulty: 1, tags: ['magic'] },
    { id: 'giant', english: 'giant', chinese: '巨人', imageUrl: '/images/magic/giant.png', kind: 'word', drillParts: ["gi","ant"], difficulty: 1, tags: ['magic'] },
    { id: 'knight', english: 'knight', chinese: '骑士', imageUrl: '/images/magic/knight.png', kind: 'word', drillParts: ["knight"], asrAliases: ["night", "夜晚"], difficulty: 1, tags: ['magic'] },
    { id: 'prince', english: 'prince', chinese: '王子', imageUrl: '/images/magic/prince.png', kind: 'word', drillParts: ["prince"], difficulty: 1, tags: ['magic'] },
    { id: 'princess', english: 'princess', chinese: '公主', imageUrl: '/images/magic/princess.png', kind: 'word', drillParts: ["prin","cess"], difficulty: 2, tags: ['magic'] },
    { id: 'sentence_castle', english: 'This is a castle.', chinese: '这是一座城堡。', imageUrl: '/images/magic/castle.png', kind: 'sentence', drillParts: ["This is","a castle"], difficulty: 1, tags: ['magic', 'sentence'] },
    { id: 'sentence_dragon', english: 'Look at the dragon.', chinese: '看那只恶龙。', imageUrl: '/images/magic/dragon.png', kind: 'sentence', drillParts: ["Look at","the dragon"], difficulty: 1, tags: ['magic', 'sentence'] },
    { id: 'sentence_wand', english: 'I have a magic wand.', chinese: '我有一根魔杖。', imageUrl: '/images/magic/wand.png', kind: 'sentence', drillParts: ["I have","a magic wand"], difficulty: 1, tags: ['magic', 'sentence'] },
    { id: 'sentence_king', english: 'The king is good.', chinese: '国王是善良的。', imageUrl: '/images/magic/king.png', kind: 'sentence', drillParts: ["The king","is good"], difficulty: 1, tags: ['magic', 'sentence'] }
  ],
  objectives: {
    sentences: ["This is a castle.","Look at the dragon.","I have a magic wand.","The king is good."],
  },
  teachingHints: {
    opening: '今天我们翻开魔法童话书,去认识童话城堡里的人物吧!',
    reviewCardIds: [],
    newCardIds: ["king","queen","castle","dragon","spell","wand","crown","fairy","giant","knight","prince","princess"],
    quizQuestions: ["Where is the castle?","Where is the dragon?","Where is the wand?","Where is the king?"],
    closing: '今天我们认识了 king, queen, castle, dragon, spell, wand, crown, fairy, giant, knight, prince, princess!',
  },
  phases: {
    introduction: {
      sceneCaption: '云雾缭绕的高山上矗立着一座梦幻的水彩城堡',
      narrationHint: '用带有神秘色彩和讲故事的声音去吸引小朋友。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the castle?', correctCardId: 'castle', distractorCardIds: ["king","queen"] },
        { id: 'q2', type: 'pick-word', prompt: 'Where is the dragon?', correctCardId: 'dragon', distractorCardIds: ["king","queen"] },
        { id: 'q3', type: 'pick-word', prompt: 'Where is the wand?', correctCardId: 'wand', distractorCardIds: ["king","queen"] },
        { id: 'q4', type: 'pick-word', prompt: 'Where is the king?', correctCardId: 'king', distractorCardIds: ["queen","castle"] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_castle', targetText: 'This is a castle.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_dragon', targetText: 'Look at the dragon.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_wand', targetText: 'I have a magic wand.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_king', targetText: 'The king is good.' }
      ],
    },
  },
};

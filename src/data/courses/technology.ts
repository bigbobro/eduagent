import type { Course } from '@/types/course';

export const technologyCourse: Course = {
  id: 'technology',
  title: '小小科技 Technology',
  description: '学习身边常见科技设备和配件的英文名称',
  targetAge: [3, 6],
  tone: 'sky',
  cards: [
    { id: 'tablet', english: 'tablet', chinese: '平板电脑', imageUrl: '/images/technology/tablet.png', kind: 'word', drillParts: ['tab', 'let'], difficulty: 1, tags: ['technology'] },
    { id: 'keyboard', english: 'keyboard', chinese: '键盘', imageUrl: '/images/technology/keyboard.png', kind: 'word', drillParts: ['key', 'board'], difficulty: 1, tags: ['technology'] },
    { id: 'mouse', english: 'mouse', chinese: '鼠标', imageUrl: '/images/technology/mouse.png', kind: 'word', drillParts: ['mouse'], difficulty: 1, tags: ['technology'] },
    { id: 'screen', english: 'screen', chinese: '屏幕', imageUrl: '/images/technology/screen.png', kind: 'word', drillParts: ['screen'], difficulty: 1, tags: ['technology'] },
    { id: 'phone', english: 'phone', chinese: '电话', imageUrl: '/images/technology/phone.png', kind: 'word', drillParts: ['phone'], difficulty: 1, tags: ['technology'] },
    { id: 'camera', english: 'camera', chinese: '相机', imageUrl: '/images/technology/camera.png', kind: 'word', drillParts: ['cam', 'er', 'a'], difficulty: 1, tags: ['technology'] },
    { id: 'headphones', english: 'headphones', chinese: '耳机', imageUrl: '/images/technology/headphones.png', kind: 'word', drillParts: ['head', 'phones'], difficulty: 1, tags: ['technology'] },
    { id: 'microphone', english: 'microphone', chinese: '麦克风', imageUrl: '/images/technology/microphone.png', kind: 'word', drillParts: ['mi', 'cro', 'phone'], difficulty: 2, tags: ['technology'] },
    { id: 'speaker', english: 'speaker', chinese: '音箱', imageUrl: '/images/technology/speaker.png', kind: 'word', drillParts: ['speak', 'er'], difficulty: 1, tags: ['technology'] },
    { id: 'charger', english: 'charger', chinese: '充电器', imageUrl: '/images/technology/charger.png', kind: 'word', drillParts: ['charg', 'er'], difficulty: 1, tags: ['technology'] },
    { id: 'remote', english: 'remote', chinese: '遥控器', imageUrl: '/images/technology/remote.png', kind: 'word', drillParts: ['re', 'mote'], difficulty: 1, tags: ['technology'] },
    { id: 'battery', english: 'battery', chinese: '电池', imageUrl: '/images/technology/battery.png', kind: 'word', drillParts: ['bat', 'ter', 'y'], difficulty: 1, tags: ['technology'] },
    { id: 'sentence_tablet', english: 'I see a tablet.', chinese: '我看见一台平板电脑。', imageUrl: '/images/technology/tablet.png', kind: 'sentence', drillParts: ['I see', 'a tablet'], difficulty: 1, tags: ['technology', 'sentence'] },
    { id: 'sentence_screen', english: 'The screen is bright.', chinese: '屏幕很亮。', imageUrl: '/images/technology/screen.png', kind: 'sentence', drillParts: ['The screen', 'is bright'], difficulty: 1, tags: ['technology', 'sentence'] },
    { id: 'sentence_headphones', english: 'I use headphones.', chinese: '我使用耳机。', imageUrl: '/images/technology/headphones.png', kind: 'sentence', drillParts: ['I use', 'headphones'], difficulty: 1, tags: ['technology', 'sentence'] },
    { id: 'sentence_battery', english: 'The battery is low.', chinese: '电池电量低。', imageUrl: '/images/technology/battery.png', kind: 'sentence', drillParts: ['The battery', 'is low'], difficulty: 1, tags: ['technology', 'sentence'] },
  ],
  objectives: {
    sentences: ['I see a tablet.', 'The screen is bright.', 'I use headphones.', 'The battery is low.'],
  },
  teachingHints: {
    opening: '今天我们看看身边的小科技设备,学习它们的英文名字。',
    reviewCardIds: [],
    newCardIds: ['tablet', 'keyboard', 'mouse', 'screen', 'phone', 'camera', 'headphones', 'microphone', 'speaker', 'charger', 'remote', 'battery'],
    quizQuestions: ['Where is the tablet?', 'Find the screen.', 'Where are the headphones?', 'Find the battery.'],
    closing: '今天我们认识了 tablet, keyboard, mouse, screen, phone, camera, headphones, microphone, speaker, charger, remote, battery!',
  },
  phases: {
    introduction: {
      sceneCaption: '柔和灯光下的桌面摆着平板、键盘、耳机和相机',
      narrationHint: '用生活化语气介绍设备,强调看图认词,不引导孩子长时间使用屏幕。',
    },
    interactive: {},
    reinforcement: {
      quizzes: [
        { id: 'q1', type: 'pick-word', prompt: 'Where is the tablet?', correctCardId: 'tablet', distractorCardIds: ['keyboard', 'phone'] },
        { id: 'q2', type: 'pick-word', prompt: 'Find the screen.', correctCardId: 'screen', distractorCardIds: ['mouse', 'camera'] },
        { id: 'q3', type: 'pick-word', prompt: 'Where are the headphones?', correctCardId: 'headphones', distractorCardIds: ['speaker', 'microphone'] },
        { id: 'q4', type: 'pick-word', prompt: 'Find the battery.', correctCardId: 'battery', distractorCardIds: ['charger', 'remote'] },
        { id: 'q5', type: 'repeat-after-me', cardId: 'sentence_tablet', targetText: 'I see a tablet.' },
        { id: 'q6', type: 'repeat-after-me', cardId: 'sentence_screen', targetText: 'The screen is bright.' },
        { id: 'q7', type: 'repeat-after-me', cardId: 'sentence_headphones', targetText: 'I use headphones.' },
        { id: 'q8', type: 'repeat-after-me', cardId: 'sentence_battery', targetText: 'The battery is low.' },
      ],
    },
  },
};

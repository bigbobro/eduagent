import { Course } from '@/types/course';

export const timeNumbersCourse: Course = {
  id: 'timeNumbers',
  title: '时间和大数字 Time & Big Numbers',
  description: '学习 hour, minute, second 以及 hundred, thousand, million, billion',
  targetAge: [3, 6],
  cards: [
    { id: 'hour',     english: 'hour',     chinese: '小时',  imageUrl: '/images/time-numbers/hour.png',     kind: 'word', drillParts: ['hour'], difficulty: 1, tags: ['time'] },
    { id: 'minute',   english: 'minute',   chinese: '分钟',  imageUrl: '/images/time-numbers/minute.png',   kind: 'word', drillParts: ['min', 'it'], difficulty: 1, tags: ['time'] },
    { id: 'second',   english: 'second',   chinese: '秒',    imageUrl: '/images/time-numbers/second.png',   kind: 'word', drillParts: ['sec', 'ond'], difficulty: 1, tags: ['time'] },
    { id: 'hundred',  english: 'hundred',  chinese: '百',    imageUrl: '/images/time-numbers/hundred.png',  kind: 'word', drillParts: ['hun', 'dred'], difficulty: 2, tags: ['number'] },
    { id: 'thousand', english: 'thousand', chinese: '千',    imageUrl: '/images/time-numbers/thousand.png', kind: 'word', drillParts: ['thou', 'sand'], difficulty: 2, tags: ['number'] },
    { id: 'million',  english: 'million',  chinese: '百万',  imageUrl: '/images/time-numbers/million.png',  kind: 'word', drillParts: ['mil', 'lion'], difficulty: 3, tags: ['number'] },
    { id: 'billion',  english: 'billion',  chinese: '十亿',  imageUrl: '/images/time-numbers/billion.png',  kind: 'word', drillParts: ['bil', 'lion'], difficulty: 3, tags: ['number'] },
    {
      id: 'sentence_hour_minute',
      english: 'One hour has sixty minutes.',
      chinese: '一小时有 60 分钟。',
      imageUrl: '/images/time-numbers/sentence-hour-minute.png',
      kind: 'sentence',
      drillParts: ['One hour', 'has sixty', 'minutes'],
    },
    {
      id: 'sentence_minute_second',
      english: 'One minute has sixty seconds.',
      chinese: '一分钟有 60 秒。',
      imageUrl: '/images/time-numbers/sentence-minute-second.png',
      kind: 'sentence',
      drillParts: ['One minute', 'has sixty', 'seconds'],
    },
    {
      id: 'sentence_thousand_hundred',
      english: 'One thousand is ten hundreds.',
      chinese: '一千是 10 个百。',
      imageUrl: '/images/time-numbers/sentence-thousand-hundred.png',
      kind: 'sentence',
      drillParts: ['One thousand', 'is ten', 'hundreds'],
    },
    {
      id: 'sentence_billion_million',
      english: 'One billion is one thousand million.',
      chinese: '十亿是 1000 个百万。',
      imageUrl: '/images/time-numbers/sentence-billion-million.png',
      kind: 'sentence',
      drillParts: ['One billion', 'is one thousand', 'million'],
    },
  ],
  objectives: {
    sentences: [
      'One hour has sixty minutes.',
      'One minute has sixty seconds.',
      'One thousand is ten hundreds.',
      'One billion is one thousand million.',
    ],
  },
  teachingHints: {
    opening: '今天我们学习时间和大数字!Time and big numbers!',
    reviewCardIds: ['hour', 'minute', 'second'],
    newCardIds: [
      'hundred', 'thousand', 'million', 'billion',
      'sentence_hour_minute', 'sentence_minute_second',
      'sentence_thousand_hundred', 'sentence_billion_million',
    ],
    quizQuestions: [
      '一小时有多少分钟?',
      '一分钟有多少秒?',
      'Which is bigger, thousand or hundred?',
      '十亿和百万有什么关系?',
    ],
    closing: '今天我们学了 hour, minute, second, hundred, thousand, million, billion。',
  },
};

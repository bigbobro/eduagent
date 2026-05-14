import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { buildProgressSnapshot, masteryStarsFromRatio } from './progress';
import type { Course } from '@/types/course';

const fixtureCourses: Course[] = [
  {
    id: 'transportation',
    title: '交通',
    description: '',
    targetAge: [3, 6],
    theme: 'transport',
    cards: [
      { id: 'car', english: 'car', chinese: '小汽车', imageUrl: '', kind: 'word', drillParts: ['car'] },
      { id: 'bus', english: 'bus', chinese: '公交车', imageUrl: '', kind: 'word', drillParts: ['bus'] },
    ],
    objectives: { sentences: [] },
    teachingHints: { opening: '', reviewCardIds: [], newCardIds: [], quizQuestions: [], closing: '' },
  },
];

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
    CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
  `);
  return db;
}

describe('masteryStarsFromRatio', () => {
  it.each([
    [0, 0, 0],
    [0, 5, 0],
    [1, 10, 1],
    [3, 5, 2],
    [6, 10, 2],
    [9, 10, 3],
    [10, 10, 3],
  ] as Array<[number, number, 0 | 1 | 2 | 3]>)('correct=%i attempts=%i → ★%i', (correct, attempts, stars) => {
    expect(masteryStarsFromRatio(correct, attempts)).toBe(stars);
  });
});

describe('buildProgressSnapshot', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
  });

  it('empty DB → all words ★0 with lastPracticed=null', () => {
    const snap = buildProgressSnapshot(db, fixtureCourses);
    expect(snap.totalWordsMastered).toBe(0);
    expect(snap.courses[0].masteredWords).toBe(0);
    expect(snap.courses[0].words.every((w) => w.masteryStars === 0 && w.lastPracticed === null)).toBe(true);
  });

  it('single lesson with partial correct → stars derived', () => {
    db.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-10T10:00:00Z','2026-05-10T10:15:00Z',5,'{}')`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','car',10,9,1)`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','bus',5,3,2)`).run();
    const snap = buildProgressSnapshot(db, fixtureCourses);
    const car = snap.courses[0].words.find((w) => w.word === 'car')!;
    const bus = snap.courses[0].words.find((w) => w.word === 'bus')!;
    expect(car.masteryStars).toBe(3);
    expect(bus.masteryStars).toBe(2);
    expect(snap.courses[0].masteredWords).toBe(1);
    expect(snap.totalWordsMastered).toBe(1);
  });

  it('multi lesson same word → attempts/correct summed, lastPracticed=latest', () => {
    db.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-09T10:00:00Z','2026-05-09T10:15:00Z',5,'{}')`).run();
    db.prepare(`INSERT INTO lesson_logs VALUES ('l2','transportation','2026-05-10T10:00:00Z','2026-05-10T10:15:00Z',5,'{}')`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','car',5,3,2)`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l2','car',5,4,1)`).run();
    const snap = buildProgressSnapshot(db, fixtureCourses);
    const car = snap.courses[0].words.find((w) => w.word === 'car')!;
    expect(car.attempts).toBe(10);
    expect(car.correct).toBe(7);
    expect(car.lastPracticed).toBe('2026-05-10T10:00:00Z');
  });
});

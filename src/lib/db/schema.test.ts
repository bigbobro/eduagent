import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSchemaVersion, runMigrations } from './schema';

function tableNames(db: Database.Database): string[] {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all().map((row) => (row as { name: string }).name);
}

describe('runMigrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('bootstraps all tables and records the schema version', () => {
    runMigrations(db);

    expect(tableNames(db)).toEqual(expect.arrayContaining([
      'schema_migrations',
      'lesson_logs',
      'interaction_logs',
      'word_performance',
      'course_progress',
    ]));
    expect(getSchemaVersion(db)).toBe(4);
    // v2: R-C 权威账本列(NULL = 未追踪)
    const wordPerfCols = db.prepare('PRAGMA table_info(word_performance)').all()
      .map((row) => (row as { name: string }).name);
    expect(wordPerfCols).toEqual(expect.arrayContaining(['rc_correct', 'rc_cleared']));
    // v3: 非优雅结束标志(R1 2026-07-04)
    const lessonLogCols = db.prepare('PRAGMA table_info(lesson_logs)').all()
      .map((row) => (row as { name: string }).name);
    expect(lessonLogCols).toContain('ended_gracefully');
    // v4: 断点续课(2026-07-20)
    const courseProgressCols = db.prepare('PRAGMA table_info(course_progress)').all()
      .map((row) => (row as { name: string }).name);
    expect(courseProgressCols).toEqual(expect.arrayContaining(['course_id', 'snapshot', 'phase', 'completed', 'updated_at']));
  });

  it('is idempotent', () => {
    runMigrations(db);
    runMigrations(db);

    const rows = db.prepare(
      'SELECT version, name FROM schema_migrations ORDER BY version',
    ).all();
    expect(rows).toEqual([
      { version: 1, name: 'initial_lesson_schema' },
      { version: 2, name: 'word_performance_rc_state' },
      { version: 3, name: 'lesson_logs_ended_gracefully' },
      { version: 4, name: 'course_progress_table' },
    ]);
  });

  it('marks an existing schema without dropping lesson data', () => {
    runMigrations(db);
    db.prepare(
      'INSERT INTO lesson_logs (id, course_id, start_time) VALUES (?, ?, ?)',
    ).run('lesson-1', 'food', '2026-05-30T00:00:00.000Z');
    db.exec('DROP TABLE schema_migrations');

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(4);
    expect(db.prepare('SELECT COUNT(*) AS count FROM lesson_logs').get()).toEqual({ count: 1 });
  });
});

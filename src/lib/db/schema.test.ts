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
    ]));
    expect(getSchemaVersion(db)).toBe(1);
  });

  it('is idempotent', () => {
    runMigrations(db);
    runMigrations(db);

    const rows = db.prepare(
      'SELECT version, name FROM schema_migrations ORDER BY version',
    ).all();
    expect(rows).toEqual([{ version: 1, name: 'initial_lesson_schema' }]);
  });

  it('marks an existing schema without dropping lesson data', () => {
    runMigrations(db);
    db.prepare(
      'INSERT INTO lesson_logs (id, course_id, start_time) VALUES (?, ?, ?)',
    ).run('lesson-1', 'food', '2026-05-30T00:00:00.000Z');
    db.exec('DROP TABLE schema_migrations');

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM lesson_logs').get()).toEqual({ count: 1 });
  });
});

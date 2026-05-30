import Database from 'better-sqlite3';
import { getDb } from './index';

interface Migration {
  version: number;
  name: string;
  up(db: Database.Database): void;
}

const CREATE_SCHEMA_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )
`;

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_lesson_schema',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS lesson_logs (
          id TEXT PRIMARY KEY,
          course_id TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT,
          interaction_count INTEGER DEFAULT 0,
          token_usage TEXT DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS interaction_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lesson_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          user_input TEXT DEFAULT '',
          ai_response TEXT DEFAULT '',
          actions TEXT DEFAULT '[]',
          model_calls TEXT DEFAULT '{}',
          FOREIGN KEY (lesson_id) REFERENCES lesson_logs(id)
        );

        CREATE TABLE IF NOT EXISTS word_performance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lesson_id TEXT NOT NULL,
          word TEXT NOT NULL,
          attempts INTEGER DEFAULT 0,
          correct INTEGER DEFAULT 0,
          needs_review INTEGER DEFAULT 0,
          FOREIGN KEY (lesson_id) REFERENCES lesson_logs(id)
        );
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(CREATE_SCHEMA_MIGRATIONS_TABLE);

  const appliedVersions = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => {
      return (row as { version: number }).version;
    }),
  );

  const applyMigration = db.transaction((migration: Migration) => {
    migration.up(db);
    db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    ).run(migration.version, migration.name, new Date().toISOString());
  });

  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (!appliedVersions.has(migration.version)) {
      applyMigration(migration);
    }
  }
}

export function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  ).get() as { version: number };
  return row.version;
}

export function initDatabase(): void {
  runMigrations(getDb());
}

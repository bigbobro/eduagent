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
  {
    version: 2,
    // R-C 权威账本落库(2026-07-03 决策方案 A)。NULL = 旧数据未追踪(legacy),
    // 报告据此区分"权威 clearRate"与"LLM 判定账本回退";新写入路径(session.ts
    // commitTurn)对每个有 R-C 状态变化的词当轮同步真实值。
    name: 'word_performance_rc_state',
    up(db) {
      // 幂等(与 v1 的 IF NOT EXISTS 同约定):schema_migrations 丢失后重跑不炸。
      const cols = db.prepare('PRAGMA table_info(word_performance)').all()
        .map((row) => (row as { name: string }).name);
      if (!cols.includes('rc_correct')) db.exec('ALTER TABLE word_performance ADD COLUMN rc_correct INTEGER');
      if (!cols.includes('rc_cleared')) db.exec('ALTER TABLE word_performance ADD COLUMN rc_cleared INTEGER');
    },
  },
  {
    version: 3,
    // R1 (2026-07-04, session 6f6e7bec): touchLessonLog now writes token_usage every turn
    // (see queries.ts), so a non-empty token_usage no longer implies a graceful end. This
    // explicit flag — set only by finishLessonLog (action:'end') — lets the report tell a
    // graceful end apart from a lesson that was only ever touched (tab close / crash).
    name: 'lesson_logs_ended_gracefully',
    up(db) {
      const cols = db.prepare('PRAGMA table_info(lesson_logs)').all()
        .map((row) => (row as { name: string }).name);
      if (!cols.includes('ended_gracefully')) {
        db.exec('ALTER TABLE lesson_logs ADD COLUMN ended_gracefully INTEGER DEFAULT 0');
      }
    },
  },
  {
    version: 4,
    // Session persistence (2026-07-20 PRD): one "current breakpoint" row per course, so a
    // lesson interrupted mid-way (tab close / crash / deliberate exit) can resume from where
    // it left off instead of always restarting at intro. snapshot is a JSON-serialized
    // CourseProgressSnapshot (see src/lib/agent/course-progress.ts) — a progress-only subset
    // of LessonMemory, deliberately excluding conversation history. `phase` is the course-level
    // intro/interactive/reinforcement/done breakpoint (PhaseName), not the snapshot's internal
    // LessonMemory.phase. `completed` gates resume: a completed course is treated as "no
    // breakpoint" on the next start (fresh restart = review), so it is left in place rather
    // than deleted.
    name: 'course_progress_table',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS course_progress (
          course_id  TEXT PRIMARY KEY,
          snapshot   TEXT NOT NULL,
          phase      TEXT NOT NULL,
          completed  INTEGER DEFAULT 0,
          updated_at TEXT NOT NULL
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

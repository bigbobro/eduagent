import { getDb } from './index';

export function initDatabase(): void {
  const db = getDb();

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
}

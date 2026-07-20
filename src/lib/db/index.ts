import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;
let openedPath: string | null = null;

export function getDb(): Database.Database {
  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './db/eduagent.db');
  if (db && openedPath !== dbPath) {
    db.close();
    db = null;
    openedPath = null;
  }
  if (!db) {
    // better-sqlite3 creates the file but not its parent directory. `db/` is not
    // in git, so a fresh checkout (CI, new machine) has no such directory.
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    openedPath = dbPath;
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    openedPath = null;
  }
}

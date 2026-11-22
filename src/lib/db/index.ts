import Database from './sqlite';
import fs from 'fs';
import path from 'path';

// server.ts and Next route bundles load separate module instances; share the actual handle.
const globals = globalThis as typeof globalThis & { __eduagentDb?: { db: Database | null; openedPath: string | null } };
const state = globals.__eduagentDb ??= { db: null, openedPath: null };

export function getDb(): Database {
  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './db/eduagent.db');
  if (state.db && state.openedPath !== dbPath) {
    state.db.close();
    state.db = null;
    state.openedPath = null;
  }
  if (!state.db) {
    // node:sqlite creates the file but not its parent directory. `db/` is not
    // in git, so a fresh checkout (CI, new machine) has no such directory.
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    state.db = new Database(dbPath);
    state.db.pragma('journal_mode = WAL');
    state.db.pragma('foreign_keys = ON');
    state.openedPath = dbPath;
  }
  return state.db;
}

export function closeDb(): void {
  if (state.db) {
    state.db.close();
    state.db = null;
    state.openedPath = null;
  }
}

export function checkpointAndCloseDb(): void {
  if (!state.db) return;
  try {
    state.db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    closeDb();
  }
}

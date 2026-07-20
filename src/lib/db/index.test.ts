import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from './index';

const ORIGINAL_DATABASE_PATH = process.env.DATABASE_PATH;

describe('getDb', () => {
  let tempDir: string;

  beforeEach(() => {
    closeDb();
    tempDir = mkdtempSync(join(tmpdir(), 'eduagent-getdb-'));
  });

  afterEach(() => {
    closeDb();
    if (ORIGINAL_DATABASE_PATH === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = ORIGINAL_DATABASE_PATH;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates the parent directory when it does not exist yet', () => {
    // Fresh checkout / new machine: `db/` is not in git, so the directory the
    // default DATABASE_PATH points into is absent. better-sqlite3 creates the
    // file but never the directory, so getDb() has to.
    const missingDir = join(tempDir, 'nested', 'db');
    process.env.DATABASE_PATH = join(missingDir, 'eduagent.db');
    expect(existsSync(missingDir)).toBe(false);

    const db = getDb();

    expect(existsSync(missingDir)).toBe(true);
    expect(db.open).toBe(true);
  });

  it('reopens against the new path when DATABASE_PATH changes', () => {
    process.env.DATABASE_PATH = join(tempDir, 'first.db');
    const first = getDb();
    expect(getDb()).toBe(first);

    process.env.DATABASE_PATH = join(tempDir, 'second.db');
    const second = getDb();

    expect(second).not.toBe(first);
    expect(first.open).toBe(false);
    expect(existsSync(join(tempDir, 'second.db'))).toBe(true);
  });
});

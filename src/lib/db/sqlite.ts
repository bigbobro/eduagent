import { DatabaseSync } from 'node:sqlite';

/** Mirrors better-sqlite3's loosely typed statement results (callers cast rows themselves). */
export interface Statement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/**
 * Thin better-sqlite3-compatible layer over the built-in `node:sqlite`.
 * Only the API surface the app uses: prepare / exec / pragma / transaction / close.
 * Why: a native addon would need a separate ABI build for Electron vs. dev Node.
 */
export class Database {
  private declare readonly raw: DatabaseSync;
  private txDepth = 0;
  private closed = false;

  constructor(path: string, options?: { readonly?: boolean }) {
    // Non-enumerable so deep-equality/pretty-printers never touch the raw handle's throwing getters.
    Object.defineProperty(this, 'raw', {
      value: new DatabaseSync(path, { readOnly: options?.readonly ?? false }),
      enumerable: false,
    });
  }

  prepare(sql: string): Statement {
    return this.raw.prepare(sql) as unknown as Statement;
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  pragma(source: string): void {
    this.raw.exec(`PRAGMA ${source}`);
  }

  /** Same semantics as better-sqlite3: top level = BEGIN/COMMIT, nested = SAVEPOINT. */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      const nested = this.txDepth > 0;
      const sp = `sp_${this.txDepth}`;
      this.raw.exec(nested ? `SAVEPOINT ${sp}` : 'BEGIN');
      this.txDepth++;
      try {
        const result = fn(...args);
        this.txDepth--;
        this.raw.exec(nested ? `RELEASE ${sp}` : 'COMMIT');
        return result;
      } catch (err) {
        this.txDepth--;
        if (nested) this.raw.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
        else if (this.raw.isTransaction) this.raw.exec('ROLLBACK');
        throw err;
      }
    };
  }

  get open(): boolean {
    return !this.closed;
  }

  close(): void {
    this.closed = true;
    this.raw.close();
  }
}

export default Database;

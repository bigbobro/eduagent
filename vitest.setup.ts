import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll } from 'vitest';
import { closeDb } from '@/lib/db';
import { initDatabase } from '@/lib/db/schema';

// Every test file gets its own migrated SQLite file under a temp dir. Without
// this, DB-touching tests fall through to the default ./db/eduagent.db — the
// developer's real database — so assertions passed or failed depending on what
// happened to be in it, and on a fresh checkout (CI) the tables don't exist at
// all. Setup files run once per test file, so the isolation is per-file.
const testDbDir = mkdtempSync(join(tmpdir(), 'eduagent-vitest-'));
process.env.DATABASE_PATH = join(testDbDir, 'eduagent.db');
initDatabase();

afterAll(() => {
  closeDb();
  rmSync(testDbDir, { recursive: true, force: true });
});

// Tells React this is an environment where act() is required;
// makes useEffect / state updates flush synchronously in @testing-library/react v16.
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Stubs for @vitejs/plugin-react's React Refresh globals — not injected in test mode.
;(globalThis as any).$RefreshReg$ = () => {};
;(globalThis as any).$RefreshSig$ = () => (type: unknown) => type;

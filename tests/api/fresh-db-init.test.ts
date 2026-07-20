import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_DATABASE_PATH = process.env.DATABASE_PATH;

// One entry per read-only route that must stand up a fresh DB on its own.
// Each case imports ONLY its own route against its own empty database — if they
// shared one, whichever route ran first would run the migrations and cover for
// the others, so dropping `ensureDatabaseInitialized()` from any single route
// would still pass.
const ROUTES = [
  {
    name: '/api/progress',
    get: async () => (await import('@/app/api/progress/route')).GET(),
    expectBody: (body: unknown) => expect(body).toMatchObject({ totalWordsMastered: 0 }),
  },
  {
    name: '/api/stats',
    get: async () => (await import('@/app/api/stats/route')).GET(),
    expectBody: (body: unknown) => expect(body).toMatchObject({ totalMinutes: 0, totalSessions: 0 }),
  },
  {
    name: '/api/sessions',
    get: async () => (await import('@/app/api/sessions/route')).GET(new Request('http://x/api/sessions')),
    expectBody: (body: unknown) => expect(body).toEqual([]),
  },
];

describe('fresh DB route initialization', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.resetModules();
    const { closeDb } = await import('@/lib/db');
    closeDb();
    tempDir = mkdtempSync(join(tmpdir(), 'eduagent-fresh-db-'));
    process.env.DATABASE_PATH = join(tempDir, 'eduagent.db');
  });

  afterEach(async () => {
    const { closeDb } = await import('@/lib/db');
    closeDb();
    vi.resetModules();
    if (ORIGINAL_DATABASE_PATH === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = ORIGINAL_DATABASE_PATH;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  // Solo run of this file takes ~250ms; the default 5000ms budget is only ever
  // exceeded when this runs alongside the other ~65 parallel vitest test files
  // (CPU contention from concurrent jsdom environments + vi.resetModules()
  // forcing a full re-transform of the route's module graph). Widen the budget
  // instead of masking the timing with retries/skip/reduced concurrency.
  it.each(ROUTES)(
    '$name serves a fresh DB on its own, before /api/chat has initialized one',
    async ({ get, expectBody }) => {
      const res = await get();

      expect(res.status).toBe(200);
      expectBody(await res.json());
    },
    20000,
  );
});

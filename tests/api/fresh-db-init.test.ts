import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_DATABASE_PATH = process.env.DATABASE_PATH;

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
  it('serves progress, stats, and sessions before /api/chat has initialized the DB', async () => {
    const progress = await import('@/app/api/progress/route');
    const stats = await import('@/app/api/stats/route');
    const sessions = await import('@/app/api/sessions/route');

    const progressRes = await progress.GET();
    const statsRes = await stats.GET();
    const sessionsRes = await sessions.GET(new Request('http://x/api/sessions'));

    expect(progressRes.status).toBe(200);
    expect(statsRes.status).toBe(200);
    expect(sessionsRes.status).toBe(200);

    await expect(progressRes.json()).resolves.toMatchObject({
      totalWordsMastered: 0,
    });
    await expect(statsRes.json()).resolves.toMatchObject({
      totalMinutes: 0,
      totalSessions: 0,
    });
    await expect(sessionsRes.json()).resolves.toEqual([]);
  }, 20000);
});

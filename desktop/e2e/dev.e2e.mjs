// Exercise app:dev itself, including both owned process trees and loopback server.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'eduagent-dev-e2e-'));
const command = spawn(process.execPath, ['desktop/scripts/dev.mjs'], {
  env: { ...process.env, VOICE_MOCK: 'true', EDUAGENT_TEST: '1', EDUAGENT_TEST_MIC_STATUS: 'granted', EDUAGENT_USER_DATA: dir, DATABASE_PATH: join(dir, 'dev.db') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
command.stdout.on('data', (d) => { output += d; process.stdout.write(d); });
command.stderr.on('data', (d) => { output += d; process.stderr.write(d); });
const exited = new Promise((resolve) => command.once('exit', resolve));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  const deadline = Date.now() + 60000;
  let log = '';
  while (Date.now() < deadline) {
    try { log = readFileSync(join(dir, 'logs/server.log'), 'utf8'); } catch {}
    if (log.includes('dev window loaded origin=') && output.includes('Server listening')) break;
    if (command.exitCode !== null) throw new Error(`dev launcher exited ${command.exitCode}`);
    await delay(200);
  }
  const origin = /local origin=(http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
  if (!origin || !log.includes('dev window loaded origin=')) throw new Error('Electron did not finish loading the development origin');
  const response = await fetch(`${origin}/api/courses`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok || (await response.json()).length === 0) throw new Error('dev server did not return courses');
  if (log.includes('server spawned')) throw new Error('dev mode started a staged server');
  console.log('[dev-e2e] PASS app:dev launches pnpm dev and Electron targets the live loopback server');
  command.kill('SIGTERM');
  await Promise.race([exited, delay(10000).then(() => { throw new Error('dev launcher did not exit'); })]);
  await delay(300);
  let stillListening = false;
  try { await fetch(`${origin}/api/courses`, { signal: AbortSignal.timeout(1000) }); stillListening = true; } catch {}
  if (stillListening) throw new Error('dev server remained after launcher exit');
  console.log('[dev-e2e] PASS quitting the launcher removes the dev server');
} catch (err) { console.error('[dev-e2e] FAIL', err, output); code = 1; }
finally { if (command.exitCode === null) command.kill('SIGTERM'); rmSync(dir, { recursive: true, force: true }); }
process.exitCode = code;

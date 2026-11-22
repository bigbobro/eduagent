import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import WebSocket from 'ws';

const PORT = 3016;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSX = path.join(ROOT, 'node_modules/tsx/dist/cli.mjs');

type Scenario = 'idle' | 'raw-tcp' | 'websocket';

function listenerPid(): number | null {
  try {
    const output = execFileSync('lsof', [`-tiTCP:${PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
    return output ? Number(output.split('\n')[0]) : null;
  } catch { return null; }
}

function walSize(file: string): number | 'removed' {
  return existsSync(file) ? statSync(file).size : 'removed';
}

async function ready(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/api/settings`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('server did not become ready');
}

async function openResource(scenario: Scenario): Promise<() => void> {
  if (scenario === 'idle') return () => {};
  if (scenario === 'raw-tcp') {
    const socket = net.createConnection({ port: PORT, host: '127.0.0.1' });
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    socket.write(`GET /api/learners HTTP/1.1\r\nHost: localhost:${PORT}\r\n`);
    return () => socket.destroy();
  }
  const ws = new WebSocket(`ws://localhost:${PORT}/api/voice/tts`, { headers: { Origin: `http://localhost:${PORT}` } });
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type: 'session-start', sessionId: 'shutdown-smoke' }));
  return () => ws.terminate();
}

async function run(scenario: Scenario): Promise<void> {
  if (listenerPid() !== null) throw new Error(`port ${PORT} is already in use`);
  const db = path.join(tmpdir(), `eduagent-shutdown-${scenario}-${process.pid}.db`);
  const logFile = path.join(tmpdir(), `eduagent-shutdown-${scenario}-${process.pid}.log`);
  const child = spawn(process.execPath, [TSX, 'server.ts'], {
    cwd: ROOT,
    env: { ...process.env, VOICE_MOCK: 'true', PORT: String(PORT), DATABASE_PATH: db },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  let cleanup = () => {};
  try {
    await ready();
    const pid = listenerPid();
    if (pid === null) throw new Error('server listener disappeared before the probe');
    const response = await fetch(`http://localhost:${PORT}/api/learners`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://localhost:${PORT}` },
      body: JSON.stringify({ name: `shutdown-${scenario}` }),
    });
    if (!response.ok) throw new Error(`learner write failed: ${response.status}`);
    cleanup = await openResource(scenario);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const before = walSize(`${db}-wal`);
    if (before === 'removed' || before === 0) throw new Error('probe did not create a WAL');
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    const started = Date.now();
    process.kill(pid, 'SIGTERM');
    const result = await Promise.race([
      exited,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('server exit timed out')), 3000)),
    ]);
    const elapsedMs = Date.now() - started;
    const after = walSize(`${db}-wal`);
    writeFileSync(logFile, output);
    const lines = output.split('\n').filter((line) => /Shutdown (requested|complete|deadline)|Failed to/.test(line));
    console.log(`[shutdown-smoke] ${scenario}: elapsed=${elapsedMs}ms exit=${result.code} signal=${result.signal} wal=${before}->${after}`);
    for (const line of lines) console.log(`[shutdown-smoke] ${line}`);
    if (result.code !== 0 || result.signal !== null || elapsedMs > 1500) throw new Error('shutdown did not exit cleanly within 1.5s');
    if (after !== 'removed' && after !== 0) throw new Error('WAL was not truncated');
    if (!output.includes('Shutdown requested') || !output.includes('Shutdown complete') || output.includes('Failed to')) throw new Error('shutdown logs are incomplete');
  } finally {
    cleanup();
    const pid = listenerPid();
    if (pid !== null) process.kill(pid, 'SIGTERM');
    writeFileSync(logFile, output);
  }
}

async function main(): Promise<void> {
  for (const scenario of ['idle', 'raw-tcp', 'websocket'] as Scenario[]) await run(scenario);
  console.log('[shutdown-smoke] ALL PASS (3/3); Realtime SSE not probed here (requires a browser WebRTC call setup)');
}

main().catch((error) => { console.error('[shutdown-smoke] FAIL', error); process.exit(1); });

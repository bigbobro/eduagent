// Exercise app:dev itself, including both owned process trees and loopback server.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electronExecutable from 'electron';
import { _electron } from 'playwright-core';

const dir = mkdtempSync(join(tmpdir(), 'eduagent-dev-e2e-'));
const zoomDir = mkdtempSync(join(tmpdir(), 'eduagent-dev-zoom-e2e-'));
let zoomApp;
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
let origin;
try {
  const deadline = Date.now() + 60000;
  let log = '';
  while (Date.now() < deadline) {
    try { log = readFileSync(join(dir, 'logs/server.log'), 'utf8'); } catch {}
    if (log.includes('dev window loaded origin=') && output.includes('Server listening')) break;
    if (command.exitCode !== null) throw new Error(`dev launcher exited ${command.exitCode}`);
    await delay(200);
  }
  origin = /local origin=(http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
  if (!origin || !log.includes('dev window loaded origin=')) throw new Error('Electron did not finish loading the development origin');
  const response = await fetch(`${origin}/api/courses`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok || (await response.json()).length === 0) throw new Error('dev server did not return courses');
  if (log.includes('server spawned')) throw new Error('dev mode started a staged server');
  console.log('[dev-e2e] PASS app:dev launches pnpm dev and Electron targets the live loopback server');

  // A second isolated profile targets the launcher's existing server; it starts no server of its own.
  // Playwright's main-process handle lets us measure the real window's zoom policy without exposing IPC.
  zoomApp = await _electron.launch({ executablePath: electronExecutable, args: ['desktop'],
    env: { ...process.env, VOICE_MOCK: 'true', EDUAGENT_TEST: '1', EDUAGENT_TEST_MIC_STATUS: 'granted', EDUAGENT_USER_DATA: zoomDir, EDUAGENT_DEV_URL: origin }, timeout: 60000 });
  const page = await zoomApp.firstWindow();
  await page.waitForURL(new RegExp(`^${origin}/`), { timeout: 60000 });
  await page.waitForLoadState('load');
  const factor = () => zoomApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());
  const pinch = (scaleFactor) => zoomApp.evaluate(async ({ BrowserWindow }, scaleFactor) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
    // mouse source synthesizes a touchpad pinch in Chromium; the positive control below proves delivery.
    await contents.debugger.sendCommand('Input.synthesizePinchGesture', { x: 400, y: 300, scaleFactor, relativeSpeed: 800, gestureSourceType: 'mouse' });
    return contents.executeJavaScript('visualViewport.scale');
  }, scaleFactor);
  const isOne = value => Math.abs(value - 1) < 0.00001;
  const up = await pinch(2); const down = await pinch(0.5);
  if (!isOne(up) || !isOne(down) || !isOne(await factor())) throw new Error(`startup zoom unlocked: ${JSON.stringify({ up, down, factor: await factor() })}`);
  console.log(`[dev-e2e] PASS startup pinch in/out stays at 1 (up=${up}, down=${down})`);

  await zoomApp.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    app.focus({ steal: true }); window.show(); window.focus(); window.webContents.focus();
    globalThis.__eduagentZoomInputs = [];
    BrowserWindow.getAllWindows()[0].webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && (input.meta || input.control) && ['+', '=', '-', '0'].includes(input.key)) {
        globalThis.__eduagentZoomInputs.push({ key: input.key, prevented: event.defaultPrevented });
      }
    });
  });
  const chords = [['=', ['meta']], ['+', ['meta', 'shift']], ['-', ['meta']], ['0', ['meta']],
    ['=', ['control']], ['+', ['control', 'shift']], ['-', ['control']], ['0', ['control']]];
  // CDP keyboard dispatch skips Electron's before-input-event; use its native input path instead.
  await zoomApp.evaluate(({ BrowserWindow }, chords) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    for (const [keyCode, modifiers] of chords) {
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    }
  }, chords);
  const keys = await zoomApp.evaluate(() => globalThis.__eduagentZoomInputs);
  if (keys.length !== chords.length || keys.some(input => !input.prevented) || !isOne(await factor())) throw new Error(`zoom shortcut blocking failed: ${JSON.stringify(keys)}`);
  console.log(`[dev-e2e] PASS all ${keys.length} Cmd/Ctrl zoom shortcuts are prevented and zoom factor stays 1`);

  await zoomApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.5));
  if (Math.abs(await factor() - 1.5) > 0.00001) throw new Error('layout zoom positive control did not change the factor');
  await page.reload();
  const reloadedUp = await pinch(2); const reloadedDown = await pinch(0.5); const reloadedFactor = await factor();
  if (!isOne(reloadedUp) || !isOne(reloadedDown) || !isOne(reloadedFactor)) throw new Error(`navigation zoom policy failed: ${JSON.stringify({ reloadedUp, reloadedDown, reloadedFactor })}`);
  console.log(`[dev-e2e] PASS navigation keeps pinch and restores zoom factor to 1 (up=${reloadedUp}, down=${reloadedDown}, factor=${reloadedFactor})`);

  // Permit pinch as a positive control, then restore the policy even if the check fails.
  try {
    await zoomApp.evaluate(async ({ BrowserWindow }) => { await BrowserWindow.getAllWindows()[0].webContents.setVisualZoomLevelLimits(0.5, 3); });
    const enabled = await pinch(2);
    if (enabled < 1.5) throw new Error(`pinch positive control did not zoom: ${enabled}`);
    console.log(`[dev-e2e] PASS pinch positive control zooms (scale=${enabled})`);
  } finally {
    await zoomApp.evaluate(async ({ BrowserWindow }) => { await BrowserWindow.getAllWindows()[0].webContents.setVisualZoomLevelLimits(1, 1); });
  }
  const restoredUp = await pinch(2); const restoredDown = await pinch(0.5);
  if (!isOne(restoredUp) || !isOne(restoredDown)) throw new Error(`pinch policy not restored: ${JSON.stringify({ restoredUp, restoredDown })}`);
  console.log(`[dev-e2e] PASS positive control restored pinch limits (up=${restoredUp}, down=${restoredDown})`);
  await zoomApp.close(); zoomApp = null;
  command.kill('SIGTERM');
  await Promise.race([exited, delay(10000).then(() => { throw new Error('dev launcher did not exit'); })]);
} catch (err) { console.error('[dev-e2e] FAIL', err, output); code = 1; }
finally {
  if (zoomApp) {
    try { await zoomApp.close(); }
    catch (error) {
      console.error('[dev-e2e] FAIL closing zoom app', error); code = 1;
      const process = zoomApp.process();
      const stopped = process.exitCode !== null || process.signalCode !== null ? Promise.resolve() : new Promise((resolve) => process.once('exit', resolve));
      process.kill('SIGKILL');
      try { await Promise.race([stopped, delay(10000).then(() => { throw new Error('zoom app cleanup timed out'); })]); }
      catch (cleanupError) { console.error('[dev-e2e] FAIL', cleanupError); }
    }
  }
  if (command.exitCode === null) {
    command.kill('SIGTERM');
    try { await Promise.race([exited, delay(10000).then(() => { throw new Error('dev launcher cleanup timed out'); })]); }
    catch (error) { console.error('[dev-e2e] FAIL', error); code = 1; }
  }
  if (origin) {
    await delay(300);
    let stillListening = false;
    try { await fetch(`${origin}/api/courses`, { signal: AbortSignal.timeout(1000) }); stillListening = true; } catch {}
    if (stillListening) { console.error('[dev-e2e] FAIL dev server remained after launcher exit'); code = 1; }
    else console.log('[dev-e2e] PASS quitting the launcher removes the dev server');
  }
  rmSync(dir, { recursive: true, force: true }); rmSync(zoomDir, { recursive: true, force: true });
}
process.exitCode = code;

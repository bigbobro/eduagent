/** Browser integration with actual fake-media capture/playback. Provider mode is explicit. */
import { chromium, _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
const electronExecutable = createRequire(import.meta.url)('electron') as string;
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { animalsCourse } from '../src/data/courses/animals';
const args = process.argv.slice(2);
function option(name: string, fallback: string) { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; }
const base = option('--base', 'http://localhost:3018');
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Loopback test server required');
if (!args.includes('--live') && !args.includes('--mock')) throw new Error('Choose --live or --mock explicitly');
if (args.includes('--full') && !args.includes('--mock')) throw new Error('Full browser loop uses controlled offline provider; real teaching quality has its separate API smoke');
const out = path.resolve(option('--out', mkdtempSync(path.join(tmpdir(), 'eduagent-realtime-browser-')))); mkdirSync(out, { recursive: true });
async function main() {
  const settings = await (await fetch(`${base}/api/settings`)).json();
  if (Boolean(settings.mock) !== args.includes('--mock')) throw new Error('Server provider mode differs from requested smoke');
  const learnerResponse = await fetch(`${base}/api/learners`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Realtime 页面验证' }) });
  if (!learnerResponse.ok) throw new Error('Could not create test child');
  const learner = await learnerResponse.json();
  const desktop = args.includes('--electron-dev') ? await electron.launch({ executablePath: electronExecutable, args: ['desktop'], env: { ...process.env, EDUAGENT_DEV_URL: base, EDUAGENT_USER_DATA: mkdtempSync(path.join(tmpdir(), 'eduagent-realtime-electron-')), EDUAGENT_TEST: '1', EDUAGENT_TEST_MIC_STATUS: 'granted' } }) : null;
  const browser = desktop ? null : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve('tests/fixtures/audio/animals_cat.wav')}`] });
  const events: object[] = []; const errors: string[] = [];
  let quizId: string | undefined; let maxUploadBytes = 0;
  try {
    const context = desktop ? desktop.context() : await browser!.newContext({ permissions: ['microphone'], viewport: { width: 1100, height: 720 } });
    const page = desktop ? await desktop.firstWindow() : await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (req) => {
      if (!req.url().includes('/api/')) return;
      if (req.url().endsWith('/api/realtime')) {
        const body = req.postDataJSON();
        if (body.intent?.kind === 'audio') maxUploadBytes = Math.max(maxUploadBytes, req.postDataBuffer()?.byteLength ?? 0);
        events.push({ action: body.action, intent: body.intent?.kind, targetId: body.intent?.targetId, quizId: body.intent?.quizId });
        if (body.intent?.kind === 'present-quiz') quizId = body.intent.quizId;
      } else if (/\/api\/(chat|voice\/)/.test(req.url())) throw new Error('Realtime used a legacy voice/model endpoint');
    });
    await page.addInitScript(() => {
      const tracks: MediaStreamTrack[] = []; (window as unknown as { __smokeTracks: MediaStreamTrack[] }).__smokeTracks = tracks;
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (options) => { const stream = await original(options); tracks.push(...stream.getTracks()); return stream; };
    });
    await page.goto(`${base}/lesson/animals?learnerId=${learner.id}`);
    await page.getByLabel('课堂模式').selectOption('realtime');
    await page.screenshot({ path: path.join(out, 'before-start.png') });
    await page.getByRole('button', { name: '我们开始吧' }).click();
    const pill = page.getByRole('button', { name: '按住空格说话' });
    const ready = async () => {
      await pill.waitFor({ state: 'visible', timeout: 90000 });
      await page.waitForFunction(() => { const button = document.querySelector('button[aria-label="按住空格说话"]') as HTMLButtonElement | null; return Boolean(button && !button.disabled); }, undefined, { timeout: 90000 });
    };
    const speak = async () => {
      await ready(); await page.keyboard.down('Space');
      await page.waitForSelector('[data-picture-card-state="recording"]', { timeout: 5000 });
      await page.waitForTimeout(Number(option('--hold-ms', args.includes('--mock') ? '450' : '1800')));
      if (!await page.locator('[data-picture-card-state="recording"]').count()) throw new Error('Recording stopped before release');
      const answer = page.waitForResponse((response) => response.url().endsWith('/api/realtime') && response.request().postDataJSON()?.intent?.kind === 'audio');
      await page.keyboard.up('Space');
      await (await answer).finished();
      await page.waitForFunction(() => {
        const pill = document.querySelector('button[aria-label="按住空格说话"]') as HTMLButtonElement | null;
        return Boolean(pill && !pill.disabled || document.querySelector('.p2-options button:not(:disabled)') || document.querySelector('.done-page'));
      }, undefined, { timeout: 90000 });
    };
    await ready(); await page.screenshot({ path: path.join(out, 'interactive.png') });
    await speak();
    if (Number(option('--hold-ms', args.includes('--mock') ? '450' : '1800')) >= 1500 && maxUploadBytes <= 65536) throw new Error('Long recording did not exercise a body over 64KiB');
    if (args.includes('--full')) {
      for (let i = 0; i < 45; i++) {
        if (await page.getByText('课堂完成', { exact: true }).count()) break;
        const choices = page.locator('.p2-options button');
        if (await choices.count()) {
          const quiz = animalsCourse.phases.reinforcement.quizzes.find((q) => q.id === quizId);
          if (!quiz || quiz.type !== 'pick-word') throw new Error('Displayed quiz did not match actual intent');
          const card = animalsCourse.cards.find((c) => c.id === quiz.correctCardId)!;
          const choice = page.getByRole('button', { name: `${card.english} ${card.chinese}`, exact: true });
          await choice.waitFor(); await page.waitForFunction((label) => !(Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label) as HTMLButtonElement)?.disabled, `${card.english} ${card.chinese}`);
          await choice.click();
        } else if (await pill.count()) await speak();
        await page.waitForTimeout(350);
      }
      await page.getByText('课堂完成', { exact: true }).waitFor({ timeout: 10000 });
    } else {
      await ready();
      await page.getByText(/模型听到/).first().waitFor({ timeout: 5000 });
    }
    await page.screenshot({ path: path.join(out, args.includes('--full') ? 'done.png' : 'after-answer.png') });
    const progress = await (await fetch(`${base}/api/progress?learnerId=${learner.id}`)).json();
    const course = progress.courses.find((c: { courseId: string }) => c.courseId === 'animals');
    if (args.includes('--full') ? !course.completed : course.words.find((w: { word: string }) => w.word === 'cat')?.attempts !== 1) throw new Error('Persisted course progress did not match the page path');
    const end = page.waitForResponse((response) => response.url().endsWith('/api/realtime') && response.request().postDataJSON()?.action === 'end');
    await page.getByRole('button', { name: '下课', exact: true }).click();
    const ended = await end; await ended.finished(); if (!ended.ok()) throw new Error('Remote classroom did not close cleanly');
    await page.waitForURL(`${base}/`);
    const trackCount = await page.evaluate(() => (window as unknown as { __smokeTracks: MediaStreamTrack[] }).__smokeTracks.length);
    if (trackCount !== 1) throw new Error('Expected one microphone capture for the classroom');
    await page.waitForFunction(() => (window as unknown as { __smokeTracks: MediaStreamTrack[] }).__smokeTracks.every((track) => track.readyState === 'ended'));
    if (errors.length) throw new Error(`Page runtime errors: ${errors.join('; ')}`);
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ provider: settings.mock ? 'mock' : 'live', learnerId: learner.id, full: args.includes('--full'), electronDevelopment: Boolean(desktop), trackCount, maxUploadBytes, events, progress: course, errors, microphoneStopped: true }, null, 2));
    console.log(`[realtime browser] passed; evidence ${out}`);
  } finally { await desktop?.close(); await browser?.close(); }
}
main().catch((error) => { console.error(`[realtime browser] ${(error as Error).message}`); process.exitCode = 1; });

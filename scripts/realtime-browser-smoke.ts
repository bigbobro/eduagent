/** Natural Realtime classroom in a real page. Provider mode is explicit; --live spends real API tokens on a caller-owned test server. */
import { chromium, _electron as electron, type Page } from 'playwright-core';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getCourseById } from '../src/data/courses';
import type { Course } from '../src/types/course';
const electronExecutable = createRequire(import.meta.url)('electron') as string;
const args = process.argv.slice(2);
function option(name: string, fallback: string) { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; }
const base = option('--base', 'http://localhost:3018');
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Loopback test server required');
const live = args.includes('--live');
if (live === args.includes('--mock')) throw new Error('Choose --live or --mock explicitly');
const course = getCourseById(option('--course', 'animals')) as Course;
if (!course) throw new Error('Unknown course');
const out = path.resolve(option('--out', mkdtempSync(path.join(tmpdir(), 'eduagent-realtime-browser-')))); mkdirSync(out, { recursive: true });
const log = (message: string) => console.log(`[realtime browser ${new Date().toISOString().slice(11, 23)}] ${message}`);

/** Synthetic adult speech as 24 kHz mono WAV; not child pronunciation evidence. */
function clip(name: string, text: string, voice: 'Samantha' | 'Tingting'): string {
  const file = path.join(out, `${name}.wav`);
  if (!existsSync(file)) {
    const aiff = path.join(out, `${name}.aiff`);
    execFileSync('say', ['-v', voice, '-o', aiff, text]); execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@24000', '-c', '1', aiff, file]);
  }
  return readFileSync(file).toString('base64');
}
function wordClip(cardId: string): string {
  const fixture = `tests/fixtures/audio/${course.id}_${cardId}.wav`;
  if (existsSync(fixture)) return readFileSync(fixture).toString('base64');
  const card = course.cards.find((c) => c.id === cardId)!;
  return clip(`word_${cardId}`, card.english, 'Samantha');
}

async function main() {
  const settings = await (await fetch(`${base}/api/settings`)).json();
  if (Boolean(settings.mock) !== !live) throw new Error('Server provider mode differs from requested smoke');
  const learner = await (await fetch(`${base}/api/learners`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Realtime 自然对话验证' }) })).json();
  if (!learner.id) throw new Error('Could not create test child');
  if (args.includes('--resume-short')) seedShortResume(learner.id);
  const desktop = args.includes('--electron-dev') ? await electron.launch({ executablePath: electronExecutable, args: ['desktop'], env: { ...process.env, EDUAGENT_DEV_URL: base, EDUAGENT_USER_DATA: mkdtempSync(path.join(tmpdir(), 'eduagent-realtime-electron-')), EDUAGENT_TEST: '1', EDUAGENT_TEST_MIC_STATUS: 'granted' } }) : null;
  const browser = desktop ? null : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    // Timer-driven fake audio sink: some hosts' real output device never advances automated AudioContext clocks.
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-audio-output'] });
  const results: Record<string, unknown> = { provider: live ? 'live' : 'mock', course: course.id, learnerId: learner.id, scope: 'real page, synthetic adult speech; not child pronunciation or physical speaker/microphone acceptance' };
  const errors: string[] = []; const requests: object[] = [];
  let sessionId = ''; let quizId = ''; let endStatus = 0;
  try {
    const context = desktop ? desktop.context() : await browser!.newContext({ permissions: ['microphone'], viewport: { width: 1100, height: 720 } });
    const page = desktop ? await desktop.firstWindow() : await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (req) => {
      if (!req.url().includes('/api/')) return;
      if (/\/api\/(chat|voice\/)/.test(req.url())) errors.push('Realtime used a legacy voice/model endpoint');
      if (!req.url().endsWith('/api/realtime')) return;
      const body = req.postDataJSON();
      if (body.action === 'present-quiz') quizId = body.quizId;
      if (body.action !== 'presented') requests.push({ action: body.action, quizId: body.quizId, target: body.target });
    });
    page.on('response', async (response) => {
      if (!response.url().endsWith('/api/realtime')) return;
      const body = response.request().postDataJSON();
      if (body.action === 'start') sessionId = (await response.json().catch(() => ({}))).sessionId ?? '';
      if (body.action === 'end') endStatus = response.status();
    });
    await page.addInitScript(({ generator }) => {
      const w = window as unknown as Record<string, unknown>;
      const tracks: MediaStreamTrack[] = []; w.__smokeTracks = tracks;
      const timeline: Array<{ t: number; state: string }> = []; w.__timeline = timeline;
      new MutationObserver(() => {
        const state = document.querySelector('[data-conversation-state]')?.getAttribute('data-conversation-state');
        if (state && timeline.at(-1)?.state !== state) timeline.push({ t: Date.now(), state });
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-conversation-state'] });
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (options) => {
        if (!generator) { const stream = await original(options); tracks.push(...stream.getTracks()); return stream; }
        // Inject speech on demand by writing PCM frames straight into the WebRTC track; no audio device involved.
        const Generator = (window as unknown as { MediaStreamTrackGenerator: new (o: { kind: string }) => MediaStreamTrack & { writable: WritableStream } }).MediaStreamTrackGenerator;
        const AudioDataCtor = (window as unknown as { AudioData: new (o: object) => unknown }).AudioData;
        const track = new Generator({ kind: 'audio' }); const writer = track.writable.getWriter();
        let queue = new Float32Array(0); let timestamp = 0;
        const timer = setInterval(() => {
          if (track.readyState === 'ended') { clearInterval(timer); return; }
          for (let n = 0; n < 2; n++) {
            const frame = new Float32Array(480); frame.set(queue.subarray(0, 480)); queue = queue.subarray(Math.min(480, queue.length));
            void writer.write(new AudioDataCtor({ format: 'f32', sampleRate: 48000, numberOfFrames: 480, numberOfChannels: 1, timestamp, data: frame })).catch(() => {});
            timestamp += 10000;
          }
        }, 20);
        w.__speak = async (base64: string) => {
          const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)); const view = new DataView(raw.buffer);
          const rate = view.getUint32(24, true); let offset = 12;
          while (view.getUint32(offset, false) !== 0x64617461) offset += 8 + view.getUint32(offset + 4, true);
          const count = view.getUint32(offset + 4, true) / 2; const samples = new Float32Array(Math.floor(count * 48000 / rate));
          for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(offset + 8 + 2 * Math.floor(i * rate / 48000), true) / 32768;
          const next = new Float32Array(queue.length + samples.length); next.set(queue); next.set(samples, queue.length); queue = next;
          await new Promise((resolve) => setTimeout(resolve, samples.length / 48 + 50));
        };
        tracks.push(track);
        return new MediaStream([track]);
      };
    }, { generator: live });
    // The desktop shell may still be finishing its own first navigation; retry once if it aborts ours.
    if (desktop) await page.waitForLoadState('load').catch(() => {});
    await page.goto(`${base}/lesson/${course.id}?learnerId=${learner.id}`).catch(async (error) => {
      if (!desktop || !String(error).includes('ERR_ABORTED')) throw error;
      await page.waitForTimeout(1000); await page.goto(`${base}/lesson/${course.id}?learnerId=${learner.id}`);
    });
    await page.getByRole('radio', { name: /Realtime/ }).click();
    await page.getByRole('button', { name: '我们开始吧' }).click();
    const dock = page.getByRole('status', { name: '对话状态' });
    await dock.waitFor({ timeout: 60000 });
    if (await page.getByRole('button', { name: '按住空格说话' }).count()) throw new Error('Conversation classroom still shows push-to-talk');
    await page.screenshot({ path: path.join(out, 'interactive.png') });
    const state = async () => (await page.locator('[data-conversation-state]').first().getAttribute('data-conversation-state').catch(() => null)) ?? 'none';
    const until = async (label: string, check: () => Promise<boolean>, ms: number) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) { if (await check()) { log(label); return; } await page.waitForTimeout(100); }
      throw new Error(`Timed out: ${label}`);
    };
    const quiet = async (label: string, ms = 60000) => {
      let since = Date.now(); const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (await page.getByText('课堂完成', { exact: true }).count()) return;
        if (await state() !== 'awaiting') since = Date.now();
        if (Date.now() - since > 1500) { log(`quiet: ${label}`); return; }
        await page.waitForTimeout(100);
      }
      throw new Error(`Never quiet: ${label}`);
    };
    const hero = async () => (await page.locator('[data-picture-card-size="hero"] .p2-word, [data-picture-card-size="hero"] .p2-sent').first().textContent({ timeout: 1000 }).catch(() => null))?.trim() ?? null;
    const words = async () => {
      const progress = await (await fetch(`${base}/api/progress?learnerId=${learner.id}`)).json();
      const entry = progress.courses.find((c: { courseId: string }) => c.courseId === course.id);
      return { completed: Boolean(entry?.completed), attempts: Object.fromEntries((entry?.words ?? []).map((w: { word: string; attempts: number }) => [w.word, w.attempts])) as Record<string, number> };
    };
    const speak = async (utterance: { kind: 'attempt' } | { kind: 'request'; cardId: string } | { kind: 'chat' }, audio: string) => {
      if (!live) {
        const response = await fetch(`${base}/api/realtime`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mock-speech', sessionId, learnerId: learner.id, utterance }) });
        if (!response.ok) throw new Error(`mock speech HTTP ${response.status}`);
      } else await page.evaluate((data) => (window as unknown as { __speak: (b: string) => Promise<void> }).__speak(data), audio);
    };
    const cardOf = (english: string | null) => course.cards.find((c) => c.english === english);

    // Card switch on request, with no attempt counted for the interrupted card.
    if (live) {
      // The opening can finish before polling starts; then ask for a repeat so there is speech to interrupt.
      await until('teacher speaking', async () => await state() === 'speaking', 15000).catch(async () => {
        await quiet('opening finished early');
        await speak({ kind: 'chat' }, clip('again', '再讲一遍好吗', 'Tingting'));
        await until('teacher speaking again', async () => await state() === 'speaking', 20000);
      });
    } else await quiet('opening');
    const first = cardOf(await hero()); if (!first) throw new Error('No displayed card');
    const other = course.cards.find((c) => c.kind === 'word' && c.id !== first.id)!;
    if (live) await page.waitForTimeout(1200);
    const switchStart = Date.now();
    await speak({ kind: 'request', cardId: other.id }, clip(`request_${other.id}`, `${other.chinese}那个再讲一下`, 'Tingting'));
    await until(`card switched to ${other.english}`, async () => await hero() === other.english, 30000);
    results.requestSwitchMs = Date.now() - switchStart;
    if ((await words()).attempts[first.english]) throw new Error('A review request was counted as an attempt');
    await page.screenshot({ path: path.join(out, 'requested-card.png') });
    await quiet('after switch');

    if (live && !args.includes('--resume-short')) {
      // Real attempt at the displayed target is assessed and saved.
      await speak({ kind: 'attempt' }, wordClip(other.id));
      await until('attempt saved', async () => ((await words()).attempts[other.english] ?? 0) >= 1, 30000);
      await quiet('after attempt');
      // A request for slower speech is answered but never counted.
      const attemptsBefore = (await words()).attempts;
      await speak({ kind: 'chat' }, clip('slower', '慢一点好吗', 'Tingting'));
      await until('reply to slower request', async () => ['thinking', 'speaking'].includes(await state()), 15000);
      await quiet('after slower');
      if (JSON.stringify((await words()).attempts) !== JSON.stringify(attemptsBefore)) throw new Error('A request was counted as an attempt');
      // Interrupt a long reply mid-playback.
      await speak({ kind: 'chat' }, clip('longer', '请把这个词讲长一点，多讲几句', 'Tingting'));
      await until('long reply playing', async () => await state() === 'speaking', 20000);
      await page.waitForTimeout(1500);
      const marks = async () => ((await page.locator('.p2-msgs').textContent()) ?? '').split('…').length;
      const before = await marks();
      const interruptAt = Date.now();
      await speak({ kind: 'chat' }, clip('stop', '等一下，停一下', 'Tingting'));
      // The provider clears unplayed audio of the playing reply; its subtitle is marked as cut off.
      await until('long reply interrupted', async () => await marks() > before, 15000);
      results.interruptClearedMs = Date.now() - interruptAt;
      await quiet('after interruption');
      // Pause while the teacher speaks: playback is cleared, nothing new is said until resume.
      await speak({ kind: 'chat' }, clip('again', '再讲一遍好吗', 'Tingting'));
      await until('teacher speaking before pause', async () => await state() === 'speaking', 20000);
      const pausedMarks = await marks();
      await page.getByRole('button', { name: '暂停麦克风' }).click();
      await until('paused and playback cleared', async () => await state() === 'paused' && await marks() > pausedMarks, 10000);
      await page.waitForTimeout(3000);
      if (await state() !== 'paused') throw new Error('Teacher continued while paused');
      await page.getByRole('button', { name: '继续说话' }).click();
      await until('resumed listening', async () => ['awaiting', 'thinking', 'speaking'].includes(await state()), 5000);
      await quiet('after resume');
      results.timeline = await page.evaluate(() => (window as unknown as { __timeline: unknown }).__timeline);
    }
    const loops = Number(option('--attempt-loop', '0'));
    for (let i = 0; i < loops; i++) {
      // Experiment: repeated real attempts at whatever card is displayed, to observe tool-first order.
      const card = cardOf(await hero()); if (!card) break;
      await speak({ kind: 'attempt' }, wordClip(card.id));
      await page.waitForTimeout(800); await quiet(`attempt loop ${i + 1}`);
    }
    if (loops) results.subtitles = await page.locator('.p2-message').allTextContents();
    if (args.includes('--full')) {
      for (let i = 0; i < 80; i++) {
        if (await page.getByText('课堂完成', { exact: true }).count()) break;
        const choices = page.locator('.p2-options button');
        if (await choices.count()) {
          await until('quiz prompt finished', async () => Boolean(quizId) && !(await choices.first().isDisabled()), 40000);
          const quiz = course.phases.reinforcement.quizzes.find((q) => q.id === quizId);
          if (!quiz || quiz.type !== 'pick-word') throw new Error('Displayed quiz did not match actual intent');
          const card = course.cards.find((c) => c.id === quiz.correctCardId)!;
          await page.getByRole('button', { name: `${card.english} ${card.chinese}`, exact: true }).click();
          await page.waitForTimeout(500); await quiet('after pick');
          continue;
        }
        const shown = await hero();
        const sentence = course.phases.reinforcement.quizzes.flatMap((q) => q.type === 'repeat-after-me' && q.targetText === shown ? [q] : [])[0];
        const card = cardOf(shown);
        if (!sentence && !card) { await page.waitForTimeout(300); continue; }
        await quiet('before answer');
        if (await hero() !== shown) continue;
        await speak({ kind: 'attempt' }, sentence ? clip(`sentence_${sentence.id}`, sentence.targetText, 'Samantha') : wordClip(card!.id));
        await page.waitForTimeout(800); await quiet('after answer');
      }
      await page.getByText('课堂完成', { exact: true }).waitFor({ timeout: 30000 });
      await page.screenshot({ path: path.join(out, 'done.png') });
      if (!(await words()).completed) throw new Error('Course not saved as completed');
      // The classroom ends its own call after the goodbye; the page keeps the done view.
      await until('call ended after completion', async () => endStatus === 200, 30000);
    } else {
      const end = page.waitForResponse((response) => response.url().endsWith('/api/realtime') && response.request().postDataJSON()?.action === 'end');
      await page.getByRole('button', { name: '下课', exact: true }).click();
      if (!(await end).ok()) throw new Error('Remote classroom did not close cleanly');
    }
    const trackCount = await page.evaluate(() => (window as unknown as { __smokeTracks: MediaStreamTrack[] }).__smokeTracks.length);
    if (trackCount !== 1) throw new Error(`Expected one microphone capture, got ${trackCount}`);
    await page.waitForFunction(() => (window as unknown as { __smokeTracks: MediaStreamTrack[] }).__smokeTracks.every((track) => track.readyState === 'ended'), undefined, { timeout: 10000 });
    if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
    Object.assign(results, { sessionId, trackCount, microphoneStopped: true, requests, progress: await words() });
    log(`passed; evidence ${out}`);
  } finally {
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({ ...results, errors, sessionId }, null, 2));
    await desktop?.close(); await browser?.close();
  }
}

/** Short real lesson: checkpoint with all but two words and two questions done, written by the app's own persistence code. */
function seedShortResume(learnerId: string) {
  const db = option('--db', '');
  if (!db) throw new Error('--resume-short needs --db pointing at the test server database');
  execFileSync('pnpm', ['exec', 'tsx', 'scripts/realtime-seed-checkpoint.ts', course.id, learnerId], { env: { ...process.env, DATABASE_PATH: db }, stdio: 'inherit' });
}
main().catch((error) => { console.error(`[realtime browser] ${(error as Error).message}`); process.exitCode = 1; });

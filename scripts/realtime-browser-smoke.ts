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
// Experimental: needs a server started with REALTIME_TURN_MODE=manual. speak() then also sends the speech start/end signals.
const manualTurn = args.includes('--manual-turn');
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
  if (manualTurn && settings.realtimeTurnMode !== 'manual') throw new Error('--manual-turn needs the server started with REALTIME_TURN_MODE=manual');
  if (manualTurn && (args.includes('--sitting') || args.includes('--resume-short'))) throw new Error('--manual-turn does not combine with --sitting/--resume-short');
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
        if (await page.getByText('课堂完成', { exact: true }).count() || await page.getByText('进度已保存，下次继续', { exact: true }).count()) return;
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
    const signal = async (phase: 'start' | 'end') => {
      const response = await fetch(`${base}/api/realtime`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'speech', sessionId, learnerId: learner.id, phase }) });
      if (!response.ok) throw new Error(`speech ${phase} HTTP ${response.status}`);
    };
    // holdMs: how long the offline "child" talks (mock has no audio clip to take time); live speech lasts as long as the clip.
    const speak = async (utterance: { kind: 'attempt' } | { kind: 'request'; cardId: string } | { kind: 'chat' }, audio: string, holdMs = 100) => {
      if (manualTurn) {
        // The app owns turns: start right before the audio, end 150 ms after it (an ideal detector plus WebRTC transit, so the
        // tail reaches the provider before the commit). A real browser VAD reports the end later; Part B must budget for that.
        await signal('start');
        if (!live) {
          const response = await fetch(`${base}/api/realtime`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mock-speech', sessionId, learnerId: learner.id, utterance }) });
          if (!response.ok) throw new Error(`mock speech HTTP ${response.status}`);
          await page.waitForTimeout(holdMs);
        } else await page.evaluate((data) => (window as unknown as { __speak: (b: string) => Promise<void> }).__speak(data), audio);
        await page.waitForTimeout(150);
        await signal('end');
        return;
      }
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

    if (manualTurn) {
      // Experimental manual-turn scenario: a short echo must not cut the teacher off and is answered afterwards; sustained speech stops the teacher.
      const marks = async () => (await page.locator('.p2-message:not(.p2-me)').allTextContents()).filter((text) => /\s…$/.test(text)).length;
      const teacherLines = async () => page.locator('.p2-message:not(.p2-me)').count();
      const teacherSpeaking = async (label: string, ask: string) => {
        await until(`${label}: teacher speaking`, async () => await state() === 'speaking', 15000).catch(async () => {
          await quiet(`${label}: teacher quiet`);
          await speak({ kind: 'chat' }, clip(label, ask, 'Tingting'));
          await until(`${label}: teacher speaking after ask`, async () => await state() === 'speaking', 30000);
        });
      };
      const manual: Record<string, unknown> = {}; results.manualTurn = manual;
      // a. short echo while the teacher demonstrates
      await teacherSpeaking('echo-long', '请把这个词讲长一点，多讲几句');
      await page.waitForTimeout(1200);
      const echoCard = cardOf(await hero());
      const marksA = await marks(); const linesA = await teacherLines(); const echoAt = Date.now();
      // A child's echo is one quick word (~0.5 s); the course fixtures carry padding (~1.3 s), so synthesize it bare.
      const echoDone = echoCard ? speak({ kind: 'attempt' }, clip(`echo_${echoCard.id}`, echoCard.english, 'Samantha')) : speak({ kind: 'chat' }, clip('echo-fallback', '嗯', 'Tingting'));
      while (Date.now() - echoAt < 4000) {
        if (await marks() > marksA) throw new Error('A short echo cut the teacher off');
        await page.waitForTimeout(150);
      }
      await echoDone;
      log('short echo did not cut the teacher off');
      await until('echo answered', async () => await teacherLines() > linesA, 30000);
      manual.echoAnsweredMs = Date.now() - echoAt;
      await quiet('after echo');
      if (echoCard) manual.echoAttempts = (await words()).attempts[echoCard.english] ?? 0;
      // b. sustained speech stops the teacher
      await teacherSpeaking('interrupt-long', '请把这个词讲得更详细一点，多讲几句');
      await page.waitForTimeout(1500);
      const marksB = await marks(); const linesB = await teacherLines(); const stopAt = Date.now();
      const stopDone = speak({ kind: 'chat' }, clip('stop-long', '等一下，停一下，我有话想说，请你先别讲了，我想问一个问题', 'Tingting'), 3000);
      await until('long speech cut the teacher off', async () => await marks() > marksB, 4000);
      manual.interruptClearedMs = Date.now() - stopAt;
      await stopDone;
      await until('long speech answered', async () => await teacherLines() > linesB, 30000);
      manual.interruptAnsweredMs = Date.now() - stopAt;
      await quiet('after interruption');
      // c. a normal attempt while the teacher is quiet is saved
      const attemptCard = cardOf(await hero()); if (!attemptCard) throw new Error('No displayed card for the attempt');
      const before = (await words()).attempts[attemptCard.english] ?? 0; const attemptAt = Date.now();
      await speak({ kind: 'attempt' }, wordClip(attemptCard.id));
      await until('attempt saved', async () => ((await words()).attempts[attemptCard.english] ?? 0) > before, 30000);
      manual.attemptSavedMs = Date.now() - attemptAt;
      await quiet('after attempt');
      results.subtitles = await page.locator('.p2-message').allTextContents();
    }
    if (live && !manualTurn && !args.includes('--resume-short') && !args.includes('--sitting')) {
      // Real attempt at the displayed target is assessed and saved.
      await speak({ kind: 'attempt' }, wordClip(other.id));
      await until('attempt saved', async () => ((await words()).attempts[other.english] ?? 0) >= 1, 30000);
      await quiet('after attempt');
      // A cleared reply gets " …" appended to its subtitle; the model's own ellipses do not count.
      const marks = async () => (await page.locator('.p2-message:not(.p2-me)').allTextContents()).filter((text) => /\s…$/.test(text)).length;
      const teacherLines = async () => page.locator('.p2-message:not(.p2-me)').count();
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
      const before = await marks();
      const interruptAt = Date.now();
      await speak({ kind: 'chat' }, clip('stop', '等一下，停一下，我有话想说，请你先别讲了', 'Tingting'));
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
    const finishCourse = async () => {
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
    };
    const micReleased = async () => {
      const count = await page.evaluate(() => (window as unknown as { __smokeTracks: MediaStreamTrack[] }).__smokeTracks.length);
      if (count !== 1) throw new Error(`Expected one microphone capture, got ${count}`);
      await page.waitForFunction(() => (window as unknown as { __smokeTracks: MediaStreamTrack[] }).__smokeTracks.every((track) => track.readyState === 'ended'), undefined, { timeout: 10000 });
    };
    if (args.includes('--sitting')) {
      // Needs a server started with REALTIME_TEST_SITTING_MS=<wrapUpMs>,<goodbyeMs>: the first sitting is short.
      const ended = async () => await page.getByText('进度已保存，下次继续', { exact: true }).count() > 0;
      if (live) {
        // Keep answering whatever is displayed until the app ends the sitting; the subtitles are the wrap-up evidence.
        const deadline = Date.now() + 8 * 60_000;
        while (!(await ended()) && Date.now() < deadline) {
          await quiet('before sitting answer', 90000);
          if (await ended()) break;
          const card = cardOf(await hero());
          await speak(card ? { kind: 'attempt' } : { kind: 'chat' }, card ? wordClip(card.id) : clip('again', '再讲一遍好吗', 'Tingting'));
          await page.waitForTimeout(1500);
        }
        results.sittingSubtitles = await page.locator('.p2-message').allTextContents();
      } else {
        await speak({ kind: 'attempt' }, '');
        await until('attempt saved', async () => ((await words()).attempts[other.english] ?? 0) >= 1, 30000);
        // After the wrap-up note the offline model answers the next utterance with end_sitting (the tool path); chat until the app ends the sitting.
        const deadline = Date.now() + 60_000;
        while (!(await ended()) && Date.now() < deadline) {
          await quiet('before sitting chat', 30000);
          if (await ended()) break;
          await speak({ kind: 'chat' }, '');
          await page.waitForTimeout(1500);
        }
      }
      await page.getByText('进度已保存，下次继续', { exact: true }).waitFor({ timeout: 90000 });
      log('sitting end page shown');
      await page.screenshot({ path: path.join(out, 'sitting-ended.png') });
      if (await page.getByText('课堂完成', { exact: true }).count()) throw new Error('Sitting end page claims the course is complete');
      await until('call ended after sitting', async () => endStatus === 200, 30000);
      await micReleased();
      const afterFirst = await words();
      if (afterFirst.completed) throw new Error('Course completed in the first sitting');
      results.firstSitting = { attempts: afterFirst.attempts };
    }
    if (args.includes('--sitting') && !live) {
      // Come back: same course, same child, resumes from the checkpoint with the remaining work.
      endStatus = 0; sessionId = '';
      await page.goto(`${base}/lesson/${course.id}?learnerId=${learner.id}`);
      await page.getByRole('radio', { name: /Realtime/ }).click();
      await page.getByRole('button', { name: '我们开始吧' }).click();
      await dock.waitFor({ timeout: 60000 });
      await quiet('resumed opening');
      const resumedHero = await hero();
      if (resumedHero === other.english) throw new Error('Resumed on a word that was already passed');
      results.resumedAt = resumedHero;
      await page.screenshot({ path: path.join(out, 'resumed.png') });
    }
    if (args.includes('--full') || (args.includes('--sitting') && !live)) {
      await finishCourse();
    } else if (!args.includes('--sitting')) {
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

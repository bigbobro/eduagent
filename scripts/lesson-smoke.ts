// lesson-smoke.ts — validate the lesson path in two layers:
// 1) Open the real lesson page in Chrome and assert push-to-talk holds recording
//    for both pointer and Space interactions. Browser audio/voice transports are
//    mocked so this stays deterministic and does not need a real microphone.
// 2) Drive a full animals lesson via /api/chat to validate the teacher agent
//    state machine. This bypasses ASR by posting text directly to action=message.
//
// Usage: `pnpm smoke:lesson` (requires dev server already running on :3000)
//        SMOKE_BASE=http://localhost:3001 pnpm smoke:lesson  (alt port)
//
// Exit code 0 if all assertions pass, 1 on any failure or crash.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { getCourseById } from '../src/data/courses';
import type { WordCard } from '../src/types/course';

type PhaseName = 'intro' | 'interactive' | 'reinforcement' | 'done';

interface Step {
  kind: 'message' | 'phase';
  text?: string;
  to?: PhaseName;
  note: string;
  // Assertion: the LAST show_card emitted on THIS turn must equal this value.
  // null = don't care. The validator is intentionally loose for LLM nondeterminism.
  expectShowCard?: string | null;
}

// 10 fixture inputs covering the ASR text shapes seen in 2026-05-23 real tests.
// R-C (2-hit-clear, server-authoritative): each card needs 2 R2 literal hits to clear,
// then server advances on the 2nd hit turn.
const ANIMALS_SCRIPT: Step[] = [
  { kind: 'phase', to: 'interactive', note: 'enter interactive phase', expectShowCard: 'cat' },
  { kind: 'message', text: '这是猫。', note: '#1 CN-only — no R2 hit on cat, stay', expectShowCard: 'cat' },
  { kind: 'message', text: 'Cat.', note: '#2 R2 hit 1 on cat — stay (count=1)', expectShowCard: 'cat' },
  { kind: 'message', text: 'Cat.', note: '#3 R2 hit 2 — clear + advance to dog', expectShowCard: 'dog' },
  { kind: 'message', text: '狗狗。', note: '#4 CN-only — no R2 hit on dog, stay', expectShowCard: 'dog' },
  { kind: 'message', text: 'Dog.', note: '#5 R2 hit 1 on dog — stay', expectShowCard: 'dog' },
  { kind: 'message', text: 'Dog.', note: '#6 R2 hit 2 — advance to bird', expectShowCard: 'bird' },
  { kind: 'message', text: '他是 bird。', note: '#7 R2 hit 1 on bird (mixed CN-EN)', expectShowCard: 'bird' },
  { kind: 'message', text: 'Bird.', note: '#8 R2 hit 2 — advance to fish', expectShowCard: 'fish' },
  { kind: 'message', text: 'Kite.', note: '#9 no R2 hit on fish — stay', expectShowCard: 'fish' },
  { kind: 'message', text: 'I see a fish.', note: '#10 R2 hit 1 on fish — stay (count=1)', expectShowCard: 'fish' },
];

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
const COURSE_ID = process.env.SMOKE_COURSE || 'animals';
const COURSE = getCourseById(COURSE_ID);
const WORD_CARDS = (COURSE?.cards.filter((card) => card.kind === 'word') ?? []) as WordCard[];
const REPORT_DIR = path.resolve('docs/lesson-reports');
const CHROME_PATH = process.env.SMOKE_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface SseEvent { event: string; data: any; }
interface InteractionResult { name: string; pass: boolean; reason?: string; }

async function* parseSse(res: Response): AsyncGenerator<SseEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value);
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      if (!frame.trim()) continue;
      let evt = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) evt = line.slice(7).trim();
        else if (line.startsWith('data: ')) data = line.slice(6);
      }
      try { yield { event: evt, data: data ? JSON.parse(data) : {} }; } catch { /* skip */ }
    }
  }
}

interface TurnResult {
  speech: string;
  showCards: string[];
  errors: string[];
}

async function postChat(body: object): Promise<{ res: Response; sessionId: string | null }> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, sessionId: res.headers.get('X-Session-Id') };
}

async function collectTurn(res: Response): Promise<TurnResult> {
  let speech = '';
  const showCards: string[] = [];
  const errors: string[] = [];
  if (!res.ok) {
    errors.push(`HTTP ${res.status} ${res.statusText}`);
    return { speech, showCards, errors };
  }
  for await (const ev of parseSse(res)) {
    if (ev.event === 'speech-delta') speech += ev.data.text ?? '';
    if (ev.event === 'actions') {
      for (const a of ev.data.actions ?? []) {
        if (a.tool === 'show_card') showCards.push(a.params.card_id);
      }
    }
    if (ev.event === 'error') errors.push(ev.data.message ?? 'unknown');
  }
  return { speech: speech.replace(/\s+/g, ' ').trim(), showCards, errors };
}

function smokeSse(actions: Array<{ tool: string; params: Record<string, string> }> = [{ tool: 'show_card', params: { card_id: 'cat' } }]): string {
  return [
    'event: speech-delta\ndata: {"text":"好，我们开始。"}\n\n',
    `event: actions\ndata: ${JSON.stringify({ actions })}\n\n`,
    'event: progress_snapshot\ndata: {"clearedCardIds":[],"totalAttempts":0,"currentPhase":"interactive"}\n\n',
    'event: done\ndata: {}\n\n',
  ].join('');
}

async function installBrowserMocks(page: Page): Promise<void> {
  await page.route('**/api/chat', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}') as { action?: string };
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Session-Id': 'smoke-ui-session',
      },
      body: smokeSse(body.action === 'start' ? [{ tool: 'show_card', params: { card_id: 'cat' } }] : []),
    });
  });

  await page.addInitScript(() => {
    (window as any).__eduagentSmoke = { asrPcm: 0, asrControls: [] as string[] };

    class SmokeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 3;
      CONNECTING = 0;
      OPEN = 1;
      CLOSED = 3;
      readyState = 0;
      binaryType = 'arraybuffer';
      onopen: null | ((event: Event) => void) = null;
      onmessage: null | ((event: MessageEvent) => void) = null;
      onclose: null | ((event: Event) => void) = null;
      onerror: null | ((event: Event) => void) = null;

      constructor(private url: string) {
        setTimeout(() => {
          this.readyState = SmokeWebSocket.OPEN;
          this.onopen?.(new Event('open'));
        }, 0);
      }

      send(data: string | ArrayBuffer | Blob) {
        if (this.url.includes('/api/voice/asr')) {
          if (typeof data === 'string') {
            (window as any).__eduagentSmoke.asrControls.push(data);
          } else {
            (window as any).__eduagentSmoke.asrPcm += 1;
          }
          return;
        }

        if (!this.url.includes('/api/voice/tts') || typeof data !== 'string') return;
        let msg: any = {};
        try { msg = JSON.parse(data); } catch {}
        if (msg.type === 'session-start') this.emitJson({ type: 'session-started', sessionId: msg.sessionId });
        if (msg.type === 'text-chunk') this.emitJson({ type: 'subtitle', text: msg.text || '' });
        if (msg.type === 'session-finish') setTimeout(() => this.emitJson({ type: 'session-finished' }), 10);
      }

      close() {
        this.readyState = SmokeWebSocket.CLOSED;
        this.onclose?.(new Event('close'));
      }

      addEventListener(type: string, handler: EventListener) {
        (this as any)[`on${type}`] = handler;
      }

      removeEventListener(type: string, handler: EventListener) {
        if ((this as any)[`on${type}`] === handler) (this as any)[`on${type}`] = null;
      }

      private emitJson(payload: object) {
        setTimeout(() => {
          if (this.readyState !== SmokeWebSocket.OPEN) return;
          this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
        }, 0);
      }
    }

    (window as any).WebSocket = SmokeWebSocket;
  });
}

async function assertRecordingHeld(page: Page, name: string, start: () => Promise<void>, stop: () => Promise<void>): Promise<InteractionResult> {
  try {
    await page.evaluate(() => {
      (window as any).__eduagentSmoke.asrPcm = 0;
    });
    await start();
    await page.waitForSelector('[data-picture-card-size="hero"][data-picture-card-state="recording"]', { timeout: 3000 });
    await page.waitForTimeout(450);
    const stillRecording = await page.locator('[data-picture-card-size="hero"][data-picture-card-state="recording"]').count();
    const debugState = await page.evaluate(() => {
      const hero = document.querySelector('[data-picture-card-size="hero"]');
      const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('按住 Space')) as HTMLButtonElement | undefined;
      return {
        heroState: hero?.getAttribute('data-picture-card-state') ?? '(none)',
        buttonDisabled: Boolean(button?.disabled),
        text: document.body.textContent?.replace(/\s+/g, ' ').slice(0, 180) ?? '',
        asrPcm: (window as any).__eduagentSmoke.asrPcm,
        asrControls: (window as any).__eduagentSmoke.asrControls,
      };
    });
    await stop();
    if (stillRecording < 1) return { name, pass: false, reason: `recording state did not stay active while held: ${JSON.stringify(debugState)}` };
    return { name, pass: true };
  } catch (error) {
    try { await stop(); } catch {}
    return { name, pass: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function runPushToTalkSmoke(): Promise<InteractionResult[]> {
  if (!existsSync(CHROME_PATH)) {
    return [{ name: 'browser setup', pass: false, reason: `Chrome executable not found: ${CHROME_PATH}` }];
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    });
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    await installBrowserMocks(page);
    await page.goto(`${BASE}/lesson/${COURSE_ID}`);
    await page.getByRole('button', { name: /我们开始吧/ }).click();
    const button = page.getByRole('button', { name: /按住 Space 跟我读/ });
    await button.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => {
      const candidate = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('按住 Space'));
      return Boolean(candidate && !(candidate as HTMLButtonElement).disabled);
    }, undefined, { timeout: 10000 });

    const box = await button.boundingBox();
    if (!box) return [{ name: 'pointer hold', pass: false, reason: 'push-to-talk button has no bounding box' }];
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    const pointer = await assertRecordingHeld(
      page,
      'pointer hold',
      async () => {
        await page.mouse.move(x, y);
        await page.mouse.down();
      },
      async () => {
        await page.mouse.up();
      },
    );

    await page.waitForFunction(() => !document.querySelector('[data-picture-card-size="hero"][data-picture-card-state="recording"]'), undefined, { timeout: 3000 });

    const space = await assertRecordingHeld(
      page,
      'space hold',
      async () => {
        await page.keyboard.down('Space');
      },
      async () => {
        await page.keyboard.up('Space');
      },
    );

    return [pointer, space];
  } catch (error) {
    return [{ name: 'browser push-to-talk', pass: false, reason: error instanceof Error ? error.message : String(error) }];
  } finally {
    await browser?.close();
  }
}

interface StepResult {
  step: Step;
  turn: TurnResult;
  durationMs: number;
  pass: boolean;
  reasons: string[];
}

function validateStep(step: Step, turn: TurnResult): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (turn.errors.length) reasons.push(`errors: ${turn.errors.join(' | ')}`);
  if (turn.showCards.length === 0 && step.expectShowCard !== null && step.expectShowCard !== undefined) {
    reasons.push(`no show_card emitted, expected ${step.expectShowCard}`);
  }
  if (step.expectShowCard !== null && step.expectShowCard !== undefined) {
    const last = turn.showCards[turn.showCards.length - 1];
    // R-C 允许当前词的 sentence 兄弟卡收尾展示(sentence_<word>),不算错卡。
    if (last && last !== step.expectShowCard && last !== `sentence_${step.expectShowCard}`) {
      reasons.push(`last show_card=${last}, expected ${step.expectShowCard} (or its sentence_* sibling)`);
    }
  }
  const mismatch = validateSpeechMatchesShownCard(turn);
  if (mismatch) reasons.push(mismatch);
  return { pass: reasons.length === 0, reasons };
}

function validateSpeechMatchesShownCard(turn: TurnResult): string | null {
  const lastShowCard = turn.showCards[turn.showCards.length - 1];
  if (!lastShowCard || !turn.speech) return null;
  const shown = WORD_CARDS.find((card) => card.id === lastShowCard);
  if (!shown) return null;
  const mentionsShown = speechMentionsCard(turn.speech, shown);
  const mentionedOther = WORD_CARDS.find((card) => card.id !== shown.id && speechMentionsCard(turn.speech, card));
  if (mentionedOther && !mentionsShown) {
    return `speech mentions ${mentionedOther.id} but last show_card=${shown.id}`;
  }
  return null;
}

function speechMentionsCard(speech: string, card: WordCard): boolean {
  return Boolean(
    (card.english && new RegExp(`\\b${escapeRegExp(card.english)}\\b`, 'i').test(speech))
    || (card.chinese && speech.includes(card.chinese))
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main(): Promise<number> {
  console.log(`[smoke] base=${BASE} course=${COURSE_ID}`);

  const health = await fetch(`${BASE}/api/courses`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`[smoke] ✗ dev server not reachable at ${BASE}. Start it with: pnpm dev`);
    return 1;
  }
  console.log('[smoke] server reachable');

  const interactionResults = await runPushToTalkSmoke();
  for (const result of interactionResults) {
    const marker = result.pass ? '✓' : '✗';
    console.log(`[smoke] ${marker} ui ${result.name}${result.reason ? ` — ${result.reason}` : ''}`);
  }

  const t0 = Date.now();
  const start = await postChat({ action: 'start', courseId: COURSE_ID });
  if (!start.sessionId) {
    console.error('[smoke] ✗ start returned no sessionId (course missing?)');
    return 1;
  }
  const startTurn = await collectTurn(start.res);
  console.log(`[smoke] session=${start.sessionId.slice(0, 8)} started`);
  if (startTurn.speech) console.log(`[smoke]   intro speech: ${startTurn.speech.slice(0, 80)}${startTurn.speech.length > 80 ? '…' : ''}`);

  const results: StepResult[] = [];
  for (const step of ANIMALS_SCRIPT) {
    const stepT0 = Date.now();
    let res: Response;
    if (step.kind === 'message') {
      ({ res } = await postChat({ action: 'message', sessionId: start.sessionId, text: step.text }));
    } else {
      ({ res } = await postChat({ action: 'phase-transition', sessionId: start.sessionId, to: step.to }));
    }
    const turn = await collectTurn(res);
    const durationMs = Date.now() - stepT0;
    const { pass, reasons } = validateStep(step, turn);
    results.push({ step, turn, durationMs, pass, reasons });

    const marker = pass ? '✓' : '✗';
    const cardSeq = turn.showCards.length ? turn.showCards.join('→') : '(none)';
    const tag = step.kind === 'message' ? `msg="${step.text}"` : `phase→${step.to}`;
    console.log(`[smoke] ${marker} ${tag.padEnd(28)} cards=${cardSeq.padEnd(20)} ${durationMs}ms  ${step.note}`);
    if (!pass) for (const r of reasons) console.log(`         ↳ ${r}`);
  }

  await postChat({ action: 'end', sessionId: start.sessionId });
  const totalMs = Date.now() - t0;

  const failed = results.filter((r) => !r.pass);
  const failedInteractions = interactionResults.filter((r) => !r.pass);
  console.log('');
  console.log(`[smoke] === SUMMARY ===`);
  console.log(`[smoke] session: ${start.sessionId}`);
  console.log(`[smoke] steps:   ${results.length}  pass=${results.length - failed.length}  fail=${failed.length}`);
  console.log(`[smoke] ui:      ${interactionResults.length}  pass=${interactionResults.length - failedInteractions.length}  fail=${failedInteractions.length}`);
  console.log(`[smoke] total:   ${totalMs}ms`);

  await fs.mkdir(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORT_DIR, `smoke-${ts}.md`);
  const md = renderReport(start.sessionId, totalMs, results, interactionResults);
  await fs.writeFile(reportPath, md, 'utf-8');
  console.log(`[smoke] report: ${path.relative(process.cwd(), reportPath)}`);

  return failed.length > 0 || failedInteractions.length > 0 ? 1 : 0;
}

function renderReport(sessionId: string, totalMs: number, results: StepResult[], interactionResults: InteractionResult[]): string {
  const failed = results.filter((r) => !r.pass);
  const failedInteractions = interactionResults.filter((r) => !r.pass);
  const lines: string[] = [];
  lines.push(`# Smoke Report — ${COURSE_ID} (${new Date().toISOString().slice(0, 10)})`);
  lines.push('');
  lines.push(`session: ${sessionId.slice(0, 8)}... · ${totalMs}ms · ${results.length} steps · ${results.length - failed.length}/${results.length} pass`);
  lines.push('');
  lines.push('## UI Push-To-Talk');
  lines.push('');
  lines.push('| interaction | pass | reason |');
  lines.push('|---|---|---|');
  interactionResults.forEach((r) => {
    lines.push(`| ${r.name} | ${r.pass ? '✓' : '✗'} | ${r.reason ?? ''} |`);
  });
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  lines.push('| # | step | cards emitted | expected | pass | ms |');
  lines.push('|---|---|---|---|---|---|');
  results.forEach((r, i) => {
    const tag = r.step.kind === 'message' ? `msg "${r.step.text}"` : `→ ${r.step.to}`;
    const exp = r.step.expectShowCard === null ? '(any)' : (r.step.expectShowCard ?? '?');
    const cards = r.turn.showCards.join('→') || '(none)';
    lines.push(`| ${i + 1} | ${tag} | ${cards} | ${exp} | ${r.pass ? '✓' : '✗'} | ${r.durationMs} |`);
  });

  if (failed.length > 0 || failedInteractions.length > 0) {
    lines.push('');
    lines.push('## Failures');
    lines.push('');
    failedInteractions.forEach((r, i) => {
      lines.push(`### UI ${i + 1}. ${r.name}`);
      lines.push(`- ${r.reason ?? 'unknown failure'}`);
      lines.push('');
    });
    failed.forEach((r, i) => {
      const tag = r.step.kind === 'message' ? `msg "${r.step.text}"` : `→ ${r.step.to}`;
      lines.push(`### ${i + 1}. ${tag} — ${r.step.note}`);
      r.reasons.forEach((reason) => lines.push(`- ${reason}`));
      if (r.turn.speech) lines.push(`- speech: "${r.turn.speech.slice(0, 160)}${r.turn.speech.length > 160 ? '…' : ''}"`);
      lines.push('');
    });
  }

  lines.push('');
  lines.push('## All teacher speech (for audit)');
  lines.push('');
  results.forEach((r, i) => {
    if (!r.turn.speech) return;
    const tag = r.step.kind === 'message' ? `"${r.step.text}"` : `→${r.step.to}`;
    lines.push(`- **${i + 1} ${tag}**: ${r.turn.speech.slice(0, 220)}${r.turn.speech.length > 220 ? '…' : ''}`);
  });
  return lines.join('\n');
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('[smoke] crash:', err);
  process.exit(1);
});

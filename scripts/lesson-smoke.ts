// lesson-smoke.ts — drive a full animals lesson via /api/chat to validate the
// teacher agent state machine (normalize, R-A celebration-stay, R5 whitelist,
// R2 literal verify, closing guard). Bypasses ASR by posting text directly to
// action=message; this trades ASR coverage for determinism and zero TTS calls.
//
// Usage: `pnpm smoke:lesson` (requires dev server already running on :3000)
//        SMOKE_BASE=http://localhost:3001 pnpm smoke:lesson  (alt port)
//
// Exit code 0 if all assertions pass, 1 on any failure or crash.

import fs from 'node:fs/promises';
import path from 'node:path';

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
const REPORT_DIR = path.resolve('docs/lesson-reports');

interface SseEvent { event: string; data: any; }

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
    if (last && last !== step.expectShowCard) {
      reasons.push(`last show_card=${last}, expected ${step.expectShowCard}`);
    }
  }
  return { pass: reasons.length === 0, reasons };
}

async function main(): Promise<number> {
  console.log(`[smoke] base=${BASE} course=${COURSE_ID}`);

  const health = await fetch(`${BASE}/api/courses`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`[smoke] ✗ dev server not reachable at ${BASE}. Start it with: pnpm dev`);
    return 1;
  }
  console.log('[smoke] server reachable');

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
  console.log('');
  console.log(`[smoke] === SUMMARY ===`);
  console.log(`[smoke] session: ${start.sessionId}`);
  console.log(`[smoke] steps:   ${results.length}  pass=${results.length - failed.length}  fail=${failed.length}`);
  console.log(`[smoke] total:   ${totalMs}ms`);

  await fs.mkdir(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORT_DIR, `smoke-${ts}.md`);
  const md = renderReport(start.sessionId, totalMs, results);
  await fs.writeFile(reportPath, md, 'utf-8');
  console.log(`[smoke] report: ${path.relative(process.cwd(), reportPath)}`);

  return failed.length > 0 ? 1 : 0;
}

function renderReport(sessionId: string, totalMs: number, results: StepResult[]): string {
  const failed = results.filter((r) => !r.pass);
  const lines: string[] = [];
  lines.push(`# Smoke Report — ${COURSE_ID} (${new Date().toISOString().slice(0, 10)})`);
  lines.push('');
  lines.push(`session: ${sessionId.slice(0, 8)}... · ${totalMs}ms · ${results.length} steps · ${results.length - failed.length}/${results.length} pass`);
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

  if (failed.length > 0) {
    lines.push('');
    lines.push('## Failures');
    lines.push('');
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

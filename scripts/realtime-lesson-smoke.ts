/** Explicit app-path smoke. Uses only a caller-owned localhost test server and temporary DB. */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from '../src/lib/db/sqlite';
import { getCourseById } from '../src/data/courses';
import { parseRealtimeEvent, type RealtimeIntent, type RealtimeEvent } from '../src/lib/realtime-protocol';
const args = process.argv.slice(2);
function option(name: string, fallback = '') { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }
const base = option('--base', 'http://localhost:3018');
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Only an explicit loopback test server is supported');
const out = path.resolve(option('--out') || mkdtempSync(path.join(tmpdir(), 'eduagent-realtime-lesson-'))); mkdirSync(out, { recursive: true });
const course = getCourseById(option('--course', 'animals'))!;
if (!course) throw new Error('Unknown course');
const fixtures = new Map<string, string>();
for (const card of course.cards) {
  const target = path.join(out, `${card.id}.pcm`);
  const wav = `tests/fixtures/audio/${course.id}_${card.id}.wav`;
  let source = wav;
  if (!existsSync(wav)) { source = path.join(out, `${card.id}.aiff`); execFileSync('say', ['-v', 'Samantha', '-o', source, card.english], { stdio: 'pipe' }); }
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', source, '-ac', '1', '-ar', '24000', '-f', 's16le', target], { stdio: 'pipe' }); fixtures.set(card.id, target);
}
const rows: object[] = [];
let learnerId = ''; let sessionId = ''; let completed = false;
const report = { courseId: course.id, mode: args.includes('--live') ? 'live' : 'mock', scope: 'real HTTP classroom route, synthetic adult input; no physical microphone or speaker acceptance', results: rows };
const save = () => writeFileSync(path.join(out, 'results.json'), JSON.stringify({ ...report, learnerId, sessionId }, null, 2));
async function post(route: string, body: object) {
  const response = await fetch(`${base}${route}`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(70000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}
let current: Extract<RealtimeEvent, { type: 'receipt' }>['receipt'];
async function turn(intent: RealtimeIntent) {
  const response = await post('/api/realtime', { action: 'turn', learnerId, sessionId, turnId: randomUUID(), intent });
  const raw = await response.text(); const events = raw.split('\n\n').filter(Boolean).map((frame) => parseRealtimeEvent(frame.replace(/^data: /, '')));
  let audioBytes = 0; let transcript = ''; const receipts = [];
  for (const event of events) {
    if (event.type === 'audio') audioBytes += Buffer.from(event.pcm, 'base64').length;
    if (event.type === 'transcript') transcript += event.text;
    if (event.type === 'receipt') { current = event.receipt; receipts.push(event.receipt); }
  }
  const error = events.find((event) => event.type === 'error');
  rows.push({ kind: intent.kind, targetId: 'targetId' in intent ? intent.targetId : undefined, receipts, audioBytes, transcript, error }); save();
  if (error) throw new Error(error.type === 'error' ? error.code : 'Unexpected error');
  if (events.at(-1)?.type !== 'done') throw new Error('Missing done');
  console.log(`[realtime lesson] ${intent.kind} phase=${current.progress.currentPhase} card=${current.cardId} audioBytes=${audioBytes}`);
}
async function main() {
  if (!args.includes('--live') && !args.includes('--mock')) { console.log(`[realtime lesson] fixtures prepared at ${out}; no requests. Add --live or --mock for the owned test server.`); return; }
  const settings = await (await fetch(`${base}/api/settings`)).json();
  if (Boolean(settings.mock) !== args.includes('--mock')) throw new Error('Server mock state does not match requested experiment');
  const databasePath = path.resolve(option('--database'));
  if (!option('--database') || !databasePath.startsWith(`${tmpdir()}/`) && !databasePath.startsWith('/tmp/')) throw new Error('Supply the isolated test DB under the system temporary directory');
  const existing = option('--resume-learner');
  if (existing) learnerId = existing;
  else { const learner = await (await post('/api/learners', { name: 'Realtime 自动验证' })).json(); learnerId = learner.id; }
  try {
    const started = await (await post('/api/realtime', { action: 'start', courseId: course.id, learnerId, fresh: !existing })).json(); sessionId = started.sessionId; current = started.receipt; for (const id of started.resume?.passedQuizIds ?? []) passed.add(id); save();
    await turn({ kind: 'opening' });
    if (current.progress.currentPhase === 'intro') await turn({ kind: 'phase', to: 'interactive' });
    if (current.progress.currentPhase === 'interactive') await turn({ kind: 'repeat', cardId: current.cardId });
    const limit = args.includes('--full') ? 80 : 1;
    for (let i = 0; i < limit && current.progress.currentPhase !== 'done'; i++) {
      if (current.progress.currentPhase === 'interactive') {
        const target = current.cardId;
        await turn({ kind: 'audio', targetId: target, pcm: readFileSync(fixtures.get(target)!).toString('base64') });
        if (current.progress.currentPhase === 'interactive' && target !== current.cardId) await turn({ kind: 'repeat', cardId: current.cardId });
      } else {
        const quiz = course.phases.reinforcement.quizzes.find((q) => !passed.has(q.id));
        if (!quiz) { await turn({ kind: 'phase', to: 'done' }); break; }
        await turn({ kind: 'present-quiz', quizId: quiz.id });
        if (quiz.type === 'pick-word') await turn({ kind: 'pick', quizId: quiz.id, cardId: quiz.correctCardId });
        else {
          let file = fixtures.get(quiz.cardId)!;
          const card = course.cards.find((c) => c.id === quiz.cardId);
          if (card?.english !== quiz.targetText) {
            file = path.join(out, `${quiz.id}.pcm`); const source = path.join(out, `${quiz.id}.aiff`);
            execFileSync('say', ['-v', 'Samantha', '-o', source, quiz.targetText], { stdio: 'pipe' });
            execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', source, '-ac', '1', '-ar', '24000', '-f', 's16le', file], { stdio: 'pipe' });
          }
          await turn({ kind: 'audio', targetId: quiz.id, pcm: readFileSync(file).toString('base64') });
        }
        if (current.quiz?.correct) passed.add(quiz.id);
      }
    }
    if (args.includes('--full') && current.progress.currentPhase !== 'done') throw new Error('Bounded course did not finish');
  } finally {
    if (sessionId) await post('/api/realtime', { action: 'end', sessionId, learnerId }).catch(() => {});
    const db = new Database(databasePath, { readonly: true });
    try {
      const lesson = db.prepare('SELECT lesson_mode, interaction_count, token_usage FROM lesson_logs WHERE id = ? AND learner_id = ?').get(sessionId, learnerId);
      const progress = db.prepare('SELECT snapshot, completed, phase FROM course_progress WHERE learner_id = ? AND course_id = ?').get(learnerId, course.id);
      writeFileSync(path.join(out, 'database-readback.json'), JSON.stringify({ lesson, progress, words: db.prepare('SELECT word, attempts, correct, rc_correct FROM word_performance WHERE lesson_id = ?').all(sessionId) }, null, 2));
      completed = Boolean((progress as { completed?: number } | undefined)?.completed);
      if (!lesson) throw new Error('Owned test session not found in the supplied DB');
    } finally { db.close(); }
  }
  if (args.includes('--full') && !completed) throw new Error('Course ended with unfinished goals; actual completed flag is false');
  console.log(`[realtime lesson] evidence ${out}`);
}
const passed = new Set<string>();
main().catch((error) => { save(); console.error(`[realtime lesson] failed: ${(error as Error).message}`); process.exitCode = 1; });

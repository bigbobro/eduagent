/** Throwaway experiment. Default only prepares local synthetic fixtures; --live opts into API usage. */
import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RealtimeResponseError, runAudioTurn } from './session';
import { getCourseById } from '../../src/data/courses';

config({ path: '.env.local', quiet: true });
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[i + 1];
};
interface ProbeCase { id: string; target: string; targetText?: string; source?: string; voice?: string; text: string; expected: string[] }
const cases: ProbeCase[] = [
  { id: 'cat-correct', target: 'cat', source: 'tests/fixtures/audio/animals_cat.wav', text: 'cat', expected: ['correct'] },
  { id: 'cat-wrong', target: 'cat', source: 'tests/fixtures/audio/animals_dog.wav', text: 'dog', expected: ['wrong'] },
  { id: 'sentence', target: 'cat', text: 'I can see a cat.', expected: ['correct'] },
  { id: 'sentence-target', target: 'sentence-cat', targetText: 'I can see a cat.', text: 'I can see a cat.', expected: ['correct'] },
  { id: 'off-topic', target: 'cat', text: 'I want to go home.', expected: ['off_topic'] },
  { id: 'silence', target: 'cat', text: '', expected: ['silence'] },
  { id: 'mixed', target: 'cat', text: '这是 cat。', voice: 'Tingting', expected: ['correct'] },
  { id: 'chinese-only', target: 'cat', text: '这是猫。', voice: 'Tingting', expected: ['wrong'] },
  { id: 'early-end', target: 'cat', text: 'I am done. Let us finish the lesson.', expected: ['off_topic'] },
];
if (option('--case', 'cat-correct') === 'word-fixtures' || option('--case', '').split(',').some((id) => id.startsWith('fixture-'))) {
  const files = readdirSync('tests/fixtures/audio').filter((name) => name.endsWith('.wav')).sort();
  const words = files.map((file) => {
    const [courseId, ...parts] = file.replace(/\.wav$/, '').split('_');
    const card = getCourseById(courseId)?.cards.find((item) => item.id === parts.join('_'));
    if (!card) throw new Error(`Fixture has no course card: ${file}`);
    return { file, card };
  });
  words.forEach(({ file, card }, index) => {
    cases.push({ id: `fixture-correct-${file}`, target: card.id, targetText: card.english,
      source: `tests/fixtures/audio/${file}`, text: card.english, expected: ['correct'] });
    if (index % 3 === 0) {
      const other = words[(index + 1) % words.length];
      cases.push({ id: `fixture-wrong-${file}`, target: card.id, targetText: card.english,
        source: `tests/fixtures/audio/${other.file}`, text: other.card.english, expected: ['wrong'] });
    }
  });
}
const output = path.resolve(args.includes('--out') ? option('--out', '') : mkdtempSync(path.join(tmpdir(), 'eduagent-realtime-prototype-')));
mkdirSync(output, { recursive: true });
const selectedId = option('--case', 'cat-correct');
const selectedIds = selectedId.split(',');
const selected = selectedId === 'word-fixtures' ? cases.filter((c) => c.id.startsWith('fixture-')) : selectedId === 'all' ? cases : cases.filter((c) => selectedIds.includes(c.id));
if (!selected.length || (!['all', 'word-fixtures'].includes(selectedId) && selectedIds.some((id) => !cases.some((c) => c.id === id)))) throw new Error('Unknown --case');
const repeats = Number(option('--repeat', '1'));
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('--repeat must be 1–5');
const strategy = option('--strategy', 'tool-first');
if (strategy !== 'single' && strategy !== 'tool-first') throw new Error('Unknown --strategy');
const clarifyGoal = args.includes('--clarify-goal');
const inspectInput = args.includes('--inspect-input');
const referenceInput = args.includes('--reference-input');
const assessmentAudio = args.includes('--assessment-audio');
const skipDigitalSilence = args.includes('--skip-digital-silence');
const promptProfile = option('--prompt-profile', 'base');
if (!['base', 'rubric', 'no-fallback'].includes(promptProfile)) throw new Error('Unknown prompt profile');
if (promptProfile !== 'base' && clarifyGoal) throw new Error('Prompt profile and clarify-goal are separate experiment arms');
const reuse = option('--fixtures', '');
const reusedFixtures = reuse ? JSON.parse(readFileSync(reuse, 'utf8')) as Array<{ id: string; pcmPath: string }> : undefined;
const presentation = option('--present', '');
if (presentation && !['word', 'sentence', 'segmented', 'choice'].includes(presentation)) throw new Error('Unknown --present');
const model = option('--model', 'gpt-realtime-2.1');
const manifest = cases.map((c) => {
  const pcmPath = path.join(output, `${c.id}.pcm`);
  if (reusedFixtures) {
    const previous = reusedFixtures.find((f) => f.id === c.id);
    if (!previous) return { ...c, pcmPath: '', unavailable: true };
    writeFileSync(pcmPath, readFileSync(previous.pcmPath));
  } else if (c.id === 'silence') writeFileSync(pcmPath, Buffer.alloc(48000));
  else {
    let source: string;
    if ('source' in c && c.source) source = c.source;
    else {
      source = path.join(output, `${c.id}.aiff`);
      execFileSync('say', ['-v', 'voice' in c ? c.voice! : 'Samantha', '-o', source, c.text], { stdio: 'pipe' });
    }
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', source, '-ac', '1', '-ar', '24000', '-f', 's16le', pcmPath], { stdio: 'pipe' });
  }
  return { ...c, pcmPath, sampleRate: 24000, channels: 1, format: 'pcm16le',
    provenance: reusedFixtures ? `reused PCM from ${reuse}` : 'source' in c ? 'existing standard synthetic fixture' : c.id === 'silence' ? 'zero PCM' : `macOS ${'voice' in c ? c.voice : 'Samantha'} standard adult synthesis`,
    labelBasis: 'constructed lexical target, not a pronunciation-quality label', sha256: createHash('sha256').update(readFileSync(pcmPath)).digest('hex'), durationMs: readFileSync(pcmPath).length / 48 };
});
writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`[prototype] prepared ${manifest.length} labeled fixtures at ${output}`);

async function main() {
  if (!args.includes('--live')) {
    console.log('[prototype] offline preparation only; no API requests. Add --live for the selected experiment.');
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  // Avoid silently changing the destination of credentials. This probe is official OpenAI only.
  if (process.env.OPENAI_BASE_URL && !/^https:\/\/api\.openai\.com\/?(?:v1\/?)?$/.test(process.env.OPENAI_BASE_URL)) {
    throw new Error('Prototype requires the official OpenAI endpoint');
  }
  for (const c of selected) if (!manifest.find((f) => f.id === c.id)?.pcmPath) throw new Error(`Selected fixture missing from manifest: ${c.id}`);
  const results: object[] = [];
  const report = { prototype: true, startedAt: new Date().toISOString(), model, strategy, clarifyGoal, inspectInput, referenceInput, assessmentAudio, skipDigitalSilence, promptProfile, presentation, fixtureManifest: reuse || null,
    scope: 'single audio turn with in-memory assessment receipt, no production DB or UI integration', results };
  const save = () => writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  save();
  for (const c of selected) {
    const fixture = manifest.find((f) => f.id === c.id)!;
    for (let repeat = 0; repeat < repeats; repeat++) {
      console.log(`[prototype] live ${c.id} ${repeat + 1}/${repeats} strategy=${strategy} model=${model}`);
      try {
        const { audio, ...result } = await runAudioTurn({ apiKey: process.env.OPENAI_API_KEY, model,
          pcm: readFileSync(fixture.pcmPath), cardId: c.target, inspectInput, referenceInput, assessmentAudio, skipDigitalSilence, promptProfile: promptProfile as 'base' | 'rubric' | 'no-fallback', strategy: strategy as 'single' | 'tool-first', clarifyGoal,
          targetText: 'targetText' in c ? c.targetText : undefined,
          presentation: presentation ? presentation as 'word' | 'sentence' | 'segmented' | 'choice' : undefined });
        const audioFile = `${c.id}-${repeat + 1}-output.pcm`;
        writeFileSync(path.join(output, audioFile), audio);
        results.push({ caseId: c.id, repeat: repeat + 1, ...result, audioFile, audioBytes: audio.length,
          expected: c.expected, usageIncomplete: !result.usageComplete,
          targetPassMatches: result.kind !== 'child' ? null : result.assessments.length === 1 && (c.expected.includes('correct') === (result.assessments[0].result === 'correct')),
          classificationMatches: result.kind !== 'child' ? null : result.assessments.length === 1 && c.expected.includes(result.assessments[0].result),
          note: 'firstAudioMs measures received bytes after commit acknowledgement, not speaker playback or end-to-end release latency' });
        save();
        console.log(`[prototype] ${c.id} result=${result.kind === 'no-input' ? 'digital-silence-skipped' : result.kind === 'presentation' ? 'presentation-not-assessed' : result.assessments[0]?.result ?? 'MISSING'} audioBytes=${audio.length} firstAudioMs=${Math.round(result.firstAudioMs ?? -1)}`);
      } catch (error) {
        // runAudioTurn only emits sanitized errors; do not log raw provider bodies or credentials.
        results.push({ caseId: c.id, repeat: repeat + 1, expected: c.expected, error: (error as Error).message, usage: error instanceof RealtimeResponseError ? error.knownUsage : [], usageComplete: false, usageIncomplete: true });
        save();
        throw error;
      }
    }
  }
  console.log(`[prototype] saved results and raw usage: ${path.join(output, 'results.json')}`);
}
main().catch((error) => { console.error(`[prototype] failed: ${(error as Error).message}`); process.exitCode = 1; });

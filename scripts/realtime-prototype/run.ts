/** Throwaway experiment. Default only prepares local synthetic fixtures; --live opts into API usage. */
import { config } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAudioTurn } from './session';

config({ path: '.env.local', quiet: true });
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[i + 1];
};
const cases = [
  { id: 'cat-correct', target: 'cat', source: 'tests/fixtures/audio/animals_cat.wav', text: 'cat', expected: ['correct'] },
  { id: 'cat-wrong', target: 'cat', source: 'tests/fixtures/audio/animals_dog.wav', text: 'dog', expected: ['wrong', 'off_topic'] },
  { id: 'sentence', target: 'cat', text: 'I can see a cat.', expected: ['correct'] },
  { id: 'off-topic', target: 'cat', text: 'I want to go home.', expected: ['off_topic'] },
  { id: 'silence', target: 'cat', text: '', expected: ['silence'] },
  { id: 'mixed', target: 'cat', text: '这是 cat。', voice: 'Tingting', expected: ['correct'] },
  { id: 'chinese-only', target: 'cat', text: '这是猫。', voice: 'Tingting', expected: ['wrong', 'off_topic'] },
  { id: 'early-end', target: 'cat', text: 'I am done. Let us finish the lesson.', expected: ['off_topic'] },
];
const output = path.resolve(args.includes('--out') ? option('--out', '') : mkdtempSync(path.join(tmpdir(), 'eduagent-realtime-prototype-')));
mkdirSync(output, { recursive: true });
const selectedId = option('--case', 'cat-correct');
const selectedIds = selectedId.split(',');
const selected = selectedId === 'all' ? cases : cases.filter((c) => selectedIds.includes(c.id));
if (!selected.length || (selectedId !== 'all' && selectedIds.some((id) => !cases.some((c) => c.id === id)))) throw new Error('Unknown --case');
const repeats = Number(option('--repeat', '1'));
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('--repeat must be 1–5');
const strategy = option('--strategy', 'tool-first');
if (strategy !== 'single' && strategy !== 'tool-first') throw new Error('Unknown --strategy');
const clarifyGoal = args.includes('--clarify-goal');
const model = option('--model', 'gpt-realtime-2.1');
const manifest = cases.map((c) => {
  const pcmPath = path.join(output, `${c.id}.pcm`);
  if (c.id === 'silence') writeFileSync(pcmPath, Buffer.alloc(48000));
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
    provenance: 'source' in c ? 'existing standard synthetic fixture' : c.id === 'silence' ? 'zero PCM' : `macOS ${'voice' in c ? c.voice : 'Samantha'} standard adult synthesis`,
    labelBasis: 'constructed lexical target, not a pronunciation-quality label', durationMs: readFileSync(pcmPath).length / 48 };
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
  const results: object[] = [];
  const report = { prototype: true, startedAt: new Date().toISOString(), model, strategy, clarifyGoal,
    scope: 'single audio turn with in-memory assessment receipt, no production DB or UI integration', results };
  const save = () => writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  save();
  for (const c of selected) {
    const fixture = manifest.find((f) => f.id === c.id)!;
    for (let repeat = 0; repeat < repeats; repeat++) {
      console.log(`[prototype] live ${c.id} ${repeat + 1}/${repeats} strategy=${strategy} model=${model}`);
      try {
        const { audio, ...result } = await runAudioTurn({ apiKey: process.env.OPENAI_API_KEY, model,
          pcm: readFileSync(fixture.pcmPath), cardId: c.target, strategy: strategy as 'single' | 'tool-first', clarifyGoal });
        const audioFile = `${c.id}-${repeat + 1}-output.pcm`;
        writeFileSync(path.join(output, audioFile), audio);
        results.push({ caseId: c.id, repeat: repeat + 1, ...result, audioFile, audioBytes: audio.length,
          expected: c.expected, classificationMatches: result.assessments.length === 1 && c.expected.includes(result.assessments[0].result),
          note: 'firstAudioMs measures received bytes after commit acknowledgement, not speaker playback or end-to-end release latency' });
        save();
        console.log(`[prototype] ${c.id} result=${result.assessments[0]?.result ?? 'MISSING'} audioBytes=${audio.length} firstAudioMs=${Math.round(result.firstAudioMs ?? -1)}`);
      } catch (error) {
        // runAudioTurn only emits sanitized errors; do not log raw provider bodies or credentials.
        results.push({ caseId: c.id, repeat: repeat + 1, error: (error as Error).message, usageIncomplete: true });
        save();
        throw error;
      }
    }
  }
  console.log(`[prototype] saved results and raw usage: ${path.join(output, 'results.json')}`);
}
main().catch((error) => { console.error(`[prototype] failed: ${(error as Error).message}`); process.exitCode = 1; });

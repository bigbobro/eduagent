/** State-driven synthetic child; one Realtime session, scratch state only. */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runAudioTurn, type AudioInput, type AudioTurnResult } from './session';

config({ path: '.env.local', quiet: true });
async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath || !process.argv.includes('--live')) throw new Error('Usage: sequence.ts <manifest.json> --live');
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Array<{ id: string; pcmPath: string }>;
  const fixture = (id: string) => {
    const item = manifest.find((m) => m.id === id);
    if (!item) throw new Error(`Missing fixture ${id}`);
    return readFileSync(item.pcmPath);
  };
  const goals = ['cat', 'dog'];
  const mastered = new Set<string>();
  const skipped = new Set<string>();
  const driver: Array<{ completedTurns: number; assessed: string; requested: string | undefined; nextTarget?: string }> = [];
  const nextInput = (previous: AudioTurnResult, completedTurns: number): AudioInput | undefined => {
    const assessment = previous.assessments[0];
    if (!assessment) throw new Error('Sequence cannot advance without an assessment');
    if (assessment.mastered) mastered.add(assessment.card_id);
    if (assessment.next_action === 'skip') skipped.add(assessment.card_id);
    const target = assessment.mastered || assessment.next_action === 'advance' || assessment.next_action === 'skip'
      ? goals.find((g) => !mastered.has(g) && !skipped.has(g)) : assessment.card_id;
    driver.push({ completedTurns, assessed: assessment.card_id, requested: assessment.next_action, nextTarget: target });
    if (!target) return undefined;
    if (completedTurns >= 5) return undefined; // bounded experiment, report unfinished goals rather than loop forever
    return { cardId: target, pcm: fixture(target === 'cat' ? 'cat-correct' : 'cat-wrong') };
  };
  console.log('[prototype] state-driven sequence starts: wrong cat attempt, then select audio from model/app state');
  const reportPath = path.join(path.dirname(manifestPath), 'sequence-results.json');
  try {
    const result = await runAudioTurn({ apiKey: process.env.OPENAI_API_KEY, model: 'gpt-realtime-2.1',
      strategy: 'tool-first', cardId: 'cat', pcm: fixture('cat-wrong'), nextInput, timeoutMs: 120000 });
    const turns = [result, ...(result.followingTurns ?? [])].map(({ audio, followingTurns: _following, ...turn }, index) => {
      const file = `sequence-${index + 1}.pcm`;
      writeFileSync(path.join(path.dirname(manifestPath), file), audio);
      return { ...turn, audioFile: file, audioBytes: audio.length };
    });
    writeFileSync(reportPath, JSON.stringify({ scope: 'scratch two-word sequence; not a production course', turns, driver,
      mastered: Array.from(mastered), skipped: Array.from(skipped), complete: goals.every((g) => mastered.has(g)) }, null, 2));
    console.log(`[prototype] sequence ${turns.length} child turns; mastered=${Array.from(mastered).join(',')}; report=${reportPath}`);
  } catch (error) {
    writeFileSync(reportPath, JSON.stringify({ error: (error as Error).message, driver, usageIncomplete: true }, null, 2));
    throw error;
  }
}
main().catch((error) => { console.error(`[prototype] ${(error as Error).message}`); process.exitCode = 1; });

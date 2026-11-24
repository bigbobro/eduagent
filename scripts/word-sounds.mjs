// Generates the per-word instrument sounds with ElevenLabs into public/sounds/words/<courseId>/<cardId>.mp3.
// Needs ELEVENLABS_API_KEY in the environment (never logged) and ffmpeg. Costs ElevenLabs credits.
//   ELEVENLABS_API_KEY=<your-elevenlabs-api-key> node scripts/word-sounds.mjs <courseId> [cardId ...]
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SOLO = 'solo instrument, clean studio recording, no voice, no other instruments, no backing track';
// { courseId: { cardId: [prompt, seconds] } }
const SOUNDS = {
  instruments: {
    piano: [`A short bright cheerful melody of five or six notes on an acoustic grand piano, ${SOLO}`, 3],
    guitar: [`A warm gentle strummed chord then a few plucked notes on an acoustic guitar, ${SOLO}`, 3],
    drum: [`A lively simple drum beat on a drum kit, kick snare and toms, ending with one accent, ${SOLO}`, 3],
    violin: [`A short sweet singing melody bowed on a violin, ${SOLO}`, 3],
    flute: [`A short light airy melody on a concert flute, ${SOLO}`, 3],
    trumpet: [`A bright bold fanfare of four notes on a trumpet, ${SOLO}`, 3],
    bell: [`A small hand bell ringing ding ding ding, three or four clear rings, ${SOLO}`, 3],
    harp: [`A flowing upward glissando sweep across a concert harp, shimmering, ${SOLO}`, 3],
  },
};

const [courseId, ...only] = process.argv.slice(2);
const course = courseId ? SOUNDS[courseId] : undefined;
if (!course) {
  throw new Error(`Unknown or missing courseId "${courseId ?? ''}". Valid courses: ${Object.keys(SOUNDS).join(', ')}`);
}
const badCards = only.filter((id) => !(id in course));
if (badCards.length) {
  throw new Error(`Unknown cardId ${badCards.map((c) => `"${c}"`).join(', ')} for course ${courseId}. Valid cards: ${Object.keys(course).join(', ')}`);
}
const KEY = (process.env.ELEVENLABS_API_KEY || '').trim();
if (!KEY) throw new Error('ELEVENLABS_API_KEY missing');

const OUT = `public/sounds/words/${courseId}`;
mkdirSync(OUT, { recursive: true });
for (const [cardId, [text, seconds]] of Object.entries(course)) {
  if (only.length && !only.includes(cardId)) continue;
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.6 }),
  });
  if (!res.ok) throw new Error(`${courseId}/${cardId}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const raw = `${OUT}/${cardId}.raw.mp3`; writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  // Trim leading silence, normalise (quieter than the battle effects), hard cap at 3 s with a short fade-out.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-20:TP=-2,afade=t=out:st=2.85:d=0.15', '-t', '3', '-ar', '44100', '-ac', '1', '-b:a', '96k', `${OUT}/${cardId}.mp3`]);
  rmSync(raw);
  console.log(`[word-sounds] ${courseId}/${cardId} ok`);
}

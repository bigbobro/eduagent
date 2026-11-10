// Generates the word-battle sound effects with ElevenLabs into public/sounds/battle/*.mp3.
// Needs ELEVENLABS_API_KEY in the environment (never logged) and ffmpeg. Costs ElevenLabs credits.
//   ELEVENLABS_API_KEY=<your-elevenlabs-api-key> node scripts/battle-sfx.mjs [name ...]
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const KEY = (process.env.ELEVENLABS_API_KEY || '').trim();
if (!KEY) throw new Error('ELEVENLABS_API_KEY missing');
const OUT = 'public/sounds/battle';
// [prompt, seconds]. Short, playful, cartoon magic for a 6-year-old; no voices, no words, nothing scary.
const SFX = {
  hit: ['A short playful cartoon magic bubble pop hitting a soft target, bright sparkly impact with a tiny bouncy boing, cute, no voice', 0.6],
  crit: ['A big triumphant cartoon magic spell burst, rising shimmer then a bright sparkly explosion of stars, joyful and powerful, cute, no voice', 1.2],
  graze: ['A quick light cartoon whoosh passing by with a tiny twinkle, a near miss, soft and cute, no voice', 0.5],
  collect: ['A sweet rising three-note magical chime as a card slides into a book, soft sparkle, rewarding, no voice', 0.8],
  tame: ['A happy cartoon transformation: a soft poof of smoke followed by a cheerful ascending glockenspiel flourish, friendly, no voice', 1.4],
  enter: ['A mischievous cartoon creature hopping in: two quick springy bounces and a small cheeky slide whistle, playful, no voice', 0.9],
  steal: ['A sneaky cartoon snatch: a fast swoosh grabbing a stack of paper cards and a quick scampering patter, mischievous and funny, no voice', 1.1],
};
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
for (const [name, [text, seconds]] of Object.entries(SFX)) {
  if (only.length && !only.includes(name)) continue;
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.6 }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const raw = `${OUT}/${name}.raw.mp3`; writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  // Trim leading silence and normalise loudness so every effect sits at the same level.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-18:TP=-2', '-ar', '44100', '-ac', '1', '-b:a', '96k', `${OUT}/${name}.mp3`]);
  rmSync(raw);
  console.log(`[battle-sfx] ${name} ok`);
}

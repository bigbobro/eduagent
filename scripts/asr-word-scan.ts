// asr-word-scan.ts — empirical homophone / mis-ASR scanner for course target words.
//
// For each word card it TTS-synthesizes the English word (16kHz, standard pronunciation), feeds the
// PCM to Doubao ASR with the SAME hot-word context production uses, and checks whether the ASR
// output literally contains the english word (the R2 hit rule). A MISS means even a clean
// pronunciation isn't recognized as the target — the ASR output is then a data-backed candidate for
// `WordCard.asrAliases`. Caveat: TTS pronounces correctly, so this catches the "ASR mangles the
// correct word" class (e.g. knight→夜晚), NOT child-mispronunciation cases.
//
// Connects DIRECTLY to Doubao using .env.local creds (no dev server needed).
//
// Usage:
//   pnpm tsx scripts/asr-word-scan.ts                       # scan ALL course word cards
//   pnpm tsx scripts/asr-word-scan.ts --only magic          # one course
//   pnpm tsx scripts/asr-word-scan.ts --cards magic:knight,body:eye,nature:sun
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { WebSocket as WsClient } from 'ws';
import {
  decodeServerFrame,
  decodeTtsFrame,
  encodeAudioOnlyLast,
  encodeAudioOnlyRequest,
  encodeFullClientRequest,
  encodeTtsEvent,
  MessageType,
  Serialization,
} from '../src/lib/voice/doubao-codec';
import { buildAsrRequestPayload, type AsrSessionInfo } from '../src/lib/voice/asr-proxy';
import { allCourses } from '../src/data/courses';
import type { Course, WordCard } from '../src/types/course';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const DOUBAO_ASR_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';
const DOUBAO_TTS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const CHUNK_MS = 200;
const CHUNK_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * (CHUNK_MS / 1000);
const TAIL_SILENCE_MS = 1500;
const REPORT_DIR = path.resolve('docs/lesson-reports');

interface ScanCase { courseId: string; cardId: string; english: string; session: AsrSessionInfo; }
interface ScanResult extends ScanCase { asrText: string; hit: boolean; error?: string; }

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  return { only: get('--only'), cards: get('--cards') };
}

function clearedBefore(course: Course, cardId: string): string[] {
  const idx = course.teachingHints.newCardIds.indexOf(cardId);
  return idx > 0 ? course.teachingHints.newCardIds.slice(0, idx) : [];
}

function buildCases(): ScanCase[] {
  const { only, cards } = parseArgs();
  const wordCardsOf = (c: Course) => c.cards.filter((x): x is WordCard => x.kind === 'word');
  if (cards) {
    return cards.split(',').map((pair) => {
      const [courseId, cardId] = pair.split(':');
      const course = allCourses.find((c) => c.id === courseId);
      const card = course?.cards.find((x) => x.id === cardId) as WordCard | undefined;
      if (!course || !card) throw new Error(`unknown card ${pair}`);
      return { courseId, cardId, english: card.english, session: { courseId, cardId, clearedCardIds: clearedBefore(course, cardId) } };
    });
  }
  const courses = only ? allCourses.filter((c) => c.id === only) : allCourses;
  return courses.flatMap((c) => wordCardsOf(c).map((card) => ({
    courseId: c.id, cardId: card.id, english: card.english,
    session: { courseId: c.id, cardId: card.id, clearedCardIds: clearedBefore(c, card.id) },
  })));
}

function normalize(s: string): string { return s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ''); }
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function synthesizePcm(text: string): Promise<Buffer> {
  const sessionId = randomUUID();
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    const ws = new WsClient(DOUBAO_TTS_URL, { headers: {
      'X-Api-App-Id': process.env.DOUBAO_APP_ID || '',
      'X-Api-Access-Key': process.env.DOUBAO_ACCESS_KEY || '',
      'X-Api-Resource-Id': process.env.DOUBAO_TTS_RESOURCE_ID || 'seed-tts-2.0',
      'X-Api-Connect-Id': randomUUID(),
    } });
    const timeout = setTimeout(() => fail(new Error(`TTS timeout "${text}"`)), 30000);
    function fail(e: Error) { clearTimeout(timeout); try { ws.close(); } catch {} reject(e); }
    ws.on('open', () => ws.send(encodeTtsEvent({ event: 1, payload: Buffer.from('{}', 'utf8') })));
    ws.on('message', (data) => {
      let frame; try { frame = decodeTtsFrame(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)); } catch (e) { fail(e as Error); return; }
      if (frame.event === 50) {
        ws.send(encodeTtsEvent({ event: 100, sessionId, payload: Buffer.from(JSON.stringify({
          event: 100, namespace: 'BidirectionalTTS', req_params: {
            speaker: process.env.DOUBAO_ASR_REGRESSION_SPEAKER || process.env.DOUBAO_TTS_DEFAULT_SPEAKER,
            model: 'seed-tts-2.0-standard',
            audio_params: { format: 'pcm', sample_rate: SAMPLE_RATE, speech_rate: -10, loudness_rate: 0 },
            additions: JSON.stringify({ disable_markdown_filter: false, cache_config: { text_type: 1, use_cache: true, use_segment_cache: true } }),
          },
        }), 'utf8') }));
      } else if (frame.event === 150) {
        ws.send(encodeTtsEvent({ event: 200, sessionId, payload: Buffer.from(JSON.stringify({ event: 200, namespace: 'BidirectionalTTS', req_params: { text } }), 'utf8') }));
        ws.send(encodeTtsEvent({ event: 102, sessionId, payload: Buffer.from('{}', 'utf8') }));
      } else if (frame.event === 152) {
        clearTimeout(timeout);
        try { ws.send(encodeTtsEvent({ event: 2, payload: Buffer.from('{}', 'utf8') })); } catch {}
        try { ws.close(); } catch {}
        resolve(Buffer.concat(chunks));
      } else if (frame.event === 352) {
        chunks.push(frame.payload);
      } else if (frame.messageType === MessageType.Error) {
        fail(new Error(frame.payload.toString('utf8')));
      }
    });
    ws.on('error', (e) => fail(e as Error));
  });
}

function runAsr(pcm: Buffer, session: AsrSessionInfo): Promise<string> {
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const ws = new WsClient(DOUBAO_ASR_URL, { headers: {
      'X-Api-App-Key': process.env.DOUBAO_APP_ID || '',
      'X-Api-Access-Key': process.env.DOUBAO_ACCESS_KEY || '',
      'X-Api-Resource-Id': process.env.DOUBAO_ASR_RESOURCE_ID || 'volc.seedasr.sauc.duration',
      'X-Api-Request-Id': requestId,
      'X-Api-Sequence': '-1',
    } });
    const timeout = setTimeout(() => fail(new Error('ASR timeout')), 45000);
    let sequence = 1; let bestText = '';
    function fail(e: Error) { clearTimeout(timeout); try { ws.close(); } catch {} reject(e); }
    ws.on('open', async () => {
      ws.send(encodeFullClientRequest(buildAsrRequestPayload(session, `scan-${requestId}`), sequence++));
      try {
        for (let off = 0; off < pcm.length; off += CHUNK_BYTES) {
          ws.send(encodeAudioOnlyRequest(pcm.subarray(off, off + CHUNK_BYTES), sequence++));
          await sleep(CHUNK_MS);
        }
        ws.send(encodeAudioOnlyLast(Buffer.alloc(0), -sequence));
      } catch (e) { fail(e as Error); }
    });
    ws.on('message', (data) => {
      let frame; try { frame = decodeServerFrame(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)); } catch (e) { fail(e as Error); return; }
      if (frame.messageType === MessageType.Error) { fail(new Error(frame.payload.toString('utf8'))); return; }
      if (frame.serialization !== Serialization.JSON) return;
      let json; try { json = JSON.parse(frame.payload.toString('utf8')); } catch { return; }
      const text = json?.result?.text ?? '';
      if (text) bestText = text;
      const utts = json?.result?.utterances ?? [];
      if (utts.length > 0 && utts.every((u: { definite?: boolean }) => u.definite === true)) {
        clearTimeout(timeout); try { ws.close(); } catch {} resolve(text);
      }
    });
    ws.on('error', (e) => fail(e as Error));
    ws.on('close', () => { if (bestText) { clearTimeout(timeout); resolve(bestText); } });
  });
}

async function main() {
  const cases = buildCases();
  console.log(`[scan] ${cases.length} word(s)`);
  const results: ScanResult[] = [];
  for (const c of cases) {
    try {
      const pcm = await synthesizePcm(c.english);
      const padded = Buffer.concat([pcm, Buffer.alloc(SAMPLE_RATE * BYTES_PER_SAMPLE * (TAIL_SILENCE_MS / 1000))]);
      const asrText = await runAsr(padded, c.session);
      const hit = normalize(asrText).includes(normalize(c.english));
      results.push({ ...c, asrText, hit });
      console.log(`[scan] ${hit ? 'HIT ' : 'MISS'} ${c.courseId}/${c.cardId} "${c.english}" → asr="${asrText}"`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ ...c, asrText: '', hit: false, error: msg });
      console.warn(`[scan] ERR  ${c.courseId}/${c.cardId} "${c.english}": ${msg}`);
    }
  }
  const misses = results.filter((r) => !r.hit && !r.error);
  console.log(`\n[scan] === MISSES (data-backed asrAliases candidates) ===`);
  for (const m of misses) console.log(`  ${m.courseId}/${m.cardId}  english="${m.english}"  asrAliases candidate="${m.asrText}"`);
  console.log(`[scan] total=${results.length} hit=${results.filter((r) => r.hit).length} miss=${misses.length} err=${results.filter((r) => r.error).length}`);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = path.join(REPORT_DIR, `asr-word-scan-${Date.now()}.json`);
  fs.writeFileSync(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`[scan] wrote ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => { console.error('[scan] FATAL:', e?.message || e); process.exit(1); });

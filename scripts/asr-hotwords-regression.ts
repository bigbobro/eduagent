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
import {
  buildAsrRequestPayload,
  type AsrSessionInfo,
} from '../src/lib/voice/asr-proxy';
import { getCourseById } from '../src/data/courses';
import type { Course } from '../src/types/course';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const DOUBAO_ASR_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';
const DOUBAO_TTS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const CHANNELS = 1;
const CHUNK_MS = 200;
const CHUNK_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * (CHUNK_MS / 1000);
const FIXTURE_DIR = path.resolve('tests/fixtures/audio');
const REPORT_DIR = path.resolve('docs/lesson-reports');

interface RegressionCase {
  id: string;
  courseId: string;
  cardId: string;
  text: string;
  fixture: string;
  session: AsrSessionInfo;
  requiredTerms: string[];
}

interface AsrRunResult {
  text: string;
  rawText: string;
  matched: boolean;
  requiredTerms: string[];
  missingTerms: string[];
  error?: string;
}

const CASE_SPECS: Array<{ courseId: string; cardIds: string[] }> = [
  { courseId: 'animals', cardIds: ['cat', 'dog', 'bird', 'fish', 'rabbit', 'turtle', 'lion', 'elephant', 'monkey', 'panda', 'duck', 'frog'] },
  { courseId: 'colors', cardIds: ['yellow', 'purple', 'orange', 'gray'] },
  { courseId: 'body', cardIds: ['eye', 'ear', 'nose', 'mouth'] },
  { courseId: 'shapes', cardIds: ['heart', 'oval', 'cube', 'cone'] },
  { courseId: 'clothes', cardIds: ['shirt', 'hat', 'socks', 'coat', 'shorts', 'scarf'] },
];

const cases: RegressionCase[] = CASE_SPECS.flatMap(({ courseId, cardIds }) => (
  cardIds.map((cardId) => makeCase(courseId, cardId))
));

async function main(): Promise<void> {
  requireEnv([
    'DOUBAO_APP_ID',
    'DOUBAO_ACCESS_KEY',
    'DOUBAO_ASR_RESOURCE_ID',
    'DOUBAO_TTS_RESOURCE_ID',
    'DOUBAO_TTS_DEFAULT_SPEAKER',
  ]);

  const forceFixtures = process.argv.includes('--force-fixtures');
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const results: Array<{
    id: string;
    fixture: string;
    durationMs: number;
    baseline: AsrRunResult;
    hotwords: AsrRunResult;
  }> = [];

  for (const item of cases) {
    const fixturePath = path.join(FIXTURE_DIR, item.fixture);
    await ensureFixture(item, fixturePath, forceFixtures);
    const wav = readPcmWav(fixturePath);
    const pcmWithSilence = Buffer.concat([wav.pcm, Buffer.alloc(SAMPLE_RATE * BYTES_PER_SAMPLE * 3)]);

    console.log(`[asr-regression] ${item.id}: baseline`);
    const baseline = await runAsrAndAssess(pcmWithSilence, {}, item.id, 'baseline', item.requiredTerms);
    console.log(`[asr-regression] ${item.id}: baseline="${baseline.text}" matched=${baseline.matched}`);

    console.log(`[asr-regression] ${item.id}: hotwords`);
    const hotwords = await runAsrAndAssess(pcmWithSilence, item.session, item.id, 'hotwords', item.requiredTerms);
    console.log(`[asr-regression] ${item.id}: hotwords="${hotwords.text}" matched=${hotwords.matched}`);

    results.push({
      id: item.id,
      fixture: path.relative(process.cwd(), fixturePath),
      durationMs: wav.durationMs,
      baseline,
      hotwords,
    });
  }

  const summary = summarizeResults(results);
  const report = {
    generatedAt: new Date().toISOString(),
    speaker: process.env.DOUBAO_ASR_REGRESSION_SPEAKER || process.env.DOUBAO_TTS_DEFAULT_SPEAKER,
    sampleRate: SAMPLE_RATE,
    summary,
    cases: results,
  };
  const reportPath = path.join(REPORT_DIR, `asr-hotwords-regression-${dateStamp()}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const failed = results.filter((item) => !item.hotwords.matched);
  const regressions = results.filter((item) => item.baseline.matched && !item.hotwords.matched);
  console.log(`[asr-regression] wrote ${path.relative(process.cwd(), reportPath)}`);
  console.log(
    `[asr-regression] summary baseline=${formatPct(summary.baselineHitRate)} hotwords=${formatPct(summary.hotwordsHitRate)} avgDiff=${formatPct(summary.avgDiff)}`
  );
  for (const item of results) {
    console.log(
      `[asr-regression] ${item.id}: baseline="${item.baseline.text}" hotwords="${item.hotwords.text}"`
    );
  }

  if (summary.avgDiff < 0.3) {
    throw new Error(`Hotwords ASR regression failed: avgDiff ${formatPct(summary.avgDiff)} < 30%`);
  }
  if (regressions.length > 0) {
    throw new Error(`Hotwords ASR regression regressed cases: ${regressions.map((item) => item.id).join(', ')}`);
  }
  if (failed.length > 0) {
    console.warn(`[asr-regression] hotwords still missed: ${failed.map((item) => item.id).join(', ')}`);
  }
}

function makeCase(courseId: string, cardId: string): RegressionCase {
  const course = getCourseById(courseId);
  if (!course) throw new Error(`Unknown course for ASR regression: ${courseId}`);
  const card = course.cards.find((item) => item.id === cardId);
  if (!card) throw new Error(`Unknown card for ASR regression: ${courseId}/${cardId}`);
  return {
    id: `${courseId}_${cardId}`,
    courseId,
    cardId,
    text: card.english,
    fixture: `${courseId}_${cardId}.wav`,
    session: {
      courseId,
      cardId,
      clearedCardIds: clearedBefore(course, cardId),
    },
    requiredTerms: [card.english],
  };
}

function clearedBefore(course: Course, cardId: string): string[] {
  const currentIndex = course.teachingHints.newCardIds.indexOf(cardId);
  return currentIndex > 0 ? course.teachingHints.newCardIds.slice(0, currentIndex) : [];
}

function summarizeResults(results: Array<{
  baseline: AsrRunResult;
  hotwords: AsrRunResult;
}>): {
  caseCount: number;
  baselineHits: number;
  hotwordsHits: number;
  baselineHitRate: number;
  hotwordsHitRate: number;
  avgDiff: number;
} {
  const baselineHits = results.filter((item) => item.baseline.matched).length;
  const hotwordsHits = results.filter((item) => item.hotwords.matched).length;
  const caseCount = results.length;
  const baselineHitRate = caseCount > 0 ? baselineHits / caseCount : 0;
  const hotwordsHitRate = caseCount > 0 ? hotwordsHits / caseCount : 0;
  return {
    caseCount,
    baselineHits,
    hotwordsHits,
    baselineHitRate,
    hotwordsHitRate,
    avgDiff: hotwordsHitRate - baselineHitRate,
  };
}

function requireEnv(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing env for Doubao ASR regression: ${missing.join(', ')}`);
  }
}

async function ensureFixture(item: RegressionCase, fixturePath: string, force: boolean): Promise<void> {
  if (!force && isUsableFixture(fixturePath)) return;

  console.log(`[asr-regression] synthesizing ${item.fixture}`);
  const pcm = await synthesizePcm(item.text);
  if (pcm.length < SAMPLE_RATE * BYTES_PER_SAMPLE * 0.4) {
    throw new Error(`TTS returned too little PCM for ${item.id}: ${pcm.length} bytes`);
  }
  fs.writeFileSync(fixturePath, encodePcmWav(pcm));
}

function isUsableFixture(filePath: string): boolean {
  try {
    const wav = readPcmWav(filePath);
    return wav.sampleRate === SAMPLE_RATE && wav.channels === CHANNELS && wav.durationMs >= 400;
  } catch {
    return false;
  }
}

async function synthesizePcm(text: string): Promise<Buffer> {
  const connectId = randomUUID();
  const sessionId = randomUUID();
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    const ws = new WsClient(DOUBAO_TTS_URL, {
      headers: {
        'X-Api-App-Id': process.env.DOUBAO_APP_ID || '',
        'X-Api-Access-Key': process.env.DOUBAO_ACCESS_KEY || '',
        'X-Api-Resource-Id': process.env.DOUBAO_TTS_RESOURCE_ID || 'seed-tts-2.0',
        'X-Api-Connect-Id': connectId,
      },
    });
    const timeout = setTimeout(() => fail(new Error(`TTS timed out for "${text}"`)), 30000);

    function fail(error: Error): void {
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(error);
    }

    ws.on('open', () => {
      ws.send(encodeTtsEvent({ event: 1, payload: Buffer.from('{}', 'utf8') }));
    });

    ws.on('message', (data) => {
      let frame;
      try {
        frame = decodeTtsFrame(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
      } catch (error) {
        fail(error as Error);
        return;
      }

      if (frame.event === 50) {
        const payload = JSON.stringify({
          event: 100,
          namespace: 'BidirectionalTTS',
          req_params: {
            speaker: process.env.DOUBAO_ASR_REGRESSION_SPEAKER || process.env.DOUBAO_TTS_DEFAULT_SPEAKER,
            model: 'seed-tts-2.0-standard',
            audio_params: {
              format: 'pcm',
              sample_rate: SAMPLE_RATE,
              speech_rate: -10,
              loudness_rate: 0,
            },
            additions: JSON.stringify({
              disable_markdown_filter: false,
              cache_config: { text_type: 1, use_cache: true, use_segment_cache: true },
            }),
          },
        });
        ws.send(encodeTtsEvent({ event: 100, sessionId, payload: Buffer.from(payload, 'utf8') }));
        return;
      }

      if (frame.event === 150) {
        const textPayload = JSON.stringify({
          event: 200,
          namespace: 'BidirectionalTTS',
          req_params: { text },
        });
        ws.send(encodeTtsEvent({ event: 200, sessionId, payload: Buffer.from(textPayload, 'utf8') }));
        ws.send(encodeTtsEvent({ event: 102, sessionId, payload: Buffer.from('{}', 'utf8') }));
        return;
      }

      if (frame.event === 152) {
        clearTimeout(timeout);
        try { ws.send(encodeTtsEvent({ event: 2, payload: Buffer.from('{}', 'utf8') })); } catch {}
        try { ws.close(); } catch {}
        resolve(Buffer.concat(chunks));
        return;
      }

      if (frame.event === 352) {
        chunks.push(frame.payload);
      } else if (frame.messageType === MessageType.Error) {
        fail(new Error(frame.payload.toString('utf8')));
      }
    });

    ws.on('error', (error) => fail(error));
  });
}

async function runAsr(pcm: Buffer, session: AsrSessionInfo, caseId: string, variant: string): Promise<string> {
  const requestId = randomUUID();

  return new Promise((resolve, reject) => {
    const ws = new WsClient(DOUBAO_ASR_URL, {
      headers: {
        'X-Api-App-Key': process.env.DOUBAO_APP_ID || '',
        'X-Api-Access-Key': process.env.DOUBAO_ACCESS_KEY || '',
        'X-Api-Resource-Id': process.env.DOUBAO_ASR_RESOURCE_ID || 'volc.seedasr.sauc.duration',
        'X-Api-Request-Id': requestId,
        'X-Api-Sequence': '-1',
      },
    });
    const timeout = setTimeout(() => {
      fail(new Error(`ASR timed out waiting for final result (${caseId}/${variant}); last partial="${bestText}"`));
    }, 45000);
    let sequence = 1;
    let bestText = '';

    function fail(error: Error): void {
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(error);
    }

    ws.on('open', async () => {
      const payload = buildAsrRequestPayload(session, `eduagent-regression-${requestId}`);
      ws.send(encodeFullClientRequest(payload, sequence++));

      try {
        for (let offset = 0; offset < pcm.length; offset += CHUNK_BYTES) {
          ws.send(encodeAudioOnlyRequest(pcm.subarray(offset, offset + CHUNK_BYTES), sequence++));
          await sleep(CHUNK_MS);
        }
        ws.send(encodeAudioOnlyLast(Buffer.alloc(0), -sequence));
      } catch (error) {
        fail(error as Error);
      }
    });

    ws.on('message', (data) => {
      let frame;
      try {
        frame = decodeServerFrame(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
      } catch (error) {
        fail(error as Error);
        return;
      }

      if (frame.messageType === MessageType.Error) {
        fail(new Error(frame.payload.toString('utf8')));
        return;
      }
      if (frame.serialization !== Serialization.JSON) return;

      const json = safeParse(frame.payload.toString('utf8'));
      const text = json?.result?.text ?? '';
      if (text) bestText = text;
      const utterances = json?.result?.utterances ?? [];
      const isFinal =
        utterances.length > 0 &&
        utterances.every((utterance: { definite?: boolean }) => utterance.definite === true);
      if (isFinal) {
        clearTimeout(timeout);
        try { ws.close(); } catch {}
        resolve(text);
      }
    });

    ws.on('error', (error) => fail(error));
    ws.on('close', () => {
      if (bestText) {
        clearTimeout(timeout);
        resolve(bestText);
      }
    });
  });
}

async function runAsrAndAssess(
  pcm: Buffer,
  session: AsrSessionInfo,
  caseId: string,
  variant: string,
  requiredTerms: string[]
): Promise<AsrRunResult> {
  try {
    const text = await runAsr(pcm, session, caseId, variant);
    return assessResult(text, requiredTerms);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[asr-regression] ${caseId}: ${variant} error: ${message}`);
    return {
      text: '',
      rawText: '',
      matched: false,
      requiredTerms,
      missingTerms: requiredTerms,
      error: message,
    };
  }
}

function assessResult(text: string, requiredTerms: string[], rawText: string = text): AsrRunResult {
  const normalized = normalize(text);
  const missingTerms = requiredTerms.filter((term) => !normalized.includes(normalize(term)));
  return {
    text,
    rawText,
    matched: missingTerms.length === 0,
    requiredTerms,
    missingTerms,
  };
}

function readPcmWav(filePath: string): {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  durationMs: number;
  pcm: Buffer;
} {
  const wav = fs.readFileSync(filePath);
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${filePath} is not a WAV file`);
  }
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitsPerSample = wav.readUInt16LE(34);
  const dataOffset = wav.indexOf('data', 12, 'ascii');
  if (dataOffset < 0) throw new Error(`${filePath} has no data chunk`);
  const dataSize = wav.readUInt32LE(dataOffset + 4);
  const pcm = wav.subarray(dataOffset + 8, dataOffset + 8 + dataSize);
  const durationMs = Math.round((pcm.length / (sampleRate * channels * (bitsPerSample / 8))) * 1000);
  return { channels, sampleRate, bitsPerSample, durationMs, pcm };
}

function encodePcmWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = CHANNELS * BYTES_PER_SAMPLE;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function safeParse(input: string): any {
  try { return JSON.parse(input); } catch { return null; }
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function dateStamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;
}

main().catch((error) => {
  console.error(`[asr-regression] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

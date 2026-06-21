// gen-filler.ts — legacy helper for generating the disabled "thinking" filler audio.
//
// LessonController no longer loads or plays this asset. The filler was disabled because it can
// speak while ASR/LLM/TTS are working normally, which sounds like the system missed the child.
// Keep this script only as a disposable tool if that product direction is revisited.
//
// This script drives the SAME client-facing TTS protocol the browser uses (session-start →
// text-chunk → session-finish over /api/voice/tts), captures the returned PCM frames, and writes
// public/audio/thinking-filler.pcm (24kHz int16 mono — drop-in for PcmPlayer).
//
// Voice consistency: the asset is baked with whatever DOUBAO_TTS_DEFAULT_SPEAKER is active. If you
// change the teacher voice, re-run this to regenerate.
//
// Usage:
//   1) start a dev server against REAL Doubao (NOT VOICE_MOCK):  pnpm dev   (or on an alt port)
//   2) pnpm tsx scripts/gen-filler.ts [--base ws://localhost:3000] [--text "..."]
//
// Exit 0 on success (file written), 1 on any failure.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = arg('--base', 'ws://localhost:3000').replace(/^http/, 'ws');
const TEXT = arg('--text', '嗯，让老师看看哦~');
const OUT = resolve(process.cwd(), 'public/audio/thinking-filler.pcm');
const TIMEOUT_MS = 30_000;

function main(): Promise<void> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`${BASE}/api/voice/tts`, {
      headers: { origin: BASE.replace(/^ws/, 'http') }, // pass the WS Origin allowlist
    });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      rej(new Error(`timeout after ${TIMEOUT_MS}ms (got ${chunks.length} pcm frames)`));
    }, TIMEOUT_MS);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'session-start', sessionId: randomUUID() }));
      ws.send(JSON.stringify({ type: 'text-chunk', text: TEXT }));
      ws.send(JSON.stringify({ type: 'session-finish' }));
    });
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) { chunks.push(data); return; }
      let msg: any;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === 'error') {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        rej(new Error(`tts error: ${msg.code} ${msg.message}`));
      } else if (msg.type === 'session-finished') {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        const pcm = Buffer.concat(chunks);
        if (pcm.length === 0) { rej(new Error('no PCM received')); return; }
        mkdirSync(dirname(OUT), { recursive: true });
        writeFileSync(OUT, pcm);
        const seconds = (pcm.length / 2 / 24000).toFixed(2);
        console.log(`[gen-filler] wrote ${OUT} — ${pcm.length} bytes (~${seconds}s @ 24kHz int16) text="${TEXT}"`);
        res();
      }
    });
    ws.on('error', (e) => { clearTimeout(timer); rej(e); });
  });
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('[gen-filler] FAIL:', e?.message || e);
  process.exit(1);
});

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildAsrRequestPayload,
  parseAsrSessionInfoFromUrl,
} from '@/lib/voice/asr-proxy';

describe('ASR hot words', () => {
  it('uses the current-card W2 window instead of the full targetWords set', () => {
    const payload = buildAsrRequestPayload({
      courseId: 'food',
      targetWords: ['apple', 'milk', 'apple'],
      cardId: 'rice',
    });

    expect(payload.request.corpus).toBeDefined();
    const context = JSON.parse(payload.request.corpus!.context);
    expect(context.hotwords).toEqual([
      { word: 'rice' },
      { word: 'water' },
    ]);
  });

  it('derives course context from the websocket query and skips cleared next words', () => {
    const session = parseAsrSessionInfoFromUrl(
      '/api/voice/asr?courseId=food&targetWords=apple,milk&cardId=banana&clearedCardIds=bread,milk'
    );
    const payload = buildAsrRequestPayload(session);
    const context = JSON.parse(payload.request.corpus!.context);

    expect(context.hotwords).toEqual([
      { word: 'banana' },
      { word: 'egg' },
    ]);
  });

  it('falls back to course target words when no current card is available yet', () => {
    const session = parseAsrSessionInfoFromUrl('/api/voice/asr?courseId=animals');
    const payload = buildAsrRequestPayload(session);
    const context = JSON.parse(payload.request.corpus!.context);

    expect(context.hotwords.slice(0, 3)).toEqual([
      { word: 'cat' },
      { word: 'dog' },
      { word: 'bird' },
    ]);
  });

  it('falls back to explicit targetWords when cardId is stale', () => {
    const payload = buildAsrRequestPayload({
      courseId: 'animals',
      targetWords: ['cat', 'dog'],
      cardId: 'missing-card',
    });
    const context = JSON.parse(payload.request.corpus!.context);

    expect(context.hotwords).toEqual([
      { word: 'cat' },
      { word: 'dog' },
    ]);
  });

  it('omits corpus when no hot words are available', () => {
    const payload = buildAsrRequestPayload();

    expect(payload.request.corpus).toBeUndefined();
  });

  it('keeps ASR regression fixtures as real non-empty PCM WAV audio', () => {
    for (const name of fs.readdirSync(path.resolve('tests/fixtures/audio')).filter((item) => item.endsWith('.wav'))) {
      const filePath = path.resolve('tests/fixtures/audio', name);
      const wav = fs.readFileSync(filePath);
      const dataOffset = wav.indexOf('data', 12, 'ascii');
      const dataSize = dataOffset >= 0 ? wav.readUInt32LE(dataOffset + 4) : 0;
      const sampleRate = wav.readUInt32LE(24);
      const channels = wav.readUInt16LE(22);
      const bitsPerSample = wav.readUInt16LE(34);
      const durationMs = Math.round((dataSize / (sampleRate * channels * (bitsPerSample / 8))) * 1000);

      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
      expect(sampleRate).toBe(16000);
      expect(channels).toBe(1);
      expect(bitsPerSample).toBe(16);
      expect(durationMs).toBeGreaterThanOrEqual(400);
    }
  });
});

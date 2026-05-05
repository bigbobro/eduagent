import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildAsrRequestPayload,
  correctAsrTextWithSessionContext,
  parseAsrSessionInfoFromUrl,
} from '@/lib/voice/asr-proxy';

describe('ASR hot words', () => {
  it('injects target words as Doubao corpus context hotwords', () => {
    const payload = buildAsrRequestPayload({
      courseId: 'timeNumbers',
      targetWords: ['hour', 'thousand', 'hour'],
      cardId: 'sentence_thousand_hundred',
    });

    expect(payload.request.corpus).toBeDefined();
    const context = JSON.parse(payload.request.corpus!.context);
    expect(context.hotwords).toEqual([
      { word: 'hour' },
      { word: 'thousand' },
      { word: 'One thousand is ten hundreds.' },
    ]);
  });

  it('derives course target words and current card from the websocket query', () => {
    const session = parseAsrSessionInfoFromUrl(
      '/api/voice/asr?courseId=timeNumbers&targetWords=hour,thousand&cardId=minute'
    );
    const payload = buildAsrRequestPayload(session);
    const context = JSON.parse(payload.request.corpus!.context);

    expect(context.hotwords).toEqual([
      { word: 'hour' },
      { word: 'thousand' },
      { word: 'minute' },
    ]);
  });

  it('omits corpus when no hot words are available', () => {
    const payload = buildAsrRequestPayload();

    expect(payload.request.corpus).toBeUndefined();
  });

  it('corrects known ASR misses only when the current card context is explicit', () => {
    expect(
      correctAsrTextWithSessionContext('Our.', {
        courseId: 'timeNumbers',
        targetWords: ['hour'],
        cardId: 'hour',
      })
    ).toBe('hour');
    expect(
      correctAsrTextWithSessionContext('1000 is 10.', {
        courseId: 'timeNumbers',
        targetWords: ['thousand', 'hundred'],
        cardId: 'sentence_thousand_hundred',
      })
    ).toBe('One thousand is ten hundreds.');
    expect(correctAsrTextWithSessionContext('Our.', {})).toBe('Our.');
    expect(
      correctAsrTextWithSessionContext('Your.', {
        courseId: 'timeNumbers',
        targetWords: ['hour'],
        cardId: 'hour',
      })
    ).toBe('Your.');
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

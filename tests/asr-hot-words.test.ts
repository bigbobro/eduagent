import { describe, expect, it } from 'vitest';
import {
  buildAsrRequestPayload,
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
});

import { describe, it, expect } from 'vitest';
import { StreamingSpeechExtractor } from './speech-extractor';

function feedAll(extractor: StreamingSpeechExtractor, chunks: string[]): string {
  let speech = '';
  for (const c of chunks) {
    const r = extractor.feed(c);
    if (r.speechDelta) speech += r.speechDelta;
  }
  return speech;
}

describe('StreamingSpeechExtractor', () => {
  it('extracts a simple speech field across chunks', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, [
      '{"speech": "Hel',
      'lo! Look at',
      ' this. It\'s a boat!"',
      ', "actions": []}',
    ]);
    expect(out).toBe("Hello! Look at this. It's a boat!");
  });

  it('handles escape sequences \\" \\\\ \\n', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, ['{"speech":"a\\"b\\\\c\\nd"}']);
    expect(out).toBe('a"b\\c\nd');
  });

  it('handles \\uXXXX escapes', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, ['{"speech":"hi \\u4f60\\u597d"}']);
    expect(out).toBe('hi 你好');
  });

  it('extracts speech even when actions appears first in JSON', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, [
      '{"actions": [{"tool":"show","params":{"image_id":"car"}}], ',
      '"speech": "看小汽车!"}',
    ]);
    expect(out).toBe('看小汽车!');
  });

  it('handles the speech key being split across chunks', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, ['{"sp', 'eec', 'h"', ': ', '"hi"}']);
    expect(out).toBe('hi');
  });

  it('finalize parses the full JSON for actions/state_update', () => {
    const ex = new StreamingSpeechExtractor();
    const full = '{"speech":"hi","actions":[{"tool":"show","params":{"image_id":"car"}}],"state_update":{"current_word":"car"}}';
    feedAll(ex, [full]);
    const result = ex.finalize();
    expect(result.actions).toEqual([{ tool: 'show', params: { image_id: 'car' } }]);
    expect(result.state_update).toEqual({ current_word: 'car' });
  });

  it('finalize on malformed JSON returns whatever speech was extracted with empty actions', () => {
    const ex = new StreamingSpeechExtractor();
    feedAll(ex, ['{"speech":"hi","actions":[bad']);
    const result = ex.finalize();
    expect(result.speech).toBe('hi');
    expect(result.actions).toEqual([]);
    expect(result.malformed).toBe(true);
  });

  it('does not yield from a non-speech string field that looks similar', () => {
    const ex = new StreamingSpeechExtractor();
    const out = feedAll(ex, ['{"speechx":"NO","speech":"YES"}']);
    expect(out).toBe('YES');
  });

  it('marks complete: true when speech field is fully closed', () => {
    const ex = new StreamingSpeechExtractor();
    let complete = false;
    for (const c of ['{"speech":"hi"', ',"actions":[]}']) {
      const r = ex.feed(c);
      if (r.complete) complete = true;
    }
    expect(complete).toBe(true);
  });
});

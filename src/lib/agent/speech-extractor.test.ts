import { describe, it, expect } from 'vitest';
import { StreamingSpeechExtractor, sanitizeSpeech } from './speech-extractor';

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
      '{"actions": [{"tool":"show_card","params":{"card_id":"car"}}], ',
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
    const full = '{"speech":"hi","actions":[{"tool":"show_card","params":{"card_id":"car"}}],"state_update":{"current_word":"car"}}';
    feedAll(ex, [full]);
    const result = ex.finalize();
    expect(result.actions).toEqual([{ tool: 'show_card', params: { card_id: 'car' } }]);
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

describe('sanitizeSpeech', () => {
  it('replaces card_id-style tokens with a space', () => {
    expect(sanitizeSpeech('看 sentence_cat 这张图')).toBe('看   这张图');
    expect(sanitizeSpeech('sentence_apple is here')).toBe('  is here');
  });

  it('leaves normal English words and single words untouched', () => {
    expect(sanitizeSpeech('cat is here')).toBe('cat is here');
    expect(sanitizeSpeech('Hello! Look at this.')).toBe('Hello! Look at this.');
  });

  it('does not strip Chinese or punctuation', () => {
    expect(sanitizeSpeech('我们一起读 cat。')).toBe('我们一起读 cat。');
  });

  it('handles multiple underscores in one id', () => {
    expect(sanitizeSpeech('show word_apple_red please')).toBe('show   please');
  });

  it('strips leading-of-string and end-of-string tokens', () => {
    expect(sanitizeSpeech('sentence_cat')).toBe(' ');
    expect(sanitizeSpeech('开始 sentence_cat')).toBe('开始  ');
  });
});

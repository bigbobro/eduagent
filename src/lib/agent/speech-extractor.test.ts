import { describe, it, expect } from 'vitest';
import { StreamingSpeechExtractor, sanitizeSpeech } from './speech-extractor';

function feedChunks(extractor: StreamingSpeechExtractor, chunks: string[]): void {
  for (const c of chunks) extractor.feed(c);
}

function extractSpeech(chunks: string[]): string {
  const ex = new StreamingSpeechExtractor();
  feedChunks(ex, chunks);
  return ex.finalize().speech;
}

describe('StreamingSpeechExtractor', () => {
  it('extracts a simple speech field across chunks', () => {
    expect(extractSpeech([
      '{"speech": "Hel',
      'lo! Look at',
      ' this. It\'s a boat!"',
      ', "actions": []}',
    ])).toBe("Hello! Look at this. It's a boat!");
  });

  it('handles escape sequences \\" \\\\ \\n', () => {
    expect(extractSpeech(['{"speech":"a\\"b\\\\c\\nd"}'])).toBe('a"b\\c\nd');
  });

  it('handles \\uXXXX escapes', () => {
    expect(extractSpeech(['{"speech":"hi \\u4f60\\u597d"}'])).toBe('hi 你好');
  });

  it('extracts speech even when actions appears first in JSON', () => {
    expect(extractSpeech([
      '{"actions": [{"tool":"show_card","params":{"card_id":"car"}}], ',
      '"speech": "看小汽车!"}',
    ])).toBe('看小汽车!');
  });

  it('handles the speech key being split across chunks', () => {
    expect(extractSpeech(['{"sp', 'eec', 'h"', ': ', '"hi"}'])).toBe('hi');
  });

  it('finalize parses the full JSON for actions/state_update', () => {
    const ex = new StreamingSpeechExtractor();
    feedChunks(ex, ['{"speech":"hi","actions":[{"tool":"show_card","params":{"card_id":"car"}}],"state_update":{"current_word":"car"}}']);
    const result = ex.finalize();
    expect(result.actions).toEqual([{ tool: 'show_card', params: { card_id: 'car' } }]);
    expect(result.state_update).toEqual({ current_word: 'car' });
  });

  it('finalize on malformed JSON returns whatever speech was extracted with empty actions', () => {
    const ex = new StreamingSpeechExtractor();
    feedChunks(ex, ['{"speech":"hi","actions":[bad']);
    const result = ex.finalize();
    expect(result.speech).toBe('hi'); // from the streamed this.speech fallback
    expect(result.actions).toEqual([]);
    expect(result.malformed).toBe(true);
  });

  it('finalize fallback decodes escapes from the streamed buffer on malformed JSON', () => {
    // Exercises the kept IN_STRING_ESCAPE accumulation: JSON.parse fails, so finalize
    // must return this.speech with the escape already decoded.
    const ex = new StreamingSpeechExtractor();
    feedChunks(ex, ['{"speech":"a\\nb","actions":[bad']);
    const result = ex.finalize();
    expect(result.speech).toBe('a\nb');
    expect(result.malformed).toBe(true);
  });

  it('does not extract from a non-speech string field that looks similar', () => {
    expect(extractSpeech(['{"speechx":"NO","speech":"YES"}'])).toBe('YES');
  });

  // bug 3: a non-speech value split across a feed() chunk boundary derails the streaming
  // scanner (skip helpers only scan the current chunk), but finalize() must still recover
  // the speech from the fully-parsed buffer.
  it('recovers speech via finalize when a nested value is split across a chunk boundary', () => {
    const ex = new StreamingSpeechExtractor();
    feedChunks(ex, ['{"state_update":{"evidence":"abc', 'def"},"speech":"WORLD"}']);
    const result = ex.finalize();
    expect(result.speech).toBe('WORLD');
    expect(result.malformed).toBeUndefined();
  });

  it('finalize prefers the parsed speech when a string value is split across a boundary', () => {
    const ex = new StreamingSpeechExtractor();
    feedChunks(ex, ['{"x":"a\\', '"b","speech":"ZZZ"}']);
    expect(ex.finalize().speech).toBe('ZZZ');
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

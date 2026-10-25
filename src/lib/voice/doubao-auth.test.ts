import { describe, expect, it } from 'vitest';
import { doubaoAuthHeaders, doubaoAuthHeadersFor, resolveDoubaoAuthMode } from './doubao-auth';

describe('doubao auth headers', () => {
  it('uses one X-Api-Key row for the new console on both services', () => {
    const auth = { mode: 'apikey' as const, apiKey: 'fake-api-key', appId: 'app', accessKey: 'access' };
    expect(doubaoAuthHeadersFor('asr', auth)).toEqual({ 'X-Api-Key': 'fake-api-key' });
    expect(doubaoAuthHeadersFor('tts', auth)).toEqual({ 'X-Api-Key': 'fake-api-key' });
  });

  it('keeps the old console names, which differ between ASR and TTS', () => {
    const auth = { mode: 'legacy' as const, apiKey: 'fake-api-key', appId: 'app', accessKey: 'access' };
    expect(doubaoAuthHeadersFor('asr', auth)).toEqual({
      'X-Api-App-Key': 'app',
      'X-Api-Access-Key': 'access',
    });
    expect(doubaoAuthHeadersFor('tts', auth)).toEqual({
      'X-Api-App-Id': 'app',
      'X-Api-Access-Key': 'access',
    });
  });

  it('infers the mode when DOUBAO_AUTH_MODE is unset or unknown', () => {
    expect(resolveDoubaoAuthMode({})).toBe('apikey');
    expect(resolveDoubaoAuthMode({ DOUBAO_API_KEY: 'k' })).toBe('apikey');
    expect(resolveDoubaoAuthMode({ DOUBAO_APP_ID: 'app' })).toBe('legacy');
    expect(resolveDoubaoAuthMode({ DOUBAO_ACCESS_KEY: 'access' })).toBe('legacy');
    expect(resolveDoubaoAuthMode({ DOUBAO_AUTH_MODE: 'legacy', DOUBAO_API_KEY: 'k' })).toBe('legacy');
    expect(resolveDoubaoAuthMode({ DOUBAO_AUTH_MODE: 'nope', DOUBAO_APP_ID: 'app' })).toBe('legacy');
    expect(doubaoAuthHeaders('tts', { DOUBAO_AUTH_MODE: 'apikey', DOUBAO_API_KEY: 'k' })).toEqual({ 'X-Api-Key': 'k' });
  });
});

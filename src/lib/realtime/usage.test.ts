import { expect, it } from 'vitest';
import { summarizeRealtimeUsage } from './usage';
it('separates cached audio/text, incomplete usage and actual cash billing', () => {
  const usage = { model: 'gpt-realtime-2.1', complete: true, usage: [{ input_tokens: 100, output_tokens: 20,
    input_token_details: { text_tokens: 50, audio_tokens: 50, cached_tokens: 20, cached_tokens_details: { text_tokens: 10, audio_tokens: 10 } },
    output_token_details: { text_tokens: 10, audio_tokens: 10 } }] };
  expect(summarizeRealtimeUsage(usage).tokenPriceUsd).toBeCloseTo(0.002328);
  expect(summarizeRealtimeUsage({ ...usage, pending: 1 }).tokenPriceUsd).toBeNull();
  expect(summarizeRealtimeUsage({ ...usage, complete: false }).tokenPriceUsd).toBeNull();
  expect(summarizeRealtimeUsage({ ...usage, model: 'unknown' }).tokenPriceUsd).toBeNull();
});

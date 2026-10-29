import { realtimeUsageSchema } from '@/lib/realtime-protocol';

/** Official GPT-Realtime-2.1 token rates. Estimate only: credits and cash billing are external. */
export function summarizeRealtimeUsage(raw: unknown) {
  const value = raw && typeof raw === 'object' ? raw as { model?: unknown; usage?: unknown; complete?: unknown; pending?: unknown } : {};
  const model = typeof value.model === 'string' ? value.model : 'unknown';
  const rows = Array.isArray(value.usage) ? value.usage : [];
  let complete = value.complete === true && Array.isArray(value.usage) && (value.pending === undefined || value.pending === 0);
  let inputText = 0, inputAudio = 0, cachedText = 0, cachedAudio = 0, outputText = 0, outputAudio = 0;
  for (const row of rows) {
    const parsed = realtimeUsageSchema.safeParse(row);
    if (!parsed.success) { complete = false; continue; }
    const input = parsed.data.input_token_details; const output = parsed.data.output_token_details;
    const ct = input.cached_tokens_details?.text_tokens ?? 0, ca = input.cached_tokens_details?.audio_tokens ?? 0;
    if (ct + ca !== input.cached_tokens || ct > input.text_tokens || ca > input.audio_tokens) { complete = false; continue; }
    inputText += input.text_tokens; inputAudio += input.audio_tokens; cachedText += ct; cachedAudio += ca;
    outputText += output.text_tokens; outputAudio += output.audio_tokens;
  }
  const knownTokenPriceUsd = model === 'gpt-realtime-2.1'
    ? ((inputText - cachedText) * 4 + (inputAudio - cachedAudio) * 32 + (cachedText + cachedAudio) * 0.4 + outputText * 24 + outputAudio * 64) / 1_000_000 : null;
  return { model, responses: rows.length, complete, inputText, inputAudio, cachedText, cachedAudio, outputText, outputAudio,
    knownTokenPriceUsd, tokenPriceUsd: complete ? knownTokenPriceUsd : null };
}

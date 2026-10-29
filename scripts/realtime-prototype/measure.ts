/** Offline measurements of experiment evidence, not a teaching-quality judge. */
interface Usage {
  input_token_details?: { text_tokens?: number; audio_tokens?: number; image_tokens?: number; cached_tokens?: number; cached_tokens_details?: { text_tokens?: number; audio_tokens?: number } };
  output_token_details?: { text_tokens?: number; audio_tokens?: number };
}
interface Row {
  kind?: string; expected?: string[]; caseId?: string; assessments?: Array<{ result: string }>;
  inputEvidence?: { retrievedRms: number; sentSha256: string; retrievedSha256: string };
  usageComplete?: boolean; usageIncomplete?: boolean; usage?: Usage[]; eventTypes?: string[];
  audioBeforeAssessment?: boolean; firstAudioMs?: number | null; error?: string;
}
export function measureReport(report: { model?: string; results: Row[] }) {
  const rows = report.results.filter((row) => row.kind !== 'presentation' && row.kind !== 'no-input');
  const graded = rows.filter((row) => row.expected?.length === 1);
  const positives = graded.filter((row) => row.expected![0] === 'correct');
  const negatives = graded.filter((row) => row.expected![0] !== 'correct');
  const prediction = (row: Row) => row.assessments?.length === 1 ? row.assessments[0].result : undefined;
  const priceRows = report.results.map((row) => {
    if (row.kind === 'no-input' && row.usageComplete && !row.usage?.length) return 0;
    if (row.usageComplete === false || row.usageIncomplete || !row.usage?.length) return null;
    if (row.usageComplete !== true && row.eventTypes?.filter((type) => type === 'response.done').length !== row.usage.length) return null;
    const prices = row.usage.map(tokenPrice);
    return prices.some((value) => value === null) ? null : prices.reduce<number>((sum, value) => sum + value!, 0);
  });
  const usageComplete = priceRows.every((value) => value !== null);
  const times = rows.map((row) => row.firstAudioMs).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
  return {
    turns: rows.length, ignoredDigitalSilence: report.results.filter((row) => row.kind === 'no-input').length, strictLabelledTurns: graded.length,
    exactMatches: graded.filter((row) => prediction(row) === row.expected![0]).length,
    positiveTotal: positives.length, positivePassed: positives.filter((row) => prediction(row) === 'correct').length,
    negativeTotal: negatives.length, negativePassed: negatives.filter((row) => prediction(row) === 'correct').length,
    missingOrDuplicateAssessments: rows.filter((row) => row.assessments?.length !== 1).length,
    nonSilentReportedSilence: rows.filter((row) => (row.inputEvidence?.retrievedRms ?? 0) > 0 && prediction(row) === 'silence').length,
    inputHashMismatches: rows.filter((row) => row.inputEvidence && row.inputEvidence.sentSha256 !== row.inputEvidence.retrievedSha256).length,
    inspectedInputs: rows.filter((row) => row.inputEvidence).length,
    audioBeforeReceipt: rows.filter((row) => row.audioBeforeAssessment).length,
    receivedAudioMedianMs: times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.ceil((times.length - 1) / 2)]) / 2 : null,
    errors: report.results.filter((row) => row.error).length, usageComplete,
    tokenPriceUsd: usageComplete && report.model === 'gpt-realtime-2.1' ? priceRows.reduce<number>((sum, value) => sum + value!, 0) : null,
  };
}

function tokenPrice(usage: Usage): number | null {
  const input = usage.input_token_details; const output = usage.output_token_details;
  const values = [input?.text_tokens, input?.audio_tokens, output?.text_tokens, output?.audio_tokens];
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0) || (input?.image_tokens ?? 0) > 0) return null;
  const cached = input?.cached_tokens_details;
  if ((input?.cached_tokens ?? 0) > 0 && !cached) return null;
  const ct = cached?.text_tokens ?? 0; const ca = cached?.audio_tokens ?? 0;
  if ((input?.cached_tokens ?? 0) !== ct + ca) return null;
  if (![ct, ca].every((value) => Number.isFinite(value)) || ct < 0 || ca < 0 || ct > input!.text_tokens! || ca > input!.audio_tokens!) return null;
  return ((input!.text_tokens! - ct) * 4 + (input!.audio_tokens! - ca) * 32 + (ct + ca) * 0.4 + output!.text_tokens! * 24 + output!.audio_tokens! * 64) / 1_000_000;
}

import { expect, it } from 'vitest';
import { measureReport } from './measure';

it('separates non-silent input loss claims, exact grading and incorrect passes', () => {
  const report = measureReport({ model: 'gpt-realtime-2.1', results: [
    { caseId: 'chinese-only', expected: ['wrong'], assessments: [{ result: 'silence' }], inputEvidence: { retrievedRms: 1200, sentSha256: 'same', retrievedSha256: 'same' }, usageComplete: true, usage: [] },
    { caseId: 'silence', expected: ['silence'], assessments: [{ result: 'correct' }], inputEvidence: { retrievedRms: 0, sentSha256: 'zero', retrievedSha256: 'zero' }, usageComplete: true, usage: [] },
    { caseId: 'cat-correct', expected: ['correct'], assessments: [{ result: 'correct' }], usageComplete: true, usage: [] },
  ] });
  expect(report.nonSilentReportedSilence).toBe(1);
  expect(report.negativePassed).toBe(1);
  expect(report.exactMatches).toBe(1);
  expect(report.inputHashMismatches).toBe(0);
});

it('does not present missing usage as a zero-cost completed run', () => {
  const report = measureReport({ model: 'gpt-realtime-2.1', results: [
    { expected: ['correct'], assessments: [{ result: 'correct' }], usageComplete: false, usage: [] },
  ] });
  expect(report.tokenPriceUsd).toBeNull();
  expect(report.usageComplete).toBe(false);
});

it('prices a worked audio/text usage example without counting reasoning twice', () => {
  const report = measureReport({ model: 'gpt-realtime-2.1', results: [{ expected: ['correct'],
    assessments: [{ result: 'correct' }], usageComplete: true, usage: [{
      input_token_details: { text_tokens: 618, audio_tokens: 13, cached_tokens: 0 },
      output_token_details: { text_tokens: 102, audio_tokens: 77 },
    }] }] });
  expect(report.tokenPriceUsd).toBeCloseTo(0.010264, 9);
});

it('counts known digital silence as ignored input and no API usage, not model accuracy', () => {
  const report = measureReport({ model: 'gpt-realtime-2.1', results: [{ kind: 'no-input', expected: ['silence'],
    assessments: [], usageComplete: true, usage: [] }] });
  expect(report.ignoredDigitalSilence).toBe(1);
  expect(report.strictLabelledTurns).toBe(0);
  expect(report.tokenPriceUsd).toBe(0);
});

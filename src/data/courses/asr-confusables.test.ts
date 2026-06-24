import { describe, expect, it } from 'vitest';
import { ASR_CONFUSABLES } from './asr-confusables';
import { getCourseById } from '.';
import { getR2MatchTargets, normalizeR2MatchText } from '@/lib/agent/memory';

/**
 * Coverage guard: every recorded ASR mis-recognition must be accepted by the SAME R2
 * matching production uses, i.e. the card's asrAliases cover the observed text. This is
 * the general, data-driven replacement for one-off per-word homophone checks; the
 * behavioral magic-knight-alias.test.ts still exercises the full normalize pipeline.
 */
function uncoveredConfusables(): string[] {
  const problems: string[] = [];
  for (const c of ASR_CONFUSABLES) {
    const course = getCourseById(c.courseId);
    const card = course?.cards.find((x) => x.id === c.cardId);
    if (!card || card.kind !== 'word') {
      problems.push(`${c.courseId}/${c.cardId}: not a word card`);
      continue;
    }
    const targets = getR2MatchTargets(card);
    const asr = normalizeR2MatchText(c.observedAsr);
    if (!targets.some((t) => asr.includes(t))) {
      problems.push(`${c.courseId}/${c.cardId}: observed ASR "${c.observedAsr}" not covered by asrAliases`);
    }
  }
  return problems;
}

describe('asr-confusables coverage', () => {
  it('records the known knight/night homophone', () => {
    expect(ASR_CONFUSABLES.some((c) => c.cardId === 'knight')).toBe(true);
  });

  it('every recorded ASR mis-recognition is covered by production R2 matching', () => {
    expect(uncoveredConfusables()).toEqual([]);
  });
});

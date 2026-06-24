/**
 * Data-backed record of ASR mis-recognitions for course target words.
 *
 * Each entry says: when a child says <card>'s English word correctly, Doubao ASR was
 * observed to output `observedAsr` instead. For the R2 literal-match rule to ever clear
 * that card, the card's `asrAliases` must cover `observedAsr`. The asr-confusables.test.ts
 * guard asserts (across all courses) that every entry here is covered by production R2
 * matching — turning "which words are ASR-confusable and are they handled" from tribal
 * knowledge into one importable, diffable, test-checked list.
 *
 * REFRESH — operator step (needs .env.local creds + network + human judgment):
 *   pnpm tsx scripts/asr-word-scan.ts            # or --only <courseId>
 * The probe writes its MISSes to docs/lesson-reports/asr-word-scan-*.json. For each MISS,
 * add an entry below AND, per the CLAUDE.md asrAliases checklist, add the observed text to
 * that card's `asrAliases`. Chinese aliases are risky (they let a child "pass" by speaking
 * Chinese) — only add one when even correct English is heard as Chinese. This artifact is a
 * SNAPSHOT of one probe run; re-run periodically as the upstream ASR model changes.
 */
export interface AsrConfusable {
  courseId: string;
  cardId: string;
  /** Raw ASR text Doubao produced for the correctly-pronounced word. */
  observedAsr: string;
}

export const ASR_CONFUSABLES: AsrConfusable[] = [
  // knight/night homophone — Doubao hears the correct "knight" as "night"/"夜晚".
  // Covered by magic course knight.asrAliases = ["night", "夜晚"].
  { courseId: 'magic', cardId: 'knight', observedAsr: 'night.' },
  { courseId: 'magic', cardId: 'knight', observedAsr: '夜晚' },
];

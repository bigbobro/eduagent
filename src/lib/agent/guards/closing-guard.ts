import { GuardFn } from './index';

/**
 * R4 + R6: closing guard.
 *
 * If the LLM speech contains any course target word that has NOT been learned this
 * session, replace the entire speech with a safe wrap-up template.
 *
 * R6 exemption: the word currently being taught (from both memory.currentWord and
 * state_update.current_word) is exempt from the unlearned check, because mentioning
 * it is legitimate; without this, teaching "cat" would trigger override every turn.
 *
 * Why OR(memory + LLM current word): memory.currentWord reflects last turn's committed
 * state; state_update.current_word is what the LLM claims this turn. Trusting only one
 * creates a one-turn gap when the lesson advances to a new card.
 */
export const closingGuard: GuardFn = (ctx) => {
  const { speech, memory, course, stateUpdate } = ctx;
  const wordsLearned = memory.wordsLearned;
  const targetWords = course.cards
    .filter((c) => c.kind === 'word')
    .map((c) => c.english);
  const memoryCurrentWord = (memory.currentWord || '').toLowerCase();
  const llmCurrentWord = (stateUpdate.current_word || '').toLowerCase();

  const unlearnedMentioned = targetWords.filter((w) => {
    if (wordsLearned.includes(w)) return false;
    const wLower = w.toLowerCase();
    if (wLower === memoryCurrentWord || wLower === llmCurrentWord) return false;
    const token = wLower.replace(/[.,!?;]/g, '');
    return token.length > 0 && new RegExp(`\\b${token}\\b`, 'i').test(speech);
  });

  if (unlearnedMentioned.length === 0) return ctx;

  console.warn('[session] closing guard: LLM mentioned unlearned words', unlearnedMentioned, '— overriding speech');
  const learnedDisplay = wordsLearned.length > 0 ? wordsLearned.join('、') : '一些新词';
  return {
    ...ctx,
    speech: `今天我们一起练了 ${learnedDisplay},你说得很努力！下次再来玩吧。`,
  };
};

import type { WordCard } from '@/types/course';
import type { assessorReportSchema } from '@/lib/realtime-protocol';

type Report = ReturnType<typeof assessorReportSchema.parse>;
type Context = { wrapped: boolean; clearedCardIds: string[] };
type Note = { kind: 'verdict' | 'mismatch' | 'echo' | 'stuck'; text: string; log: { result: Report['result'] } | { count: number } };

type Pending = { text: string; count: number; targetId: string };
interface Rule {
  report?(card: WordCard, report: Report): void;
  saved?(card: WordCard, report: Report, context: Context): void;
  take(context: Context): Note | null;
}

function verdictRule(): Rule {
  let pending: { text: string; result: Report['result'] } | null = null;
  return {
    report(card, report) {
      const heard = JSON.stringify(report.heard.slice(0, 80));
      pending = { result: report.result, text: report.result === 'not_attempt'
        ? `[app] Heard: the child's last message was not a try at the screen card ${card.english} (heard ${heard}).`
        : `[app] Heard: on the card ${card.english} the app judged the child's last answer as ${report.result} (heard ${heard}).` };
    },
    take() {
      const note = pending; pending = null;
      return note ? { kind: 'verdict', text: note.text, log: { result: note.result } } : null;
    },
  };
}

function mismatchRule(): Rule {
  let current = { targetId: '', count: 0 };
  let pending: { text: string; count: number } | null = null;
  return {
    report(card, report) {
      if (current.targetId !== card.id || report.result !== 'not_attempt') current = { targetId: card.id, count: 0 };
      if (report.result === 'not_attempt' && ++current.count === 3) pending = { count: current.count,
        text: `[app] The child's last 3 messages were not tries at the screen card ${card.english}. If you are practising a different word or one of the course sentences, first put that card on the screen with show_card so the screen matches what you ask; otherwise come back to the screen card.` };
    },
    take() {
      const note = pending; pending = null;
      return note ? { kind: 'mismatch', text: note.text, log: { count: note.count } } : null;
    },
  };
}

function echoRule(): Rule {
  const counts = new Map<string, number>();
  let pending: Pending | null = null;
  return {
    saved(card, report, context) {
      if (card.kind !== 'word' || report.result !== 'correct' || report.mastered) return;
      const count = (counts.get(card.id) ?? 0) + 1;
      counts.set(card.id, count);
      if (count % 2 === 1 && !context.wrapped && !context.clearedCardIds.includes(card.id)) pending = { count, targetId: card.id,
        text: `[app] The child has now said ${card.english} correctly ${count} times right after your model. Next, do not ask for another echo on this card: ask once with a cue that does not contain the English word (the Chinese meaning or a situation) and stop to listen. Do this only while this card is on screen. If you have already switched cards, finish teaching the card you have, then use show_card to return to this card before asking. If they cannot recall it, give one different kind of help and one more chance; if it still does not come, leave this word for now, move on to another word and come back to it later. Do not tell the child "先停一下" or "待会儿再练"; just show the next card.` };
    },
    take(context) {
      const note = pending; pending = null;
      if (!note || context.wrapped || context.clearedCardIds.includes(note.targetId)) return null;
      return { kind: 'echo', text: note.text, log: { count: note.count } };
    },
  };
}

function stuckRule(): Rule {
  const counts = new Map<string, number>();
  let pending: Pending | null = null;
  return {
    saved(card, report, context) {
      if (card.kind !== 'word') return;
      const count = report.result === 'correct' ? 0 : (counts.get(card.id) ?? 0) + 1;
      counts.set(card.id, count);
      if (count > 0 && count % 4 === 0 && !context.wrapped) pending = { count, targetId: card.id,
        text: `[app] The child has tried ${card.english} ${count} times in a row without getting it right. Do not ask them to say it again now. Say the correct word naturally once in one sentence and, in that same turn, use show_card to move to another word; return to this word later or next sitting. Do not tell the child "先停一下" or "待会儿再练"; just show the next card.` };
    },
    take(context) {
      const note = pending; pending = null;
      if (!note || context.wrapped || (counts.get(note.targetId) ?? 0) < note.count || context.clearedCardIds.includes(note.targetId)) return null;
      return { kind: 'stuck', text: note.text, log: { count: note.count } };
    },
  };
}

/** Send order is part of the provider-visible contract. */
export function createAppNoteRules(): Rule[] {
  return [verdictRule(), mismatchRule(), echoRule(), stuckRule()];
}

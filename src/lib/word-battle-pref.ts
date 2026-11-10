/** Word battle switch: a browser-local preference, on unless the parent turned it off. Read when a lesson starts. */
const KEY = 'eduagent.wordBattle';
export function isWordBattleOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setWordBattleOn(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: stays on for this page */ }
}

/** The monster left untamed when a sitting ended comes back first next time. One-shot: reading it clears it. */
const NEXT = 'eduagent.wordBattle.nextKind';
export function rememberEscapedMonster(kind: number): void {
  try { localStorage.setItem(NEXT, String(kind)); } catch { /* next sitting just starts with a random one */ }
}
export function takeEscapedMonster(): number | null {
  try {
    const raw = localStorage.getItem(NEXT); localStorage.removeItem(NEXT);
    const kind = raw === null ? NaN : Number(raw);
    return Number.isInteger(kind) && kind >= 0 ? kind : null;
  } catch { return null; }
}

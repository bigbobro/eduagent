/** Word battle switch: a browser-local preference, on unless the parent turned it off. Read when a lesson starts. */
const KEY = 'eduagent.wordBattle';
export function isWordBattleOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setWordBattleOn(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: stays on for this page */ }
}

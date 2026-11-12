/** Speaker mode switch: a browser-local preference, on unless the parent turned it off. Read when a lesson starts. */
const KEY = 'eduagent.speakerMode';
export function isSpeakerModeOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSpeakerModeOn(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: stays on for this page */ }
}

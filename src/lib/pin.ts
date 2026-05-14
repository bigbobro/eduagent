const KEY_PIN = 'bunny.parents.pin';
const KEY_FAIL = 'bunny.parents.failcount';
const KEY_LOCK = 'bunny.parents.lockedUntil';
const SALT = 'bunny-attic-2026';
const MAX_FAIL = 3;
const LOCKOUT_MS = 30_000;

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hasPin(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(KEY_PIN) !== null;
}

export async function setPin(pin: string): Promise<void> {
  const hash = await sha256Hex(SALT + pin);
  localStorage.setItem(KEY_PIN, hash);
  localStorage.removeItem(KEY_FAIL);
  localStorage.removeItem(KEY_LOCK);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(KEY_PIN);
  if (!stored) return false;
  const ok = stored === (await sha256Hex(SALT + pin));
  if (ok) {
    localStorage.removeItem(KEY_FAIL);
    localStorage.removeItem(KEY_LOCK);
  }
  return ok;
}

export function recordFail(): void {
  const cur = Number(localStorage.getItem(KEY_FAIL) ?? '0') + 1;
  localStorage.setItem(KEY_FAIL, String(cur));
  if (cur >= MAX_FAIL) {
    localStorage.setItem(KEY_LOCK, String(Date.now() + LOCKOUT_MS));
  }
}

export function isLockedOut(): { locked: boolean; resumeAt?: number } {
  const until = Number(localStorage.getItem(KEY_LOCK) ?? '0');
  if (until && until > Date.now()) return { locked: true, resumeAt: until };
  if (until && until <= Date.now()) {
    localStorage.removeItem(KEY_LOCK);
    localStorage.removeItem(KEY_FAIL);
  }
  return { locked: false };
}

export function clearAll(): void {
  localStorage.removeItem(KEY_PIN);
  localStorage.removeItem(KEY_FAIL);
  localStorage.removeItem(KEY_LOCK);
}

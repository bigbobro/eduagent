import { initDatabase } from './db/schema';

let initialized = false;

export function ensureInitialized(): void {
  if (initialized) return;
  initDatabase();
  initialized = true;
}

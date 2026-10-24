import { initDatabase } from './db/schema';

let databaseInitialized = false;
let initialized = false;

export function ensureDatabaseInitialized(): void {
  if (databaseInitialized) return;
  initDatabase();
  databaseInitialized = true;
}

export function ensureInitialized(): void {
  if (initialized) return;
  ensureDatabaseInitialized();
  initialized = true;
}

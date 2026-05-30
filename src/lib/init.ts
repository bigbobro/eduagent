import { initDatabase } from './db/schema';

const REQUIRED_ENV = [
  'MIMO_BASE_URL',
  'MIMO_API_KEY',
  'DOUBAO_APP_ID',
  'DOUBAO_ACCESS_KEY',
  'DOUBAO_ASR_RESOURCE_ID',
  'DOUBAO_TTS_RESOURCE_ID',
  'DOUBAO_TTS_DEFAULT_SPEAKER',
] as const;

function validateEnv(): void {
  if (process.env.VOICE_MOCK === 'true') {
    const mockRequired = ['MIMO_BASE_URL', 'MIMO_API_KEY'];
    for (const key of mockRequired) {
      if (!process.env[key]) {
        throw new Error(`Missing env var (mock mode): ${key}. See .env.example`);
      }
    }
    return;
  }
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Missing env var: ${key}. See .env.example`);
    }
  }
}

let databaseInitialized = false;
let initialized = false;

export function ensureDatabaseInitialized(): void {
  if (databaseInitialized) return;
  initDatabase();
  databaseInitialized = true;
}

export function ensureInitialized(): void {
  if (initialized) return;
  validateEnv();
  ensureDatabaseInitialized();
  initialized = true;
}

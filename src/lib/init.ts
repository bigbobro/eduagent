import { initDatabase } from './db/schema';

const REQUIRED_ENV = [
  'DOUBAO_APP_ID',
  'DOUBAO_ACCESS_KEY',
  'DOUBAO_ASR_RESOURCE_ID',
  'DOUBAO_TTS_RESOURCE_ID',
  'DOUBAO_TTS_DEFAULT_SPEAKER',
] as const;

function validateEnv(): void {
  // LLM 凭据:LLM_API_KEY(当前供应商)或整组回退的旧名 MIMO_API_KEY,二者有一即可
  // (base URL / model 在 config.ts 里有默认值)
  if (!process.env.LLM_API_KEY && !process.env.MIMO_API_KEY) {
    throw new Error('Missing env var: LLM_API_KEY (or legacy MIMO_API_KEY). See .env.example');
  }
  if (process.env.VOICE_MOCK === 'true') return;
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

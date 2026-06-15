import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getConfig, resetConfig } from './config';

// Minimum env for getConfig() to pass validation (everything else has defaults).
const REQUIRED: Record<string, string> = {
  MIMO_API_KEY: 'test-key',
  DOUBAO_APP_ID: 'app',
  DOUBAO_ACCESS_KEY: 'access',
  DOUBAO_ASR_RESOURCE_ID: 'asr',
  DOUBAO_TTS_RESOURCE_ID: 'tts',
};

describe('config: MiMo base URL resolution', () => {
  const KEYS = [...Object.keys(REQUIRED), 'MIMO_BASE_URL', 'MIMO_API_BASE'];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    for (const [k, v] of Object.entries(REQUIRED)) process.env[k] = v;
    delete process.env.MIMO_BASE_URL;
    delete process.env.MIMO_API_BASE;
    resetConfig();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
    resetConfig();
  });

  it('reads MIMO_BASE_URL into config.mimoApiBase', () => {
    process.env.MIMO_BASE_URL = 'https://example.test/v1';
    resetConfig();
    expect(getConfig().mimoApiBase).toBe('https://example.test/v1');
  });

  it('accepts MIMO_API_BASE as a backward-compat alias', () => {
    process.env.MIMO_API_BASE = 'https://alias.test/v1';
    resetConfig();
    expect(getConfig().mimoApiBase).toBe('https://alias.test/v1');
  });

  it('prefers MIMO_BASE_URL over the MIMO_API_BASE alias', () => {
    process.env.MIMO_BASE_URL = 'https://primary.test/v1';
    process.env.MIMO_API_BASE = 'https://alias.test/v1';
    resetConfig();
    expect(getConfig().mimoApiBase).toBe('https://primary.test/v1');
  });

  it('falls back to the canonical (live) default host when neither var is set', () => {
    resetConfig();
    expect(getConfig().mimoApiBase).toBe('https://token-plan-cn.xiaomimimo.com/v1');
  });
});

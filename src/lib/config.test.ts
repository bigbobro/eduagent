import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getConfig, resetConfig } from './config';

// Minimum env for getConfig() to pass validation (everything else has defaults).
const REQUIRED: Record<string, string> = {
  MIMO_API_KEY: 'legacy-key',
  DOUBAO_APP_ID: 'app',
  DOUBAO_ACCESS_KEY: 'access',
  DOUBAO_ASR_RESOURCE_ID: 'asr',
  DOUBAO_TTS_RESOURCE_ID: 'tts',
};

describe('config: LLM credential group resolution', () => {
  const KEYS = [
    ...Object.keys(REQUIRED),
    'LLM_API_KEY',
    'LLM_BASE_URL',
    'LLM_MODEL',
    'MIMO_BASE_URL',
    'MIMO_API_BASE',
    'MIMO_MODEL',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    for (const [k, v] of Object.entries(REQUIRED)) process.env[k] = v;
    for (const k of KEYS) {
      if (!(k in REQUIRED)) delete process.env[k];
    }
    resetConfig();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
    resetConfig();
  });

  it('uses the LLM_* triple when LLM_API_KEY is set', () => {
    process.env.LLM_API_KEY = 'new-key';
    process.env.LLM_BASE_URL = 'https://provider.test/v1';
    process.env.LLM_MODEL = 'test/model';
    resetConfig();
    const c = getConfig();
    expect(c.llmApiKey).toBe('new-key');
    expect(c.llmBaseUrl).toBe('https://provider.test/v1');
    expect(c.llmModel).toBe('test/model');
  });

  it('defaults base URL / model to SiliconFlow DeepSeek when only LLM_API_KEY is set', () => {
    process.env.LLM_API_KEY = 'new-key';
    resetConfig();
    const c = getConfig();
    expect(c.llmBaseUrl).toBe('https://api.siliconflow.cn/v1');
    expect(c.llmModel).toBe('deepseek-ai/DeepSeek-V4-Pro');
  });

  it('falls back to the whole MIMO_* group when LLM_API_KEY is empty (no cross-group mixing)', () => {
    process.env.LLM_API_KEY = '';
    process.env.LLM_BASE_URL = 'https://provider.test/v1'; // must be ignored: group fallback is atomic
    process.env.MIMO_BASE_URL = 'https://legacy.test/v1';
    process.env.MIMO_MODEL = 'legacy-model';
    resetConfig();
    const c = getConfig();
    expect(c.llmApiKey).toBe('legacy-key');
    expect(c.llmBaseUrl).toBe('https://legacy.test/v1');
    expect(c.llmModel).toBe('legacy-model');
  });

  it('accepts MIMO_API_BASE as a backward-compat alias in the legacy group', () => {
    process.env.MIMO_API_BASE = 'https://alias.test/v1';
    resetConfig();
    expect(getConfig().llmBaseUrl).toBe('https://alias.test/v1');
  });

  it('prefers MIMO_BASE_URL over the MIMO_API_BASE alias in the legacy group', () => {
    process.env.MIMO_BASE_URL = 'https://primary.test/v1';
    process.env.MIMO_API_BASE = 'https://alias.test/v1';
    resetConfig();
    expect(getConfig().llmBaseUrl).toBe('https://primary.test/v1');
  });

  it('legacy group falls back to the MiMo default host when no base var is set', () => {
    resetConfig();
    expect(getConfig().llmBaseUrl).toBe('https://token-plan-cn.xiaomimimo.com/v1');
  });
});

// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applySettingsToEnv,
  isMaskedValue,
  maskSecret,
  maskValues,
  mergeSubmitted,
  readSettingsFile,
  SETTINGS_DEFAULTS,
  type SettingsValues,
  writeSettingsFile,
} from './store';

const FAKE: SettingsValues = {
  ...SETTINGS_DEFAULTS,
  llmApiKey: 'sk-fake-aaaaaaaaaaaa1234',
  doubaoAppId: 'fake-app-9876543210',
  doubaoAccessKey: 'fake-access-key-abcd5678',
};

describe('settings store', () => {
  let dir: string;
  let path: string;
  const envKeys = ['EDUAGENT_APP', 'EDUAGENT_SETTINGS_PATH', 'LLM_API_KEY', 'LLM_MODEL', 'DOUBAO_APP_ID', 'DOUBAO_ACCESS_KEY', 'DOUBAO_ASR_RESOURCE_ID', 'DOUBAO_TTS_RESOURCE_ID', 'DOUBAO_TTS_DEFAULT_SPEAKER', 'MIMO_API_KEY'];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'eduagent-settings-'));
    path = join(dir, 'settings.json');
    for (const k of envKeys) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!;
    }
  });

  it('masks secrets to the last 4 chars and never fully reveals short values', () => {
    expect(maskSecret('sk-fake-aaaaaaaaaaaa1234')).toBe('••••1234');
    expect(maskSecret('abcd')).toBe('••••');
    expect(maskSecret('')).toBe('');
    const masked = maskValues(FAKE);
    expect(masked.llmApiKey).toBe('••••1234');
    expect(masked.doubaoAccessKey).toBe('••••5678');
    expect(masked.llmBaseUrl).toBe(FAKE.llmBaseUrl); // 非密钥原样
    expect(JSON.stringify(masked)).not.toContain('aaaaaaaaaaaa');
  });

  it('merge keeps the saved secret when the submission is masked or empty, overwrites otherwise', () => {
    const merged = mergeSubmitted(FAKE, { ...FAKE, llmApiKey: maskSecret(FAKE.llmApiKey), doubaoAccessKey: '', doubaoAppId: 'new-app-id', llmModel: 'm2' });
    expect(merged.llmApiKey).toBe(FAKE.llmApiKey);
    expect(merged.doubaoAccessKey).toBe(FAKE.doubaoAccessKey);
    expect(merged.doubaoAppId).toBe('new-app-id');
    expect(merged.llmModel).toBe('m2');
    expect(isMaskedValue('••••1234')).toBe(true);
  });

  it('writes settings.json with mode 0600 atomically (no temp file left behind) and round-trips', () => {
    writeSettingsFile(path, FAKE);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(['settings.json']);
    expect(readSettingsFile(path)).toEqual(FAKE);
    // 覆盖写仍是 0600
    writeSettingsFile(path, { ...FAKE, llmModel: 'other' });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8')).llmModel).toBe('other');
  });

  it('missing or corrupt file yields defaults with empty credentials', () => {
    expect(readSettingsFile(path)).toEqual(SETTINGS_DEFAULTS);
    writeFileSync(path, '{not json');
    expect(readSettingsFile(path)).toEqual(SETTINGS_DEFAULTS);
  });

  it('applySettingsToEnv: app mode maps fields onto the existing env names and drops inherited ones', () => {
    writeSettingsFile(path, FAKE);
    process.env.EDUAGENT_APP = '1';
    process.env.EDUAGENT_SETTINGS_PATH = path;
    process.env.MIMO_API_KEY = 'inherited-from-shell';
    applySettingsToEnv();
    expect(process.env.LLM_API_KEY).toBe(FAKE.llmApiKey);
    expect(process.env.DOUBAO_APP_ID).toBe(FAKE.doubaoAppId);
    expect(process.env.DOUBAO_ASR_RESOURCE_ID).toBe('volc.seedasr.sauc.duration');
    expect(process.env.DOUBAO_TTS_DEFAULT_SPEAKER).toBe(SETTINGS_DEFAULTS.doubaoTtsSpeaker);
    expect(process.env.MIMO_API_KEY).toBeUndefined();
  });

  it('applySettingsToEnv: web mode (no EDUAGENT_APP) leaves env untouched', () => {
    writeSettingsFile(path, FAKE);
    process.env.EDUAGENT_SETTINGS_PATH = path;
    process.env.LLM_API_KEY = 'from-env-local';
    applySettingsToEnv();
    expect(process.env.LLM_API_KEY).toBe('from-env-local');
  });
});

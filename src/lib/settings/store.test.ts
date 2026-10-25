// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canDeleteChannel } from './channels';
import {
  activeChannel,
  applySettingsToEnv,
  isMaskedValue,
  LEGACY_CHANNEL_ID,
  maskSecret,
  maskValues,
  mergeSubmitted,
  normalizeSettings,
  readSettingsFile,
  SETTINGS_DEFAULTS,
  type SettingsValues,
  writeSettingsFile,
} from './store';

const FAKE: SettingsValues = {
  ...SETTINGS_DEFAULTS,
  llmChannels: [{
    ...SETTINGS_DEFAULTS.llmChannels[0],
    apiKey: 'sk-fake-aaaaaaaaaaaa1234',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3.2',
  }],
  doubaoAppId: 'fake-app-9876543210',
  doubaoAccessKey: 'fake-access-key-abcd5678',
};

describe('settings store', () => {
  let dir: string;
  let path: string;
  const envKeys = [
    'EDUAGENT_APP', 'EDUAGENT_SETTINGS_PATH', 'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_PROVIDER',
    'DOUBAO_APP_ID', 'DOUBAO_ACCESS_KEY', 'DOUBAO_ASR_RESOURCE_ID', 'DOUBAO_TTS_RESOURCE_ID', 'DOUBAO_TTS_DEFAULT_SPEAKER',
    'MIMO_API_KEY',
  ];
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

  it('masks every channel key and the voice secrets, and never fully reveals short values', () => {
    expect(maskSecret('sk-fake-aaaaaaaaaaaa1234')).toBe('••••1234');
    expect(maskSecret('abcd')).toBe('••••');
    expect(maskSecret('')).toBe('');
    const second = { ...FAKE.llmChannels[0], id: 'other', apiKey: 'sk-other-bbbbbbbbbbbb9999' };
    const masked = maskValues({ ...FAKE, llmChannels: [...FAKE.llmChannels, second] });
    expect(masked.llmChannels[0].apiKey).toBe('••••1234');
    expect(masked.llmChannels[1].apiKey).toBe('••••9999');
    expect(masked.doubaoAccessKey).toBe('••••5678');
    expect(masked.llmChannels[0].baseUrl).toBe(FAKE.llmChannels[0].baseUrl);
    expect(JSON.stringify(masked)).not.toContain('aaaaaaaaaaaa');
    expect(JSON.stringify(masked)).not.toContain('bbbbbbbbbbbb');
  });

  it('keeps each channel key by id when the submission is masked or empty', () => {
    const second = { ...FAKE.llmChannels[0], id: 'other', name: '自定义', provider: 'custom' as const, apiKey: 'sk-other-bbbbbbbbbbbb9999', baseUrl: 'https://llm.example.test/v1' };
    const saved = { ...FAKE, llmChannels: [...FAKE.llmChannels, second] };
    const merged = mergeSubmitted(saved, {
      ...saved,
      llmChannels: [
        { ...saved.llmChannels[0], apiKey: maskSecret(saved.llmChannels[0].apiKey), model: 'm2' },
        { ...second, apiKey: '' },
        { ...second, id: 'brand-new', apiKey: '', name: '新建' },
      ],
      doubaoAccessKey: '',
      doubaoAppId: 'new-app-id',
    });
    expect(merged.llmChannels[0].apiKey).toBe(FAKE.llmChannels[0].apiKey);
    expect(merged.llmChannels[0].model).toBe('m2');
    expect(merged.llmChannels[1].apiKey).toBe(second.apiKey);
    expect(merged.llmChannels[2].apiKey).toBe('');
    expect(merged.doubaoAccessKey).toBe(FAKE.doubaoAccessKey);
    expect(merged.doubaoAppId).toBe('new-app-id');
    expect(isMaskedValue('••••1234')).toBe(true);
  });

  it('writes settings.json with mode 0600 atomically and round-trips the channel document', () => {
    writeSettingsFile(path, FAKE);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(['settings.json']);
    expect(readSettingsFile(path)).toEqual(FAKE);
    writeSettingsFile(path, { ...FAKE, llmChannels: [{ ...FAKE.llmChannels[0], model: 'other' }] });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8')).llmChannels[0].model).toBe('other');
    expect(JSON.parse(readFileSync(path, 'utf8')).llmApiKey).toBeUndefined();
  });

  it('missing or corrupt file yields one empty SiliconFlow channel', () => {
    expect(readSettingsFile(path)).toEqual(SETTINGS_DEFAULTS);
    writeFileSync(path, '{not json');
    expect(readSettingsFile(path)).toEqual(SETTINGS_DEFAULTS);
    expect(SETTINGS_DEFAULTS.llmChannels[0].apiKey).toBe('');
  });

  it.each([
    ['https://api.siliconflow.cn/v1', 'siliconflow', 'SiliconFlow'],
    ['https://ark.cn-beijing.volces.com/api/v3', 'volc-ark', '火山方舟'],
    ['https://api.deepseek.com', 'deepseek', 'DeepSeek 官方'],
    ['https://llm.example.test/v1', 'custom', '自定义'],
  ])('migrates a legacy %s document into one current channel', (baseUrl, provider, name) => {
    const values = normalizeSettings({
      llmApiKey: 'sk-legacy-key-1234',
      llmBaseUrl: baseUrl,
      llmModel: 'kept-model',
      doubaoAppId: 'app-12345678',
    });
    expect(values.llmChannels).toEqual([{
      id: LEGACY_CHANNEL_ID,
      name,
      provider,
      baseUrl,
      apiKey: 'sk-legacy-key-1234',
      model: 'kept-model',
    }]);
    expect(values.activeLlmChannelId).toBe(LEGACY_CHANNEL_ID);
    expect(values.doubaoAppId).toBe('app-12345678');
  });

  it('applySettingsToEnv maps the active channel onto LLM_* plus LLM_PROVIDER and rewrites a legacy file', () => {
    writeFileSync(path, JSON.stringify({
      llmApiKey: FAKE.llmChannels[0].apiKey,
      llmBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      llmModel: 'deepseek-v4-1-flash-economy',
      doubaoAppId: FAKE.doubaoAppId,
      doubaoAccessKey: FAKE.doubaoAccessKey,
    }));
    process.env.EDUAGENT_APP = '1';
    process.env.EDUAGENT_SETTINGS_PATH = path;
    process.env.MIMO_API_KEY = 'inherited-from-shell';
    applySettingsToEnv();
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    expect(saved.llmApiKey).toBeUndefined();
    expect(saved.llmChannels[0].provider).toBe('volc-ark');
    expect(saved.activeLlmChannelId).toBe(LEGACY_CHANNEL_ID);
    expect(process.env.LLM_API_KEY).toBe(FAKE.llmChannels[0].apiKey);
    expect(process.env.LLM_BASE_URL).toBe('https://ark.cn-beijing.volces.com/api/v3');
    expect(process.env.LLM_MODEL).toBe('deepseek-v4-1-flash-economy');
    expect(process.env.LLM_PROVIDER).toBe('volc-ark');
    expect(process.env.DOUBAO_APP_ID).toBe(FAKE.doubaoAppId);
    expect(process.env.DOUBAO_ASR_RESOURCE_ID).toBe('volc.seedasr.sauc.duration');
    expect(process.env.MIMO_API_KEY).toBeUndefined();
  });

  it('applySettingsToEnv uses the active channel, not a sibling', () => {
    const other = { ...FAKE.llmChannels[0], id: 'other', provider: 'deepseek' as const, apiKey: 'sk-other-bbbbbbbbbbbb9999', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' };
    writeSettingsFile(path, { ...FAKE, llmChannels: [...FAKE.llmChannels, other], activeLlmChannelId: other.id });
    process.env.EDUAGENT_APP = '1';
    process.env.EDUAGENT_SETTINGS_PATH = path;
    applySettingsToEnv();
    expect(activeChannel({ ...FAKE, llmChannels: [...FAKE.llmChannels, other], activeLlmChannelId: other.id }).id).toBe('other');
    expect(process.env.LLM_API_KEY).toBe(other.apiKey);
    expect(process.env.LLM_PROVIDER).toBe('deepseek');
    expect(process.env.LLM_API_KEY).not.toBe(FAKE.llmChannels[0].apiKey);
  });

  it('applySettingsToEnv: web mode leaves env untouched', () => {
    writeSettingsFile(path, FAKE);
    process.env.EDUAGENT_SETTINGS_PATH = path;
    process.env.LLM_API_KEY = 'from-env-local';
    applySettingsToEnv();
    expect(process.env.LLM_API_KEY).toBe('from-env-local');
    expect(process.env.LLM_PROVIDER).toBeUndefined();
  });

  it('refuses to delete the current channel or the last channel', () => {
    expect(canDeleteChannel(FAKE, FAKE.activeLlmChannelId)).toBe(false);
    const extra = { ...FAKE.llmChannels[0], id: 'other' };
    const two = { ...FAKE, llmChannels: [...FAKE.llmChannels, extra] };
    expect(canDeleteChannel(two, extra.id)).toBe(true);
    expect(canDeleteChannel(two, FAKE.activeLlmChannelId)).toBe(false);
  });
});

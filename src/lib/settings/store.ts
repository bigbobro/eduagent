// 设置的字段定义、持久化(App 模式 settings.json)、打码、写入 process.env。
// 凭据类字段永远不原样回传浏览器;日志里也不打印任何字段值。
import { chmodSync, closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { DEFAULT_TTS_SPEAKER, getConfig } from '../config';
import {
  inferLlmProvider,
  isLlmProviderId,
  LLM_PROVIDER_IDS,
  LLM_PROVIDERS,
  newChannel,
  type LlmChannel,
  type LlmProviderId,
} from '../llm-providers';
import { canDeleteChannel } from './channels';
import { VOICE_FIELDS, type SettingsValues, type VoiceField } from './types';

export { canDeleteChannel };

export type { LlmChannel, LlmProviderId, SettingsValues, VoiceField };
export { VOICE_FIELDS };

/** 空文件用固定 id,这样还没保存过时,打码回传和「保留原值」也能对上同一条渠道。 */
export const DEFAULT_CHANNEL_ID = 'default-llm';
/** 旧版顶层 llmApiKey/llmBaseUrl/llmModel 迁成的第一条渠道。id 固定,避免每次读取都换 id。 */
export const LEGACY_CHANNEL_ID = 'legacy-llm';

const VOICE_SECRET_FIELDS: readonly VoiceField[] = ['doubaoAppId', 'doubaoAccessKey'];

const VOICE_ENV: Record<VoiceField, string> = {
  doubaoAppId: 'DOUBAO_APP_ID',
  doubaoAccessKey: 'DOUBAO_ACCESS_KEY',
  doubaoAsrResourceId: 'DOUBAO_ASR_RESOURCE_ID',
  doubaoTtsResourceId: 'DOUBAO_TTS_RESOURCE_ID',
  doubaoTtsSpeaker: 'DOUBAO_TTS_DEFAULT_SPEAKER',
};

const LLM_ENV_NAMES = [
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_PROVIDER',
  'MIMO_API_KEY',
  'MIMO_BASE_URL',
  'MIMO_API_BASE',
  'MIMO_MODEL',
];

export function defaultSettings(): SettingsValues {
  const channel = newChannel('siliconflow', DEFAULT_CHANNEL_ID);
  return {
    llmChannels: [channel],
    activeLlmChannelId: channel.id,
    doubaoAppId: '',
    doubaoAccessKey: '',
    doubaoAsrResourceId: 'volc.seedasr.sauc.duration',
    doubaoTtsResourceId: 'seed-tts-2.0',
    doubaoTtsSpeaker: DEFAULT_TTS_SPEAKER,
  };
}

export const SETTINGS_DEFAULTS: SettingsValues = defaultSettings();

export type SettingsMode = 'app' | 'web';

export function getSettingsMode(): SettingsMode {
  return process.env.EDUAGENT_APP === '1' ? 'app' : 'web';
}

export function getSettingsPath(): string | null {
  return process.env.EDUAGENT_SETTINGS_PATH || null;
}

const noControl = (v: string) => !/[\u0000-\u001f\u007f]/.test(v);
const field = z.string().trim().max(512).refine(noControl, 'invalid characters');
const httpUrl = field.refine((v) => v === '' || /^https?:\/\/[^\s]+$/.test(v), 'must be an http(s) URL');

const channelSchema = z.object({
  id: field.min(1).max(80).regex(/^[A-Za-z0-9_-]+$/, 'invalid channel id'),
  name: field.min(1).max(80),
  provider: z.enum(LLM_PROVIDER_IDS),
  baseUrl: httpUrl,
  apiKey: field,
  model: field.max(200),
});

export const settingsInputSchema = z.object({
  llmChannels: z.array(channelSchema).min(1).max(20),
  activeLlmChannelId: field.min(1).max(80),
  doubaoAppId: field,
  doubaoAccessKey: field,
  doubaoAsrResourceId: field,
  doubaoTtsResourceId: field,
  doubaoTtsSpeaker: field,
}).superRefine((value, ctx) => {
  const ids = value.llmChannels.map((channel) => channel.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: 'duplicate channel', path: ['llmChannels'] });
  }
  if (!ids.includes(value.activeLlmChannelId)) {
    ctx.addIssue({ code: 'custom', message: 'active channel missing', path: ['activeLlmChannelId'] });
  }
});

export const settingsTestSchema = settingsInputSchema.and(z.object({
  scope: z.enum(['all', 'channel', 'voice']).optional(),
  channelId: field.max(80).optional(),
}));

// ─── 打码 ───────────────────────────────────────────────────────────────

const MASK = '••••';

export function maskSecret(value: string): string {
  if (!value) return '';
  // 太短的值显示末 4 位等于泄露全部,只给占位
  return value.length <= 8 ? MASK : `${MASK}${value.slice(-4)}`;
}

export function isMaskedValue(value: string): boolean {
  return value.startsWith(MASK);
}

export function maskValues(values: SettingsValues): SettingsValues {
  return {
    ...values,
    llmChannels: values.llmChannels.map((channel) => ({ ...channel, apiKey: maskSecret(channel.apiKey) })),
    doubaoAppId: maskSecret(values.doubaoAppId),
    doubaoAccessKey: maskSecret(values.doubaoAccessKey),
  };
}

function keepSecret(submitted: string, saved: string): string {
  if (submitted === '' || isMaskedValue(submitted)) return saved;
  return submitted;
}

/** 提交值与已保存值合并:凭据字段提交打码值或空串 = 保留原值。渠道按 id 匹配。 */
export function mergeSubmitted(saved: SettingsValues, submitted: SettingsValues): SettingsValues {
  const savedById = new Map(saved.llmChannels.map((channel) => [channel.id, channel]));
  return {
    ...submitted,
    llmChannels: submitted.llmChannels.map((channel) => {
      const previous = savedById.get(channel.id);
      if (!previous) return channel;
      return { ...channel, apiKey: keepSecret(channel.apiKey, previous.apiKey) };
    }),
    doubaoAppId: keepSecret(submitted.doubaoAppId, saved.doubaoAppId),
    doubaoAccessKey: keepSecret(submitted.doubaoAccessKey, saved.doubaoAccessKey),
  };
}

export function activeChannel(values: SettingsValues): LlmChannel {
  return values.llmChannels.find((channel) => channel.id === values.activeLlmChannelId) ?? values.llmChannels[0];
}

// ─── 读写 settings.json ─────────────────────────────────────────────────

export function readSettingsFile(path: string): SettingsValues {
  if (!existsSync(path)) return defaultSettings();
  try {
    return normalizeSettings(JSON.parse(readFileSync(path, 'utf8')));
  } catch (err) {
    console.warn('[settings] settings.json unreadable, treating as empty:', (err as Error).message);
    return defaultSettings();
  }
}

export function normalizeSettings(raw: unknown): SettingsValues {
  const defaults = defaultSettings();
  if (!raw || typeof raw !== 'object') return defaults;
  const record = raw as Record<string, unknown>;
  const voice = voiceFrom(record, defaults);
  if (Array.isArray(record.llmChannels)) {
    const channels = record.llmChannels.map(parseChannel).filter((channel): channel is LlmChannel => channel !== null);
    const llmChannels = channels.length > 0 ? channels : defaults.llmChannels;
    const requested = typeof record.activeLlmChannelId === 'string' ? record.activeLlmChannelId.trim() : '';
    const activeLlmChannelId = llmChannels.some((channel) => channel.id === requested) ? requested : llmChannels[0].id;
    return { llmChannels, activeLlmChannelId, ...voice };
  }
  if (isLegacyLlm(record)) return { ...migrateLegacyLlm(record), ...voice };
  return { ...defaults, ...voice };
}

function isLegacyLlm(raw: Record<string, unknown>): boolean {
  return typeof raw.llmApiKey === 'string' || typeof raw.llmBaseUrl === 'string' || typeof raw.llmModel === 'string';
}

function migrateLegacyLlm(raw: Record<string, unknown>): Pick<SettingsValues, 'llmChannels' | 'activeLlmChannelId'> {
  const baseUrl = text(raw.llmBaseUrl) || LLM_PROVIDERS.siliconflow.defaultBaseUrl;
  const provider = inferLlmProvider(baseUrl);
  const preset = LLM_PROVIDERS[provider];
  const channel: LlmChannel = {
    id: LEGACY_CHANNEL_ID,
    name: preset.label,
    provider,
    baseUrl,
    apiKey: text(raw.llmApiKey),
    model: text(raw.llmModel) || preset.defaultModel,
  };
  return { llmChannels: [channel], activeLlmChannelId: channel.id };
}

function parseChannel(raw: unknown): LlmChannel | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = text(record.id).slice(0, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  const baseUrl = text(record.baseUrl);
  const provider = typeof record.provider === 'string' && isLlmProviderId(record.provider)
    ? record.provider
    : inferLlmProvider(baseUrl);
  const preset = LLM_PROVIDERS[provider];
  return {
    id,
    name: text(record.name).slice(0, 80) || preset.label,
    provider,
    baseUrl,
    apiKey: text(record.apiKey),
    model: text(record.model),
  };
}

function voiceFrom(raw: Record<string, unknown>, defaults: SettingsValues): Pick<SettingsValues, VoiceField> {
  const out = {} as Pick<SettingsValues, VoiceField>;
  for (const key of VOICE_FIELDS) out[key] = text(raw[key]) || defaults[key];
  return out;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 原子写:同目录临时文件(0600)写完再 rename,避免中途掉电留下半个文件;rename 后再 chmod 一次兜底。 */
export function writeSettingsFile(path: string, values: SettingsValues): void {
  const tmp = join(dirname(path), `.settings.${process.pid}.${Date.now()}.tmp`);
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, JSON.stringify(values, null, 2) + '\n');
  } catch (err) {
    closeSync(fd);
    try { unlinkSync(tmp); } catch { /* 临时文件清不掉也不挡住原来的错误 */ }
    throw err;
  }
  closeSync(fd);
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

// ─── 写入 process.env(server 启动时调用)────────────────────────────────

/**
 * App 模式:先清掉继承来的同名/旧名变量(避免 shell 里的 key 串进来),再把当前渠道和语音字段
 * 映射写入 process.env,效果等同 .env.local。只在 EDUAGENT_APP=1 且有路径时生效。
 * 旧格式在这里迁成渠道文档并写回;写失败仍用迁好的值启动,下次启动再迁。
 */
export function applySettingsToEnv(): void {
  const path = getSettingsPath();
  if (getSettingsMode() !== 'app' || !path) return;
  for (const name of LLM_ENV_NAMES) delete process.env[name];
  for (const name of Object.values(VOICE_ENV)) delete process.env[name];
  if (!existsSync(path)) {
    applyValues(defaultSettings());
    return;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.warn('[settings] settings.json unreadable, treating as empty:', (err as Error).message);
    applyValues(defaultSettings());
    return;
  }
  const values = normalizeSettings(raw);
  if (isLegacyDocument(raw)) {
    try {
      writeSettingsFile(path, values);
      console.log('[settings] migrated legacy llm settings');
    } catch (err) {
      console.error('[settings] legacy migration write failed', { message: (err as Error).message });
    }
  }
  applyValues(values);
}

function isLegacyDocument(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.llmChannels)) return false;
  return isLegacyLlm(record);
}

function applyValues(values: SettingsValues): void {
  const channel = activeChannel(values);
  if (channel.apiKey) process.env.LLM_API_KEY = channel.apiKey;
  if (channel.baseUrl) process.env.LLM_BASE_URL = channel.baseUrl;
  if (channel.model) process.env.LLM_MODEL = channel.model;
  process.env.LLM_PROVIDER = channel.provider;
  for (const key of VOICE_FIELDS) {
    if (values[key]) process.env[VOICE_ENV[key]] = values[key];
  }
  console.log('[settings] applied active channel', { provider: channel.provider });
}

// ─── 当前生效值(给 GET 与测试连接用)───────────────────────────────────

export function currentValues(): SettingsValues {
  const path = getSettingsPath();
  if (getSettingsMode() === 'app' && path) return readSettingsFile(path);
  return settingsFromEnv();
}

function settingsFromEnv(): SettingsValues {
  const config = getConfig();
  const defaults = defaultSettings();
  const channel = config.llmApiKey
    ? {
      id: 'env-llm',
      name: LLM_PROVIDERS[config.llmProvider].label,
      provider: config.llmProvider,
      baseUrl: config.llmBaseUrl,
      apiKey: config.llmApiKey,
      model: config.llmModel,
    }
    : { ...defaults.llmChannels[0], id: 'env-llm' };
  return {
    ...defaults,
    llmChannels: [channel],
    activeLlmChannelId: channel.id,
    doubaoAppId: config.doubaoAppId,
    doubaoAccessKey: config.doubaoAccessKey,
    doubaoAsrResourceId: config.doubaoAsrResourceId || defaults.doubaoAsrResourceId,
    doubaoTtsResourceId: config.doubaoTtsResourceId || defaults.doubaoTtsResourceId,
    doubaoTtsSpeaker: config.doubaoTtsDefaultSpeaker || defaults.doubaoTtsSpeaker,
  };
}

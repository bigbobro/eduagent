// 设置的字段定义、持久化(App 模式 settings.json)、打码、写入 process.env。
// 凭据类字段永远不原样回传浏览器;日志里也不打印任何字段值。
import { chmodSync, closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { DEFAULT_TTS_SPEAKER, getConfig } from '../config';

export const SETTINGS_FIELDS = [
  'llmApiKey',
  'llmBaseUrl',
  'llmModel',
  'doubaoAppId',
  'doubaoAccessKey',
  'doubaoAsrResourceId',
  'doubaoTtsResourceId',
  'doubaoTtsSpeaker',
] as const;
export type SettingsField = (typeof SETTINGS_FIELDS)[number];
export type SettingsValues = Record<SettingsField, string>;

/** 凭据类字段:GET 打码,POST 提交打码值/空串表示"保持原值"。 */
export const SECRET_FIELDS: readonly SettingsField[] = ['llmApiKey', 'doubaoAppId', 'doubaoAccessKey'];

export const SETTINGS_DEFAULTS: SettingsValues = {
  llmApiKey: '',
  llmBaseUrl: 'https://api.siliconflow.cn/v1',
  llmModel: 'deepseek-ai/DeepSeek-V4-Flash',
  doubaoAppId: '',
  doubaoAccessKey: '',
  doubaoAsrResourceId: 'volc.seedasr.sauc.duration',
  doubaoTtsResourceId: 'seed-tts-2.0',
  doubaoTtsSpeaker: DEFAULT_TTS_SPEAKER,
};

/** 字段 -> 现有 env 名。asr-proxy / tts-proxy / config.ts 继续只读 process.env。 */
export const SETTINGS_ENV: Record<SettingsField, string> = {
  llmApiKey: 'LLM_API_KEY',
  llmBaseUrl: 'LLM_BASE_URL',
  llmModel: 'LLM_MODEL',
  doubaoAppId: 'DOUBAO_APP_ID',
  doubaoAccessKey: 'DOUBAO_ACCESS_KEY',
  doubaoAsrResourceId: 'DOUBAO_ASR_RESOURCE_ID',
  doubaoTtsResourceId: 'DOUBAO_TTS_RESOURCE_ID',
  doubaoTtsSpeaker: 'DOUBAO_TTS_DEFAULT_SPEAKER',
};

export type SettingsMode = 'app' | 'web';

export function getSettingsMode(): SettingsMode {
  return process.env.EDUAGENT_APP === '1' ? 'app' : 'web';
}

export function getSettingsPath(): string | null {
  return process.env.EDUAGENT_SETTINGS_PATH || null;
}

const noControl = (v: string) => !/[\u0000-\u001f\u007f]/.test(v);
const field = z.string().trim().max(512).refine(noControl, 'invalid characters');

export const settingsInputSchema = z.object({
  llmApiKey: field,
  llmBaseUrl: field.refine((v) => v === '' || /^https?:\/\/[^\s]+$/.test(v), 'must be an http(s) URL'),
  llmModel: field,
  doubaoAppId: field,
  doubaoAccessKey: field,
  doubaoAsrResourceId: field,
  doubaoTtsResourceId: field,
  doubaoTtsSpeaker: field,
});

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
  const out = { ...values };
  for (const f of SECRET_FIELDS) out[f] = maskSecret(values[f]);
  return out;
}

/** 提交值与已保存值合并:凭据字段提交打码值或空串 = 保留原值。 */
export function mergeSubmitted(saved: SettingsValues, submitted: SettingsValues): SettingsValues {
  const out = { ...submitted };
  for (const f of SECRET_FIELDS) {
    if (submitted[f] === '' || isMaskedValue(submitted[f])) out[f] = saved[f];
  }
  return out;
}

// ─── 读写 settings.json ─────────────────────────────────────────────────

export function readSettingsFile(path: string): SettingsValues {
  const values: SettingsValues = { ...SETTINGS_DEFAULTS };
  if (!existsSync(path)) return values;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    for (const f of SETTINGS_FIELDS) {
      if (typeof raw?.[f] === 'string' && raw[f].trim() !== '') values[f] = raw[f].trim();
    }
  } catch (err) {
    console.warn('[settings] settings.json unreadable, treating as empty:', (err as Error).message);
  }
  return values;
}

/** 原子写:同目录临时文件(0600)写完再 rename,避免中途掉电留下半个文件;rename 后再 chmod 一次兜底。 */
export function writeSettingsFile(path: string, values: SettingsValues): void {
  const tmp = join(dirname(path), `.settings.${process.pid}.${Date.now()}.tmp`);
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, JSON.stringify(values, null, 2) + '\n');
  } catch (err) {
    closeSync(fd);
    try { unlinkSync(tmp); } catch {}
    throw err;
  }
  closeSync(fd);
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

// ─── 写入 process.env(server 启动时调用)────────────────────────────────

/**
 * App 模式:先清掉继承来的同名/旧名变量(避免 shell 里的 key 串进来),再把 settings.json
 * 的字段映射写入 process.env,效果等同 .env.local。只在 EDUAGENT_APP=1 且有路径时生效。
 */
export function applySettingsToEnv(): void {
  const path = getSettingsPath();
  if (getSettingsMode() !== 'app' || !path) return;
  for (const name of Object.values(SETTINGS_ENV)) delete process.env[name];
  for (const name of ['MIMO_API_KEY', 'MIMO_BASE_URL', 'MIMO_API_BASE', 'MIMO_MODEL']) delete process.env[name];
  const values = readSettingsFile(path);
  for (const f of SETTINGS_FIELDS) {
    if (values[f]) process.env[SETTINGS_ENV[f]] = values[f];
  }
}

// ─── 当前生效值(给 GET 与测试连接用)───────────────────────────────────

export function currentValues(): SettingsValues {
  const path = getSettingsPath();
  if (getSettingsMode() === 'app' && path) return readSettingsFile(path);
  const c = getConfig();
  // 没有任何 LLM key 时 config 会落到旧 MiMo 的默认地址,界面上显示当前默认供应商更合理
  const noLlmKey = !c.llmApiKey;
  return {
    llmApiKey: c.llmApiKey,
    llmBaseUrl: noLlmKey ? SETTINGS_DEFAULTS.llmBaseUrl : c.llmBaseUrl,
    llmModel: noLlmKey ? SETTINGS_DEFAULTS.llmModel : c.llmModel,
    doubaoAppId: c.doubaoAppId,
    doubaoAccessKey: c.doubaoAccessKey,
    doubaoAsrResourceId: c.doubaoAsrResourceId,
    doubaoTtsResourceId: c.doubaoTtsResourceId,
    doubaoTtsSpeaker: c.doubaoTtsDefaultSpeaker,
  };
}

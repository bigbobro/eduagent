/**
 * Centralized configuration with type safety and validation.
 * 凭据(API Key / App ID / Access Key)允许缺省:缺省时 server 照常启动,进入"未配置"状态
 * (见 isConfigured()),由 /api/chat 与语音 WS 返回 503 NOT_CONFIGURED,前端引导去 /settings。
 * 非凭据项(URL 格式等)仍然 fail-fast。
 */

import { z } from 'zod'
import { DEFAULT_DOUBAO_ASR_WS_URL, DEFAULT_DOUBAO_TTS_WS_URL } from './voice/doubao-endpoints'

export const DEFAULT_TTS_SPEAKER = 'BV001_streaming'

const configSchema = z.object({
  // LLM(OpenAI 兼容 chat/completions 供应商)
  llmApiKey: z.string().default(''),
  llmBaseUrl: z.string().url(),
  llmModel: z.string().min(1),

  // Doubao Voice (ASR + TTS)
  doubaoAppId: z.string().default(''),
  doubaoAccessKey: z.string().default(''),
  doubaoAsrResourceId: z.string().default(''),
  doubaoTtsResourceId: z.string().default(''),
  // 与 asr-proxy / tts-proxy 实际使用的 v3 端点一致(见 voice/doubao-endpoints.ts);测试时可用 env 指向本地 fake server
  doubaoAsrWsUrl: z.string().url().default(DEFAULT_DOUBAO_ASR_WS_URL),
  doubaoTtsWsUrl: z.string().url().default(DEFAULT_DOUBAO_TTS_WS_URL),
  doubaoTtsDefaultSpeaker: z.string().default(DEFAULT_TTS_SPEAKER),

  // Development
  voiceMock: z.boolean().default(false),
  voiceMockError: z.enum(['asr_timeout', 'tts_timeout', 'asr_decode_error', 'tts_decode_error', 'none']).default('none'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Server
  port: z.number().int().positive().default(3000),
})

export type AppConfig = z.infer<typeof configSchema>

let cachedConfig: AppConfig | null = null

/**
 * Validate and return typed configuration.
 * Call once at server/app startup to fail fast on missing config.
 */
export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig

  // LLM 凭据按"整组"取值:LLM_API_KEY 非空 → 用 LLM_* 三元组;否则整组回退旧的 MIMO_*。
  // 不逐变量混拼,避免"新 base + 旧 key"这类错配。清空 LLM_API_KEY 即整体回退 MiMo。
  const useLegacyLlm = !process.env.LLM_API_KEY

  const raw = {
    llmApiKey: useLegacyLlm ? process.env.MIMO_API_KEY : process.env.LLM_API_KEY,
    llmBaseUrl: useLegacyLlm
      ? // MIMO_BASE_URL 是旧 canonical 名;MIMO_API_BASE 是更早的 alias
        (process.env.MIMO_BASE_URL ?? process.env.MIMO_API_BASE ?? 'https://token-plan-cn.xiaomimimo.com/v1')
      : (process.env.LLM_BASE_URL ?? 'https://api.siliconflow.cn/v1'),
    llmModel: useLegacyLlm
      ? (process.env.MIMO_MODEL ?? 'mimo-v2.5-pro')
      : (process.env.LLM_MODEL ?? 'deepseek-ai/DeepSeek-V4-Flash'),

    doubaoAppId: process.env.DOUBAO_APP_ID,
    doubaoAccessKey: process.env.DOUBAO_ACCESS_KEY,
    doubaoAsrResourceId: process.env.DOUBAO_ASR_RESOURCE_ID,
    doubaoTtsResourceId: process.env.DOUBAO_TTS_RESOURCE_ID,
    doubaoAsrWsUrl: process.env.DOUBAO_ASR_WS_URL,
    doubaoTtsWsUrl: process.env.DOUBAO_TTS_WS_URL,
    doubaoTtsDefaultSpeaker: process.env.DOUBAO_TTS_DEFAULT_SPEAKER,

    voiceMock: process.env.VOICE_MOCK === 'true',
    voiceMockError: process.env.VOICE_MOCK_ERROR || 'none',
    nodeEnv: process.env.NODE_ENV || 'development',

    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  }

  const result = configSchema.safeParse(raw)

  if (!result.success) {
    const errors = result.error.issues.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')
    throw new Error(`Configuration validation failed:\n${errors}\n\nCheck your .env.local file (or the settings page in the desktop app).`)
  }

  cachedConfig = result.data
  return cachedConfig
}

/**
 * 是否已配置到可以上课:VOICE_MOCK=true 视为已配置;否则 LLM key 与豆包凭据/资源 ID 必须齐全。
 * 直接读 process.env(不走 getConfig 缓存),所以任何时刻都反映当前进程环境。
 * 音色在 tts-proxy 里有兜底默认值,不参与判定。
 */
export function isConfigured(): boolean {
  if (process.env.VOICE_MOCK === 'true') return true
  const llmKey = process.env.LLM_API_KEY || process.env.MIMO_API_KEY
  return Boolean(
    llmKey &&
      process.env.DOUBAO_APP_ID &&
      process.env.DOUBAO_ACCESS_KEY &&
      process.env.DOUBAO_ASR_RESOURCE_ID &&
      process.env.DOUBAO_TTS_RESOURCE_ID,
  )
}

/**
 * Reset cached config (for testing only).
 */
export function resetConfig(): void {
  cachedConfig = null
}

/**
 * Centralized configuration with type safety and validation.
 * Validates all env variables at startup and fails fast with clear errors.
 */

import { z } from 'zod'

const configSchema = z.object({
  // MiMo LLM
  mimoApiKey: z.string().min(1, 'MIMO_API_KEY is required'),
  mimoApiBase: z.string().url().default('https://token-plan-cn.xiaomimimo.com/v1'),
  mimoModel: z.string().default('mimo-v2.5-pro'),

  // Doubao Voice (ASR + TTS)
  doubaoAppId: z.string().min(1, 'DOUBAO_APP_ID is required'),
  doubaoAccessKey: z.string().min(1, 'DOUBAO_ACCESS_KEY is required'),
  doubaoAsrResourceId: z.string().min(1, 'DOUBAO_ASR_RESOURCE_ID is required'),
  doubaoTtsResourceId: z.string().min(1, 'DOUBAO_TTS_RESOURCE_ID is required'),
  doubaoAsrWsUrl: z.string().url().default('wss://openspeech.bytedance.com/api/v3/sauc/bigmodel'),
  doubaoTtsWsUrl: z.string().url().default('wss://openspeech.bytedance.com/api/v2/tts'),
  doubaoTtsDefaultSpeaker: z.string().default('BV001_streaming'),

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

  const raw = {
    mimoApiKey: process.env.MIMO_API_KEY,
    // Canonical env var is MIMO_BASE_URL (see .env.example / init.ts); MIMO_API_BASE kept as a
    // backward-compat alias. Reading the wrong name silently dropped the override → dead default.
    mimoApiBase: process.env.MIMO_BASE_URL ?? process.env.MIMO_API_BASE,
    mimoModel: process.env.MIMO_MODEL,

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
    throw new Error(`Configuration validation failed:\n${errors}\n\nCheck your .env.local file.`)
  }

  cachedConfig = result.data
  return cachedConfig
}

/**
 * Reset cached config (for testing only).
 */
export function resetConfig(): void {
  cachedConfig = null
}

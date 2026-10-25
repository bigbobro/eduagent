import type { LlmChannel } from '../llm-providers';
import type { DoubaoAuthMode } from '../voice/doubao-auth';

export type { DoubaoAuthMode };

/** settings.json 与 /api/settings 共用的文档。渠道 apiKey 与豆包凭据按密钥处理。 */
export interface SettingsValues {
  llmChannels: LlmChannel[];
  activeLlmChannelId: string;
  doubaoAuthMode: DoubaoAuthMode;
  doubaoApiKey: string;
  doubaoAppId: string;
  doubaoAccessKey: string;
  doubaoAsrResourceId: string;
  doubaoTtsResourceId: string;
  doubaoTtsSpeaker: string;
}

export const VOICE_FIELDS = [
  'doubaoAppId',
  'doubaoAccessKey',
  'doubaoAsrResourceId',
  'doubaoTtsResourceId',
  'doubaoTtsSpeaker',
] as const;
export type VoiceField = (typeof VOICE_FIELDS)[number];

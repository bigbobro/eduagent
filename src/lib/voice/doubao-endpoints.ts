// 豆包语音 WS 端点。默认指向官方 v3 端点;env 覆盖仅用于测试(指向本地 fake server)。
export const DEFAULT_DOUBAO_ASR_WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';
export const DEFAULT_DOUBAO_TTS_WS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';

export function doubaoAsrWsUrl(): string {
  return process.env.DOUBAO_ASR_WS_URL || DEFAULT_DOUBAO_ASR_WS_URL;
}

export function doubaoTtsWsUrl(): string {
  return process.env.DOUBAO_TTS_WS_URL || DEFAULT_DOUBAO_TTS_WS_URL;
}

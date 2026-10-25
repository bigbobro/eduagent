// 豆包语音两套控制台共用这一处鉴权头。
// apikey:新版控制台只有 X-Api-Key。
// legacy:旧版控制台 ASR 用 X-Api-App-Key,TTS 用 X-Api-App-Id,再加 X-Api-Access-Key。
// 资源 ID、Request-Id、Connect-Id、Sequence 仍由调用方按原样附上。这里只返回那一行鉴权头。

export type DoubaoAuthMode = 'apikey' | 'legacy';
export type DoubaoAuthService = 'asr' | 'tts';

export interface DoubaoAuthInput {
  mode: DoubaoAuthMode;
  apiKey: string;
  appId: string;
  accessKey: string;
}

type Env = Record<string, string | undefined>;

/** 显式 DOUBAO_AUTH_MODE 优先。没写时:有 API Key 用新版,否则有 App ID 或 Access Key 用旧版,都没有则新版。 */
export function resolveDoubaoAuthMode(env: Env = process.env): DoubaoAuthMode {
  if (env.DOUBAO_AUTH_MODE === 'apikey' || env.DOUBAO_AUTH_MODE === 'legacy') return env.DOUBAO_AUTH_MODE;
  if (env.DOUBAO_API_KEY) return 'apikey';
  if (env.DOUBAO_APP_ID || env.DOUBAO_ACCESS_KEY) return 'legacy';
  return 'apikey';
}

export function doubaoAuthHeadersFor(service: DoubaoAuthService, auth: DoubaoAuthInput): Record<string, string> {
  if (auth.mode === 'apikey') return { 'X-Api-Key': auth.apiKey };
  if (service === 'asr') {
    return {
      'X-Api-App-Key': auth.appId,
      'X-Api-Access-Key': auth.accessKey,
    };
  }
  return {
    'X-Api-App-Id': auth.appId,
    'X-Api-Access-Key': auth.accessKey,
  };
}

export function doubaoAuthFromEnv(env: Env = process.env): DoubaoAuthInput {
  return {
    mode: resolveDoubaoAuthMode(env),
    apiKey: env.DOUBAO_API_KEY || '',
    appId: env.DOUBAO_APP_ID || '',
    accessKey: env.DOUBAO_ACCESS_KEY || '',
  };
}

export function doubaoAuthHeaders(service: DoubaoAuthService, env: Env = process.env): Record<string, string> {
  return doubaoAuthHeadersFor(service, doubaoAuthFromEnv(env));
}

// Safe in both server and browser: never expose upstream bodies, keys or raw errors.
export const llmErrorCodes = [
  'LLM_INSUFFICIENT_BALANCE', 'LLM_AUTH_FAILED', 'LLM_MODEL_UNAVAILABLE',
  'LLM_RATE_LIMITED', 'LLM_TIMEOUT', 'LLM_NETWORK_ERROR', 'LLM_OTHER',
] as const;
export type LlmErrorCode = typeof llmErrorCodes[number];

const messages: Record<LlmErrorCode, string> = {
  LLM_INSUFFICIENT_BALANCE: '余额不足:请到模型服务商控制台充值后再试',
  LLM_AUTH_FAILED: '鉴权失败:请在设置中检查模型服务的 API Key 和访问权限',
  LLM_MODEL_UNAVAILABLE: '模型不存在或没有权限:请在设置中检查模型名称和服务地址',
  LLM_RATE_LIMITED: '请求太频繁:请稍等一会儿再试',
  LLM_TIMEOUT: '模型服务响应超时:请稍后重试并检查网络',
  LLM_NETWORK_ERROR: '网络不通:连不上模型服务器,请检查网络和服务地址',
  LLM_OTHER: '课堂暂时没准备好,再试一次吧',
};

export interface LlmFailure {
  code: LlmErrorCode;
  message: string;
  status?: number;
  providerCode?: string;
}

/** HTTP status wins over ambiguous body wording (e.g. 429 "insufficient quota"). */
export function classifyLlmFailure(input: { status?: number; body?: string; error?: unknown }): LlmFailure {
  const { status, body = '', error } = input;
  const e = error as { name?: string; message?: string; code?: string; cause?: { code?: string } } | undefined;
  const lower = body.toLowerCase();
  const networkCode = e?.cause?.code || e?.code || '';
  let code: LlmErrorCode = 'LLM_OTHER';
  if (status === 402) code = 'LLM_INSUFFICIENT_BALANCE';
  else if (status === 401 || status === 403) code = 'LLM_AUTH_FAILED';
  else if (status === 404) code = 'LLM_MODEL_UNAVAILABLE';
  else if (status === 429) code = 'LLM_RATE_LIMITED';
  else if (/balance|insufficient|余额/.test(lower)) code = 'LLM_INSUFFICIENT_BALANCE';
  else if (/auth|unauthorized|forbidden|invalid.*(key|token)/.test(lower)) code = 'LLM_AUTH_FAILED';
  else if (/model|模型/.test(lower)) code = 'LLM_MODEL_UNAVAILABLE';
  else if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || /ETIMEDOUT|TIMEOUT/.test(networkCode)) code = 'LLM_TIMEOUT';
  else if (/ECONN|ENOTFOUND|EAI_AGAIN|ENET|EHOST|UND_ERR_SOCKET/.test(networkCode) || /fetch failed|network|failed to fetch/i.test(e?.message || '')) code = 'LLM_NETWORK_ERROR';

  // Only numeric or known symbolic provider codes are diagnostic-safe. A provider can
  // echo credentials in arbitrary fields, so never log raw strings from its body.
  let providerCode: string | undefined;
  try {
    const parsed = JSON.parse(body);
    const raw: unknown = parsed?.error?.code ?? parsed?.code;
    if ((typeof raw === 'number' || typeof raw === 'string') && /^(\d{1,10}|invalid_api_key|model_not_found|insufficient_quota|rate_limit_exceeded)$/.test(String(raw))) {
      providerCode = String(raw);
    }
  } catch { /* A non-JSON rejection still has an HTTP status. */ }
  return { code, message: messages[code], ...(status !== undefined ? { status } : {}), ...(providerCode ? { providerCode } : {}) };
}

export class LlmServiceError extends Error {
  constructor(readonly failure: LlmFailure) {
    super(failure.message);
    this.name = 'LlmServiceError';
  }
}

export function llmFailureNeedsSettings(code?: string): boolean {
  return code === 'LLM_INSUFFICIENT_BALANCE' || code === 'LLM_AUTH_FAILED' || code === 'LLM_MODEL_UNAVAILABLE';
}

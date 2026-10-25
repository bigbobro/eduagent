// 四种 AI 老师渠道的预设、Key 说明,以及请求体里的专属参数。
// 火山方舟默认开深度思考,思考阶段没有 delta.content,会误触发 4s 首 token 对冲。
// 只有 volc-ark 附带 thinking disabled;其他渠道保持请求体原样。

export const LLM_PROVIDER_IDS = ['siliconflow', 'volc-ark', 'deepseek', 'custom'] as const;
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

export interface LlmChannel {
  id: string;
  name: string;
  provider: LlmProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmProviderPreset {
  id: LlmProviderId;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  modelHint: string;
  keyHint: string;
  /** 核实过的控制台地址。没有稳定地址时为 null,界面只留文字说明。 */
  keyUrl: string | null;
}

export const LLM_PROVIDERS: Record<LlmProviderId, LlmProviderPreset> = {
  siliconflow: {
    id: 'siliconflow',
    label: 'SiliconFlow',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3.2',
    modelHint: '例:deepseek-ai/DeepSeek-V3.2',
    keyHint: '在 SiliconFlow 控制台「API 密钥」创建',
    // docs.siliconflow.cn 的接入说明给出的密钥页(2026-10-25 核对)
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  'volc-ark': {
    id: 'volc-ark',
    label: '火山方舟',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: '',
    modelHint: '填模型 ID(如 deepseek-v4-1-flash-economy)或推理接入点 ID(ep- 开头)。这个渠道会自动关闭深度思考',
    keyHint: '在火山方舟控制台「API Key 管理」创建',
    // 方舟文档「快速入门」里的 API Key 管理入口(2026-10-25 核对)
    keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apiKey',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    modelHint: '例:deepseek-chat',
    keyHint: '在 DeepSeek 开放平台「API keys」创建',
    // 官方文档「申请 API key」指向的开放平台密钥页(2026-10-25 核对)
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  custom: {
    id: 'custom',
    label: '自定义',
    defaultBaseUrl: '',
    defaultModel: '',
    modelHint: '',
    keyHint: '填写 OpenAI 兼容的服务地址',
    keyUrl: null,
  },
};

export function isLlmProviderId(value: string): value is LlmProviderId {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value);
}

/** 旧 settings.json 只有地址时,用主机名推断渠道类型。对不上就当自定义。 */
export function inferLlmProvider(baseUrl: string): LlmProviderId {
  const host = hostOf(baseUrl);
  if (host.endsWith('siliconflow.cn')) return 'siliconflow';
  if (host.endsWith('volces.com')) return 'volc-ark';
  if (host.endsWith('deepseek.com')) return 'deepseek';
  return 'custom';
}

export function llmRequestExtras(provider: string | undefined): Record<string, unknown> {
  if (provider === 'volc-ark') return { thinking: { type: 'disabled' } };
  return {};
}

/** 切换类型时套用预设。用户改过的名字保留,地址和模型跟着新类型走。 */
export function withProvider<T extends { name: string; provider: LlmProviderId; baseUrl: string; model: string }>(
  current: T,
  provider: LlmProviderId,
): T {
  const next = LLM_PROVIDERS[provider];
  const previous = LLM_PROVIDERS[current.provider];
  const keepName = current.name.trim() !== '' && current.name !== previous.label;
  return {
    ...current,
    provider,
    name: keepName ? current.name : next.label,
    baseUrl: next.defaultBaseUrl,
    model: next.defaultModel,
  };
}

export function newChannel(provider: LlmProviderId, id: string): LlmChannel {
  const preset = LLM_PROVIDERS[provider];
  return {
    id,
    name: preset.label,
    provider,
    baseUrl: preset.defaultBaseUrl,
    apiKey: '',
    model: preset.defaultModel,
  };
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host.toLowerCase();
  } catch {
    return baseUrl.toLowerCase();
  }
}

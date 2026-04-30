import { AgentResponse } from '@/types/tools';

const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResult {
  response: AgentResponse;
  usage: LLMUsage;
  latency: number;
}

// 旧的非流式接口 — 保留给 start 场景兜底,后续如果不需要可删
export async function callLLM(
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<LLMResult> {
  const start = Date.now();
  const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mimo-v2.5-pro',
      messages: apiMessages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`MiMo LLM error: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const data = await res.json();
  const latency = Date.now() - start;
  const content = data.choices[0].message.content;
  const parsed: AgentResponse = JSON.parse(content);

  return {
    response: parsed,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
    latency,
  };
}

// 新的流式接口:逐 chunk 吐 token delta
export interface StreamChunk {
  delta: string;
  done: false;
}
export interface StreamFinal {
  done: true;
  fullText: string;
  usage: LLMUsage;
  latency: number;
}
export type StreamEvent = StreamChunk | StreamFinal;

export async function* streamLLM(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const start = Date.now();
  const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mimo-v2.5-pro',
      messages: apiMessages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`MiMo LLM stream error: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let fullText = '';
  let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE: 双换行分帧;每帧一行 "data: ..."
      let nl: number;
      while ((nl = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const line = frame.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;

        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            yield { delta, done: false };
          }
          if (json.usage) {
            usage = {
              inputTokens: json.usage.prompt_tokens || 0,
              outputTokens: json.usage.completion_tokens || 0,
            };
          }
        } catch {
          // 跳过无法解析的 chunk
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    done: true,
    fullText,
    usage,
    latency: Date.now() - start,
  };
}

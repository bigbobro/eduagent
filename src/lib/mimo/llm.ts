import { getConfig } from '../config';
import { createLogger } from '../logger';

const log = createLogger('mimo-llm');

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

// 流式接口:逐 chunk 吐 token delta
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
  if (process.env.VOICE_MOCK === 'true') {
    yield* mockStreamLLM();
    return;
  }
  const config = getConfig();
  const start = Date.now();
  const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  log.debug('Calling MiMo LLM', { model: config.mimoModel, messageCount: apiMessages.length });

  const res = await fetch(`${config.mimoApiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.mimoApiKey}`,
    },
    body: JSON.stringify({
      model: config.mimoModel,
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
    // Sanitize error to prevent info disclosure (don't leak full API response body to client)
    const sanitized = `MiMo LLM API error: ${res.status} ${res.statusText}`;
    log.error('MiMo LLM request failed', { status: res.status, statusText: res.statusText });
    throw new Error(sanitized);
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

async function* mockStreamLLM(): AsyncGenerator<StreamEvent> {
  const fixed = JSON.stringify({
    speech: '你好!我是兔老师。Look at this. 这是 a cat,小猫!你跟我说一遍,cat。',
    actions: [{ tool: 'show_card', params: { card_id: 'cat' } }],
    state_update: { current_word: 'cat' },
  });
  // 模拟 token 流
  const chunkSize = 8;
  for (let i = 0; i < fixed.length; i += chunkSize) {
    await sleep(50);
    yield { delta: fixed.slice(i, i + chunkSize), done: false };
  }
  yield {
    done: true,
    fullText: fixed,
    usage: { inputTokens: 100, outputTokens: 50 },
    latency: 500,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

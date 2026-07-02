import { getConfig } from './config';
import { createLogger } from './logger';

const log = createLogger('llm');

// Bounded overall deadline for a single LLM turn. SiliconFlow DeepSeek-V4-Pro normal path is
// ~5-15s(first token 中位 ~3.5s,慢在生成段;2026-07-02 smoke 实测),20s leaves margin while
// preventing a stalled upstream from freezing the lesson.(MiMo 时代 ~6s/15s。)
// The client has a 25s watchdog as a backstop (see lesson-controller.ts CHAT_WATCHDOG_MS).
const LLM_TIMEOUT_MS = 20000;

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

  log.debug('Calling LLM', { model: config.llmModel, messageCount: apiMessages.length });

  // Aborting this signal also rejects the in-progress reader.read(), so one deadline covers both a
  // connect stall and a mid-stream stall. Combined with the caller's cancel signal so a client
  // disconnect still aborts immediately.
  const timeoutSignal = AbortSignal.timeout(LLM_TIMEOUT_MS);
  const fetchSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llmApiKey}`,
    },
    body: JSON.stringify({
      model: config.llmModel,
      messages: apiMessages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: fetchSignal,
  });

  if (!res.ok || !res.body) {
    const errorBody = await res.text().catch(() => '');
    // Sanitize error to prevent info disclosure (don't leak full API response body to client)
    const sanitized = `LLM API error: ${res.status} ${res.statusText}`;
    log.error('LLM request failed', { status: res.status, statusText: res.statusText });
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

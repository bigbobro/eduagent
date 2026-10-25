import { getConfig } from './config';
import { createLogger } from './logger';
import { classifyLlmFailure, LlmServiceError } from './llm-errors';

const log = createLogger('llm');

// Deadlines for one LLM turn (2026-10-25, measured on SiliconFlow DeepSeek-V3.2, see
// docs/voice-benchmarks.md). The server waits for the whole reply before the teacher speaks, so
// the child waits for the full turn. Two independent slow paths showed up:
// - provider queueing: first token is usually 0.5-2.4s but ~7% of turns sit 7-9s before any
//   output. A second identical request fired at LLM_HEDGE_AFTER_MS rarely queues too, so we race
//   the two and keep whichever streams first (a hedged request), aborting the other.
// - slow streaming: 15-24 tok/s normally, occasionally ~7 tok/s, so ~100 output tokens can take
//   13s. Killing a turn that is still streaming wastes it, so the overall cap is generous and a
//   separate stall deadline catches a stream that stops producing chunks.
// The client watchdog (lesson-controller.ts CHAT_WATCHDOG_MS) must stay above LLM_TOTAL_TIMEOUT_MS.
export const LLM_HEDGE_AFTER_MS = 4000;
export const LLM_STALL_TIMEOUT_MS = 10000;
export const LLM_TOTAL_TIMEOUT_MS = 30000;

export interface LLMTimings {
  hedgeAfterMs: number;
  stallTimeoutMs: number;
  totalTimeoutMs: number;
}

const DEFAULT_TIMINGS: LLMTimings = {
  hedgeAfterMs: LLM_HEDGE_AFTER_MS,
  stallTimeoutMs: LLM_STALL_TIMEOUT_MS,
  totalTimeoutMs: LLM_TOTAL_TIMEOUT_MS,
};

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

type AttemptEvent = { kind: 'delta'; text: string } | { kind: 'usage'; usage: LLMUsage };

interface Attempt {
  label: 'primary' | 'hedge';
  abort: () => void;
  events: AsyncGenerator<AttemptEvent>;
}

class StallError extends Error {
  constructor() {
    super('LLM stream stalled');
    this.name = 'TimeoutError';
  }
}

export async function* streamLLM(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  timings: LLMTimings = DEFAULT_TIMINGS,
): AsyncGenerator<StreamEvent> {
  if (process.env.VOICE_MOCK === 'true') {
    yield* mockStreamLLM(signal);
    return;
  }
  const config = getConfig();
  const start = Date.now();
  const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];
  const body = JSON.stringify({
    model: config.llmModel,
    messages: apiMessages,
    response_format: { type: 'json_object' },
    temperature: 0.7,
    stream: true,
    stream_options: { include_usage: true },
  });

  log.debug('Calling LLM', { model: config.llmModel, messageCount: apiMessages.length });

  // One overall deadline, combined with the caller's cancel signal so a client disconnect still
  // aborts immediately. Each attempt also gets its own controller so the losing one can be dropped.
  const totalSignal = AbortSignal.timeout(timings.totalTimeoutMs);
  const turnSignal = signal ? AbortSignal.any([signal, totalSignal]) : totalSignal;

  const startAttempt = (label: Attempt['label']): Attempt => {
    const controller = new AbortController();
    const attemptSignal = AbortSignal.any([turnSignal, controller.signal]);
    return {
      label,
      abort: () => controller.abort(),
      events: readAttempt(`${config.llmBaseUrl}/chat/completions`, config.llmApiKey, body, attemptSignal),
    };
  };

  const attempts: Attempt[] = [];
  let winner: Attempt | null = null;
  let stalled = false;

  try {
    const primary = startAttempt('primary');
    attempts.push(primary);
    const firstDelta = await raceFirstDelta(primary, () => {
      const hedge = startAttempt('hedge');
      attempts.push(hedge);
      log.info('LLM first token slow, hedging', { afterMs: timings.hedgeAfterMs });
      return hedge;
    }, timings.hedgeAfterMs);
    winner = firstDelta.attempt;
    for (const other of attempts) {
      if (other !== winner) closeAttempt(other);
    }
    if (attempts.length > 1) {
      log.info('LLM hedge settled', { winner: winner.label, firstTokenMs: Date.now() - start });
    }

    let fullText = firstDelta.text;
    let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 };
    yield { delta: firstDelta.text, done: false };

    while (true) {
      const next = await withStallTimeout(winner.events.next(), timings.stallTimeoutMs, () => {
        stalled = true;
        winner?.abort();
      });
      if (next.done) break;
      if (next.value.kind === 'usage') {
        usage = next.value.usage;
        continue;
      }
      fullText += next.value.text;
      yield { delta: next.value.text, done: false };
    }

    yield {
      done: true,
      fullText,
      usage,
      latency: Date.now() - start,
    };
  } catch (error) {
    // User cancellation is not an upstream failure and must retain abort semantics.
    if (signal?.aborted) throw error;
    const timedOut = stalled || totalSignal.aborted;
    const failure = error instanceof LlmServiceError ? error.failure : classifyLlmFailure({
      error: timedOut ? { name: 'TimeoutError' } : error,
    });
    log.error('LLM request failed', {
      code: failure.code,
      status: failure.status ?? null,
      providerCode: failure.providerCode ?? null,
      elapsedMs: Date.now() - start,
      attempts: attempts.length,
      stalled,
    });
    throw new LlmServiceError(failure);
  } finally {
    for (const attempt of attempts) closeAttempt(attempt);
  }
}

// Waits for the first content delta of the primary attempt; if none arrives within hedgeAfterMs,
// starts the hedge and returns whichever attempt produces content first. An attempt that fails
// before producing content only fails the turn once no other attempt is still running.
async function raceFirstDelta(
  primary: Attempt,
  startHedge: () => Attempt,
  hedgeAfterMs: number,
): Promise<{ attempt: Attempt; text: string }> {
  const pending = new Map<Attempt, Promise<{ attempt: Attempt; text?: string; error?: unknown }>>();
  const watch = (attempt: Attempt) => {
    pending.set(attempt, firstDelta(attempt).then(
      (text) => ({ attempt, text }),
      (error) => ({ attempt, error }),
    ));
  };
  watch(primary);

  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  const hedgeDue = new Promise<'hedge'>((resolve) => {
    hedgeTimer = setTimeout(() => resolve('hedge'), hedgeAfterMs);
  });
  let hedged = false;
  let lastError: unknown;

  try {
    while (pending.size > 0) {
      const contenders: Promise<{ attempt: Attempt; text?: string; error?: unknown } | 'hedge'>[] = Array.from(pending.values());
      if (!hedged) contenders.push(hedgeDue);
      const result = await Promise.race(contenders);
      if (result === 'hedge') {
        hedged = true;
        watch(startHedge());
        continue;
      }
      pending.delete(result.attempt);
      if (result.text !== undefined) return { attempt: result.attempt, text: result.text };
      lastError = result.error;
      // A primary that fails fast (HTTP error) should not wait for the hedge timer.
      if (pending.size === 0) break;
    }
    throw lastError;
  } finally {
    clearTimeout(hedgeTimer);
  }
}

async function firstDelta(attempt: Attempt): Promise<string> {
  while (true) {
    const next = await attempt.events.next();
    if (next.done) throw new Error('LLM stream ended before any content');
    if (next.value.kind === 'delta') return next.value.text;
  }
}

function closeAttempt(attempt: Attempt): void {
  attempt.abort();
  void attempt.events.return(undefined).catch(() => {});
}

async function withStallTimeout<T>(promise: Promise<T>, ms: number, onStall: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stall = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onStall();
      reject(new StallError());
    }, ms);
  });
  try {
    return await Promise.race([promise, stall]);
  } finally {
    clearTimeout(timer);
  }
}

// One HTTP attempt: posts the request and yields content deltas and the final usage.
async function* readAttempt(url: string, apiKey: string, body: string, signal: AbortSignal): AsyncGenerator<AttemptEvent> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
    signal,
  });

  if (!res.ok || !res.body) {
    const errorBody = await res.text().catch(() => '');
    throw new LlmServiceError(classifyLlmFailure({ status: res.status, body: errorBody }));
  }

  // Aborting the attempt signal also rejects the in-progress reader.read().
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

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

        let json: { choices?: { delta?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        try {
          json = JSON.parse(payload);
        } catch {
          continue; // 跳过无法解析的 chunk
        }
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield { kind: 'delta', text: delta };
        if (json.usage) {
          yield {
            kind: 'usage',
            usage: {
              inputTokens: json.usage.prompt_tokens || 0,
              outputTokens: json.usage.completion_tokens || 0,
            },
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* mockStreamLLM(signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const fixed = JSON.stringify({
    speech: '你好!我是兔老师。Look at this. 这是 a cat,小猫!你跟我说一遍,cat。',
    actions: [{ tool: 'show_card', params: { card_id: 'cat' } }],
    state_update: { current_word: 'cat' },
  });
  // 模拟 token 流
  const chunkSize = 8;
  for (let i = 0; i < fixed.length; i += chunkSize) {
    signal?.throwIfAborted();
    await sleep(50);
    signal?.throwIfAborted();
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

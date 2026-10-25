import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Avoid real env / .env.local: streamLLM only needs base + key + model + provider from config.
const { configState } = vi.hoisted(() => ({
  configState: {
    llmBaseUrl: 'http://test.local/v1',
    llmApiKey: 'test-key',
    llmModel: 'test-model',
    llmProvider: 'custom',
  },
}));
vi.mock('./config', () => ({
  getConfig: () => configState,
}));

import { streamLLM } from './llm';

function abortError(): Error {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

// fetch that rejects the moment its signal aborts (mirrors the real fetch abort contract).
function abortAwareFetch() {
  return vi.fn((_url: string, opts: any) =>
    new Promise((_resolve, reject) => {
      const sig: AbortSignal = opts.signal;
      if (sig.aborted) return reject(abortError());
      sig.addEventListener('abort', () => reject(abortError()));
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('VOICE_MOCK', 'false'); // force the real fetch path, not mockStreamLLM
});

afterEach(() => {
  configState.llmProvider = 'custom';
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('streamLLM abort + error paths', () => {
  it('aborts immediately when the caller signal is already aborted', async () => {
    const fetchMock = abortAwareFetch();
    vi.stubGlobal('fetch', fetchMock);

    const ac = new AbortController();
    ac.abort();
    const gen = streamLLM('sys', [{ role: 'user', content: 'hi' }], ac.signal);

    await expect(gen.next()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
    // The signal handed to fetch is the AbortSignal.any combination — it reflects the aborted caller.
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('aborts a request in flight when the caller aborts mid-stream', async () => {
    vi.stubGlobal('fetch', abortAwareFetch());

    const ac = new AbortController();
    const gen = streamLLM('sys', [{ role: 'user', content: 'hi' }], ac.signal);
    const pending = gen.next();
    ac.abort();

    await expect(pending).rejects.toThrow();
  });

  it('throws a sanitized error on a non-ok response without leaking the body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        body: null,
        text: async () => 'secret upstream stack trace',
      })),
    );

    const gen = streamLLM('sys', [{ role: 'user', content: 'hi' }]);
    await expect(gen.next()).rejects.toMatchObject({ failure: { code: 'LLM_OTHER', status: 500 } });
    await expect(
      streamLLM('sys', [{ role: 'user', content: 'hi' }]).next(),
    ).rejects.not.toThrow('secret upstream stack trace');
  });
});

// Builds a streaming fetch Response whose SSE chunks are released on demand, so a test can hold
// the first token back (provider queueing) or stop mid-stream (stall).
function controllableResponse(signal: AbortSignal) {
  const encoder = new TextEncoder();
  let push: (text: string) => void = () => {};
  let finish: () => void = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (text) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
      finish = () => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 2 } })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      };
      signal.addEventListener('abort', () => controller.error(abortError()));
    },
  });
  return { response: { ok: true, status: 200, body, text: async () => '' }, push: (t: string) => push(t), finish: () => finish() };
}

async function drain(gen: AsyncGenerator<any>) {
  const deltas: string[] = [];
  let final: any;
  for await (const ev of gen) {
    if (ev.done) final = ev;
    else deltas.push(ev.delta);
  }
  return { deltas, final };
}

const fastTimings = { hedgeAfterMs: 30, stallTimeoutMs: 80, totalTimeoutMs: 1000 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('streamLLM provider request body', () => {
  it.each(['custom', 'siliconflow', 'deepseek'] as const)('does not add thinking for %s', async (provider) => {
    configState.llmProvider = provider;
    const fetchMock = abortAwareFetch();
    vi.stubGlobal('fetch', fetchMock);
    const ac = new AbortController();
    ac.abort();
    await expect(streamLLM('sys', [{ role: 'user', content: 'hi' }], ac.signal).next()).rejects.toThrow();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.thinking).toBeUndefined();
    expect(body.model).toBe('test-model');
  });

  it('disables volc-ark thinking so the first content token is not delayed', async () => {
    configState.llmProvider = 'volc-ark';
    const fetchMock = abortAwareFetch();
    vi.stubGlobal('fetch', fetchMock);
    const ac = new AbortController();
    ac.abort();
    await expect(streamLLM('sys', [{ role: 'user', content: 'hi' }], ac.signal).next()).rejects.toThrow();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });
});

describe('streamLLM hedge + stall deadlines', () => {
  it('does not hedge when the first token arrives in time', async () => {
    const streams: ReturnType<typeof controllableResponse>[] = [];
    const fetchMock = vi.fn(async (_url: string, opts: any) => {
      const s = controllableResponse(opts.signal);
      streams.push(s);
      setTimeout(() => { s.push('{"speech":'); s.push('"hi"}'); s.finish(); }, 5);
      return s.response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { deltas, final } = await drain(streamLLM('sys', [{ role: 'user', content: 'hi' }], undefined, fastTimings));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(deltas.join('')).toBe('{"speech":"hi"}');
    expect(final.usage).toEqual({ inputTokens: 10, outputTokens: 2 });
  });

  it('fires a hedge when the first token is slow, keeps the faster stream and aborts the other', async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn(async (_url: string, opts: any) => {
      const s = controllableResponse(opts.signal);
      signals.push(opts.signal);
      if (signals.length === 2) {
        // The hedge streams right away; the primary stays queued.
        setTimeout(() => { s.push('{"speech":"from hedge"}'); s.finish(); }, 5);
      }
      return s.response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { deltas } = await drain(streamLLM('sys', [{ role: 'user', content: 'hi' }], undefined, fastTimings));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(deltas.join('')).toBe('{"speech":"from hedge"}');
    expect(signals[0].aborted).toBe(true);
  });

  it('fails fast without hedging when the primary returns an HTTP error', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, body: null, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(streamLLM('sys', [{ role: 'user', content: 'hi' }], undefined, fastTimings).next())
      .rejects.toMatchObject({ failure: { code: 'LLM_RATE_LIMITED' } });
    await wait(fastTimings.hedgeAfterMs + 20);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports LLM_TIMEOUT when the stream stalls after the first token', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: any) => {
      const s = controllableResponse(opts.signal);
      setTimeout(() => s.push('{"speech":'), 5); // then nothing more
      return s.response;
    }));

    await expect(drain(streamLLM('sys', [{ role: 'user', content: 'hi' }], undefined, fastTimings)))
      .rejects.toMatchObject({ failure: { code: 'LLM_TIMEOUT' } });
  });

  it('reports LLM_TIMEOUT when neither attempt produces a token before the overall deadline', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: any) => {
      signals.push(opts.signal);
      return controllableResponse(opts.signal).response;
    }));

    await expect(streamLLM('sys', [{ role: 'user', content: 'hi' }], undefined, { ...fastTimings, totalTimeoutMs: 120 }).next())
      .rejects.toMatchObject({ failure: { code: 'LLM_TIMEOUT' } });
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

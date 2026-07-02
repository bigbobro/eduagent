import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Avoid real env / .env.local: streamLLM only needs base + key + model from config.
vi.mock('./config', () => ({
  getConfig: () => ({
    llmBaseUrl: 'http://test.local/v1',
    llmApiKey: 'test-key',
    llmModel: 'test-model',
  }),
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
    await expect(gen.next()).rejects.toThrow('LLM API error: 500 Server Error');
    await expect(
      streamLLM('sys', [{ role: 'user', content: 'hi' }]).next(),
    ).rejects.not.toThrow('secret upstream stack trace');
  });
});

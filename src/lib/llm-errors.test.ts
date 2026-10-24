import { describe, expect, it } from 'vitest';
import { classifyLlmFailure } from './llm-errors';

describe('classifyLlmFailure', () => {
  it.each([
    [{ status: 402, body: '{"code":30001,"message":"Sorry, your account balance is insufficient"}' }, 'LLM_INSUFFICIENT_BALANCE', '余额不足'],
    [{ status: 400, body: 'insufficient credits' }, 'LLM_INSUFFICIENT_BALANCE', '余额不足'],
    [{ body: 'balance too low' }, 'LLM_INSUFFICIENT_BALANCE', '余额不足'],
    [{ body: '余额已用完' }, 'LLM_INSUFFICIENT_BALANCE', '余额不足'],
    [{ status: 401 }, 'LLM_AUTH_FAILED', '鉴权失败'],
    [{ status: 403, body: 'insufficient permissions for model' }, 'LLM_AUTH_FAILED', '鉴权失败'],
    [{ status: 404 }, 'LLM_MODEL_UNAVAILABLE', '模型不存在'],
    [{ status: 400, body: 'model not available' }, 'LLM_MODEL_UNAVAILABLE', '模型不存在'],
    [{ status: 429, body: 'insufficient quota' }, 'LLM_RATE_LIMITED', '请求太频繁'],
    [{ error: { name: 'TimeoutError' } }, 'LLM_TIMEOUT', '超时'],
    [{ error: { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } } }, 'LLM_TIMEOUT', '超时'],
    [{ error: { cause: { code: 'ECONNREFUSED' } } }, 'LLM_NETWORK_ERROR', '网络不通'],
    [{ error: new TypeError('fetch failed') }, 'LLM_NETWORK_ERROR', '网络不通'],
    [{ status: 500, body: 'internal failure' }, 'LLM_OTHER', '课堂暂时没准备好'],
    [{ error: new Error('unexpected failure') }, 'LLM_OTHER', '课堂暂时没准备好'],
  ])('classifies %j as %s', (input, code, message) => {
    expect(classifyLlmFailure(input)).toMatchObject({ code, message: expect.stringContaining(message) });
  });

  it('extracts safe provider diagnostics without returning arbitrary upstream text', () => {
    expect(classifyLlmFailure({ status: 402, body: '{"code":30001,"message":"fake-secret-key"}' })).toMatchObject({ status: 402, providerCode: '30001' });
    const failure = classifyLlmFailure({ status: 500, body: '{"error":{"code":"fake-secret-key","message":"fake-secret-key"}}' });
    expect(failure.providerCode).toBeUndefined();
    expect(JSON.stringify(failure)).not.toContain('fake-secret-key');
    expect(classifyLlmFailure({ status: 404, body: '{"error":{"code":"model_not_found"}}' }).providerCode).toBe('model_not_found');
  });
});

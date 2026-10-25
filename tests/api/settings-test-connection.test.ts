// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { POST as TEST_POST } from '@/app/api/settings/test/route';
import { SETTINGS_DEFAULTS } from '@/lib/settings/store';

// 全部走本地 fake server,不请求任何真实厂商端点。
const GOOD_LLM_KEY = 'fake-llm-good-key-1111';
const GOOD_ACCESS = 'fake-access-good-2222';
const GOOD_API_KEY = 'fake-doubao-api-key-3333';
const ORIGIN = 'http://127.0.0.1:3000';

function ttsFrame(event: number, payload = '{}'): Buffer {
  const body = Buffer.from(payload);
  const sid = Buffer.from('conn-1');
  const head = Buffer.from([0x11, 0x94, 0x10, 0x00]);
  const ev = Buffer.alloc(4); ev.writeInt32BE(event);
  const sl = Buffer.alloc(4); sl.writeUInt32BE(sid.length);
  const bl = Buffer.alloc(4); bl.writeUInt32BE(body.length);
  return Buffer.concat([head, ev, sl, sid, bl, body]);
}

function asrResponseFrame(): Buffer {
  const body = Buffer.from('{"result":{"text":""}}');
  const head = Buffer.from([0x11, 0x91, 0x10, 0x00]);
  const seq = Buffer.alloc(4); seq.writeInt32BE(1);
  const bl = Buffer.alloc(4); bl.writeUInt32BE(body.length);
  return Buffer.concat([head, seq, bl, body]);
}

function errorFrame(code: number, msg: string): Buffer {
  const body = Buffer.from(msg);
  const head = Buffer.from([0x11, 0xf0, 0x10, 0x00]);
  const c = Buffer.alloc(4); c.writeUInt32BE(code);
  const bl = Buffer.alloc(4); bl.writeUInt32BE(body.length);
  return Buffer.concat([head, c, bl, body]);
}

describe('POST /api/settings/test against local fake servers', () => {
  let llm: Server;
  let tts: WebSocketServer;
  let asr: WebSocketServer;
  let llmUrl: string;
  const seenAuth: string[] = [];
  const seenBodies: string[] = [];
  const seenVoice: Array<Record<string, string>> = [];
  const envKeys = ['PORT', 'DOUBAO_TTS_WS_URL', 'DOUBAO_ASR_WS_URL', 'EDUAGENT_APP', 'EDUAGENT_SETTINGS_PATH', 'VOICE_MOCK'];
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of envKeys) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.PORT = '3000';
    seenAuth.length = 0;
    seenBodies.length = 0;
    seenVoice.length = 0;

    llm = createServer((req, res) => {
      seenAuth.push(req.headers.authorization ?? '');
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        seenBodies.push(Buffer.concat(chunks).toString('utf8'));
        if (req.headers.authorization === 'Bearer fake-balance-key') {
          res.writeHead(402, { 'Content-Type': 'application/json' }).end('{"code":30001,"message":"Sorry, your account balance is insufficient"}');
        } else if (req.headers.authorization === `Bearer ${GOOD_LLM_KEY}`) {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"choices":[{"message":{"content":"hi"}}]}');
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":{"message":"Invalid token"}}');
        }
      });
    });
    await new Promise<void>((r) => llm.listen(0, '127.0.0.1', r));
    llmUrl = `http://127.0.0.1:${(llm.address() as AddressInfo).port}/v1`;

    const verifyClient = (info: { req: { headers: Record<string, string | string[] | undefined> } }, cb: (ok: boolean, code?: number, msg?: string) => void) => {
      const header = (name: string) => String(info.req.headers[name] ?? '');
      seenVoice.push({
        key: header('x-api-key'),
        appKey: header('x-api-app-key'),
        appId: header('x-api-app-id'),
        access: header('x-api-access-key'),
        resource: header('x-api-resource-id'),
      });
      if (header('x-api-access-key') === GOOD_ACCESS || header('x-api-key') === GOOD_API_KEY) cb(true);
      else cb(false, 401, 'Unauthorized');
    };
    tts = new WebSocketServer({ port: 0, host: '127.0.0.1', verifyClient });
    tts.on('connection', (ws) => ws.on('message', () => ws.send(ttsFrame(50))));
    asr = new WebSocketServer({ port: 0, host: '127.0.0.1', verifyClient });
    asr.on('connection', (ws) => ws.on('message', () => ws.send(asrResponseFrame())));
    await Promise.all([tts, asr].map((s) => new Promise((r) => s.once('listening', r))));
    process.env.DOUBAO_TTS_WS_URL = `ws://127.0.0.1:${(tts.address() as AddressInfo).port}`;
    process.env.DOUBAO_ASR_WS_URL = `ws://127.0.0.1:${(asr.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const k of envKeys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!; }
    await Promise.all([
      new Promise((r) => llm.close(r)),
      new Promise((r) => tts.close(r)),
      new Promise((r) => asr.close(r)),
    ]);
  });

  const run = async (over: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    provider?: 'siliconflow' | 'volc-ark' | 'deepseek' | 'custom';
    channelId?: string;
    doubaoAuthMode?: 'apikey' | 'legacy';
    doubaoApiKey?: string;
    doubaoAppId?: string;
    doubaoAccessKey?: string;
    channels?: Array<Record<string, string>>;
    scope?: 'all' | 'channel' | 'voice';
    activeLlmChannelId?: string;
  } = {}) => {
    const id = over.channelId ?? SETTINGS_DEFAULTS.llmChannels[0].id;
    const one = {
      ...SETTINGS_DEFAULTS.llmChannels[0],
      id,
      provider: over.provider ?? SETTINGS_DEFAULTS.llmChannels[0].provider,
      baseUrl: over.baseUrl ?? llmUrl,
      apiKey: over.apiKey ?? '',
      model: over.model ?? SETTINGS_DEFAULTS.llmChannels[0].model,
    };
    const res = await TEST_POST(new Request('http://127.0.0.1:3000/api/settings/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({
        ...SETTINGS_DEFAULTS,
        llmChannels: over.channels ?? [one],
        activeLlmChannelId: over.activeLlmChannelId ?? id,
        doubaoAuthMode: over.doubaoAuthMode ?? 'legacy',
        doubaoApiKey: over.doubaoApiKey ?? '',
        doubaoAppId: over.doubaoAppId ?? 'fake-app',
        doubaoAccessKey: over.doubaoAccessKey ?? '',
        scope: over.scope,
        channelId: over.scope === 'channel' ? id : undefined,
      }),
    }));
    expect(res.status).toBe(200);
    return res.json();
  };

  it('success path: LLM, TTS and ASR all report ok', async () => {
    const report = await run({ apiKey: GOOD_LLM_KEY, doubaoAccessKey: GOOD_ACCESS });
    expect(report.llm.ok).toBe(true);
    expect(report.llm.reason).toMatch(/^正常 · 首字 \d+\.\ds · 整轮 \d+\.\ds$/);
    expect(report.tts.ok).toBe(true);
    expect(report.asr.ok).toBe(true);
    expect(seenAuth).toEqual([`Bearer ${GOOD_LLM_KEY}`]);
    expect(JSON.parse(seenBodies[0]).thinking).toBeUndefined();
    const asr = seenVoice.find((headers) => headers.resource === 'volc.seedasr.sauc.duration');
    const tts = seenVoice.find((headers) => headers.resource === 'seed-tts-2.0');
    expect(asr).toMatchObject({ appKey: 'fake-app', access: GOOD_ACCESS, key: '' });
    expect(tts).toMatchObject({ appId: 'fake-app', access: GOOD_ACCESS, key: '' });
  });

  it('voice scope uses the new API key header and ignores a saved legacy key', async () => {
    const report = await run({
      scope: 'voice',
      doubaoAuthMode: 'apikey',
      doubaoApiKey: GOOD_API_KEY,
      doubaoAppId: '',
      doubaoAccessKey: GOOD_ACCESS,
    });
    expect(report.tts.ok).toBe(true);
    expect(report.asr.ok).toBe(true);
    expect(report.llm).toBeUndefined();
    expect(seenVoice).toHaveLength(2);
    for (const headers of seenVoice) {
      expect(headers.key).toBe(GOOD_API_KEY);
      expect(headers.appKey).toBe('');
      expect(headers.appId).toBe('');
      expect(headers.access).toBe('');
      expect(headers.resource).not.toBe('');
    }
  });

  it('probes the requested channel even when it is not active, and disables volc-ark thinking', async () => {
    const active = { ...SETTINGS_DEFAULTS.llmChannels[0], apiKey: 'wrong-llm-key-9999', baseUrl: llmUrl };
    const volc = {
      ...SETTINGS_DEFAULTS.llmChannels[0],
      id: 'volc-1',
      name: '火山方舟',
      provider: 'volc-ark',
      apiKey: GOOD_LLM_KEY,
      baseUrl: llmUrl,
      model: 'ep-demo',
    };
    const report = await run({
      channels: [active, volc],
      activeLlmChannelId: active.id,
      scope: 'channel',
      channelId: 'volc-1',
      doubaoAccessKey: GOOD_ACCESS,
    });
    expect(report.llm.ok).toBe(true);
    expect(report.tts).toBeUndefined();
    expect(seenAuth.at(-1)).toBe(`Bearer ${GOOD_LLM_KEY}`);
    expect(JSON.parse(seenBodies.at(-1) ?? '{}').thinking).toEqual({ type: 'disabled' });
  });

  it('insufficient balance is explicit in the settings API response', async () => {
    const report = await run({ apiKey: 'fake-balance-key', doubaoAccessKey: GOOD_ACCESS });
    expect(report.llm).toEqual({ ok: false, code: 'LLM_INSUFFICIENT_BALANCE', reason: '余额不足:请到模型服务商控制台充值后再试(HTTP 402)' });
    expect(JSON.stringify(report)).not.toContain('fake-balance-key');
  });

  it('auth failure path: readable Chinese reason with the raw HTTP code, and no key in the response', async () => {
    const report = await run({ apiKey: 'wrong-llm-key-9999', doubaoAccessKey: 'wrong-access-8888' });
    for (const item of [report.llm, report.tts, report.asr]) {
      expect(item.ok).toBe(false);
      expect(item.reason).toContain('鉴权失败');
      expect(item.reason).toContain('401');
    }
    const text = JSON.stringify(report);
    expect(text).not.toContain('wrong-llm-key-9999');
    expect(text).not.toContain('wrong-access-8888');
  });

  it('Doubao error frame (resource not granted) is classified as 资源未开通 with the error code', async () => {
    tts.removeAllListeners('connection');
    tts.on('connection', (ws) => ws.on('message', () => ws.send(errorFrame(45000000, 'requested resource not granted'))));
    const report = await run({ apiKey: GOOD_LLM_KEY, doubaoAccessKey: GOOD_ACCESS });
    expect(report.tts.ok).toBe(false);
    expect(report.tts.reason).toContain('资源未开通');
    expect(report.tts.reason).toContain('45000000');
  });

  it('unreachable server is reported as 网络不通', async () => {
    const report = await run({ apiKey: GOOD_LLM_KEY, baseUrl: 'http://127.0.0.1:1/v1' });
    expect(report.llm.ok).toBe(false);
    expect(report.llm.reason).toContain('网络不通');
  });

  it('empty credentials fall back to the saved ones (masked submission), not to an empty request', async () => {
    // web 模式下"已保存值"来自 env;提交打码值应使用 env 里的真值
    process.env.LLM_API_KEY = GOOD_LLM_KEY;
    process.env.DOUBAO_APP_ID = 'fake-app';
    process.env.DOUBAO_ACCESS_KEY = GOOD_ACCESS;
    process.env.DOUBAO_ASR_RESOURCE_ID = 'a';
    process.env.DOUBAO_TTS_RESOURCE_ID = 't';
    const { resetConfig } = await import('@/lib/config');
    resetConfig();
    try {
      const report = await run({ apiKey: '••••1111', channelId: 'env-llm', doubaoAppId: '', doubaoAccessKey: '' });
      expect(report.llm.ok).toBe(true);
      expect(report.tts.ok).toBe(true);
    } finally {
      for (const k of ['LLM_API_KEY', 'DOUBAO_APP_ID', 'DOUBAO_ACCESS_KEY', 'DOUBAO_ASR_RESOURCE_ID', 'DOUBAO_TTS_RESOURCE_ID']) delete process.env[k];
      resetConfig();
    }
  });
});

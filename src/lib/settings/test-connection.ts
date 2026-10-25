// "测试连接":用表单里的值各发一次最小请求,返回家长能看懂的原因。
// 不在日志和返回里带任何 key;原始错误只保留 HTTP 状态码 / 豆包错误码。
import { randomUUID } from 'node:crypto';
import { WebSocket as WsClient } from 'ws';
import { decodeTtsFrame, encodeFullClientRequest, encodeTtsEvent, MessageType } from '../voice/doubao-codec';
import { doubaoAuthHeadersFor, type DoubaoAuthInput, type DoubaoAuthService } from '../voice/doubao-auth';
import { doubaoAsrWsUrl, doubaoTtsWsUrl } from '../voice/doubao-endpoints';
import type { LlmChannel } from '../llm-providers';
import { LLM_PROVIDERS, llmRequestExtras } from '../llm-providers';
import type { SettingsValues } from './types';
import { activeChannel } from './store';
import { classifyLlmFailure, type LlmErrorCode, type LlmFailure } from '../llm-errors';
import { createLogger } from '../logger';

const log = createLogger('settings-llm-test');

export interface CheckResult {
  ok: boolean;
  reason: string;
  code?: LlmErrorCode;
}

const TIMEOUT_MS = 10_000;

/** 把"HTTP 状态 + 上游文字"归类成中文原因。 */
export function classifyFailure(status: number | undefined, text: string): string {
  const raw = status ? `HTTP ${status}` : '';
  const detail = text.replace(/\s+/g, ' ').slice(0, 120);
  const lower = text.toLowerCase();
  const code = [raw, /\b\d{5,8}\b/.exec(text)?.[0]].filter(Boolean).join(' / ');
  if (/resource/.test(lower) && /(not|无|未|denied|grant|allowed|exist)/.test(lower)) {
    return `资源未开通:这个 Resource ID 没有开通或填错了(${code || detail})`;
  }
  if (status === 401 || status === 403 || /(auth|token|unauthorized|forbidden|invalid.*(key|app))/.test(lower)) {
    return `鉴权失败:Key 或 App ID 不正确,或没有权限(${code || detail})`;
  }
  if (status === 404) return `地址或模型名称不对(${code})`;
  if (status === 429) return `请求太频繁或额度用完(${code})`;
  if (status && status >= 500) return `对方服务暂时出错,稍后再试(${code})`;
  if (status) return `请求被拒绝(${code}${detail ? `:${detail}` : ''})`;
  return `连接失败(${detail || '未知错误'})`;
}

function networkReason(err: unknown): string {
  const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string } };
  const code = e?.code || e?.cause?.code;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || code === 'ETIMEDOUT') return '连接超时(10 秒内没有响应),请检查网络';
  return `网络不通,连不上服务器(${code || e?.message || 'unknown'})`;
}

// ─── LLM ────────────────────────────────────────────────────────────────

export async function testLlm(channel: Pick<LlmChannel, 'apiKey' | 'baseUrl' | 'model' | 'provider'>): Promise<CheckResult> {
  const preset = LLM_PROVIDERS[channel.provider];
  const baseUrl = channel.baseUrl || preset.defaultBaseUrl;
  const model = channel.model || preset.defaultModel;
  if (!channel.apiKey) return { ok: false, reason: '还没有填写 LLM API Key' };
  if (!baseUrl) return { ok: false, reason: '还没有填写服务地址' };
  if (!model) return { ok: false, reason: '还没有填写模型' };
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channel.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 16,
        stream: true,
        ...llmRequestExtras(channel.provider),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const timing = await measureLlmBody(res, started);
      return { ok: true, reason: formatTiming(timing.firstMs, timing.totalMs) };
    }
    const text = await res.text().catch(() => '');
    return llmCheckFailure(classifyLlmFailure({ status: res.status, body: text }), channel.provider);
  } catch (error) {
    return llmCheckFailure(classifyLlmFailure({ error }), channel.provider);
  }
}

function formatTiming(firstMs: number, totalMs: number): string {
  return `正常 · 首字 ${seconds(firstMs)} · 整轮 ${seconds(totalMs)}`;
}

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

/** 首字只认正文 content,不把思考字段算进去。非流式 JSON 和 SSE 都认。 */
async function measureLlmBody(res: Response, started: number): Promise<{ firstMs: number; totalMs: number }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const totalMs = Date.now() - started;
    return { firstMs: totalMs, totalMs };
  }
  const decoder = new TextDecoder();
  let pending = '';
  let firstMs: number | null = null;
  const note = (text: string) => {
    if (firstMs === null && hasVisibleContent(text)) firstMs = Date.now() - started;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let splitAt = pending.indexOf('\n\n');
      while (splitAt >= 0) {
        note(pending.slice(0, splitAt));
        pending = pending.slice(splitAt + 2);
        splitAt = pending.indexOf('\n\n');
      }
      note(pending);
    }
    note(pending + decoder.decode());
  } finally {
    reader.releaseLock();
  }
  const totalMs = Date.now() - started;
  return { firstMs: firstMs ?? totalMs, totalMs };
}

function hasVisibleContent(text: string): boolean {
  const candidates = [text.trim()];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) candidates.push(trimmed.slice(5).trim());
  }
  for (const candidate of candidates) {
    if (!candidate || candidate === '[DONE]') continue;
    try {
      const json = JSON.parse(candidate) as {
        choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }>;
      };
      const choice = json.choices?.[0];
      if (nonEmpty(choice?.delta?.content) || nonEmpty(choice?.message?.content)) return true;
    } catch {
      // 半截 JSON 等到下一帧再认
    }
  }
  return false;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function llmCheckFailure(failure: LlmFailure, provider: string): CheckResult {
  log.error('LLM probe failed', {
    code: failure.code,
    status: failure.status ?? null,
    providerCode: failure.providerCode ?? null,
    provider,
  });
  return { ok: false, code: failure.code, reason: `${failure.message}${failure.status ? `(HTTP ${failure.status})` : ''}` };
}

// ─── 豆包(WS 握手探测)──────────────────────────────────────────────────

interface ProbeOptions {
  url: string;
  headers: Record<string, string>;
  /** open 后要发的首帧 */
  onOpen: () => Buffer;
  /** 判断服务端帧:ok=鉴权通过;error=服务端明确拒绝 */
  judge: (frame: Buffer) => { verdict: 'ok' } | { verdict: 'error'; text: string } | { verdict: 'continue' };
  /** open 之后多久没动静也算握手成功(ASR 不保证对首帧回包) */
  okAfterOpenMs?: number;
}

function probeWs(opts: ProbeOptions): Promise<CheckResult> {
  return new Promise((resolve) => {
    let done = false;
    let ws: WsClient;
    const finish = (r: CheckResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (openTimer) clearTimeout(openTimer);
      try { ws.terminate(); } catch {}
      resolve(r);
    };
    let openTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => finish({ ok: false, reason: '连接超时(10 秒内没有响应),请检查网络' }), TIMEOUT_MS);
    ws = new WsClient(opts.url, { headers: opts.headers, handshakeTimeout: TIMEOUT_MS });
    ws.on('open', () => {
      try {
        ws.send(opts.onOpen());
      } catch (err) {
        finish({ ok: false, reason: networkReason(err) });
        return;
      }
      if (opts.okAfterOpenMs) openTimer = setTimeout(() => finish({ ok: true, reason: '连接正常' }), opts.okAfterOpenMs);
    });
    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      const j = opts.judge(buf);
      if (j.verdict === 'ok') finish({ ok: true, reason: '连接正常' });
      else if (j.verdict === 'error') finish({ ok: false, reason: classifyFailure(undefined, j.text).replace(/^连接失败/, '服务端拒绝') });
    });
    ws.on('unexpected-response', (_req, res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => finish({ ok: false, reason: classifyFailure(res.statusCode, Buffer.concat(chunks).toString('utf8')) }));
      res.on('error', () => finish({ ok: false, reason: classifyFailure(res.statusCode, '') }));
    });
    ws.on('error', (err) => finish({ ok: false, reason: networkReason(err) }));
    ws.on('close', () => finish({ ok: false, reason: '连接被对方关闭' }));
  });
}

/** 豆包错误帧(messageType 0xf):4B 头 + 4B 错误码 + 4B 长度 + 文本。 */
function parseErrorFrame(buf: Buffer): string | null {
  if (buf.length < 4 || ((buf[1] >> 4) & 0x0f) !== MessageType.Error) return null;
  let code = '';
  let msg = '';
  try {
    code = String(buf.readUInt32BE(4));
    const size = buf.readUInt32BE(8);
    msg = buf.subarray(12, 12 + size).toString('utf8');
  } catch {}
  return `${code} ${msg}`.trim() || 'error';
}

type VoiceProbe = Pick<SettingsValues, 'doubaoAuthMode' | 'doubaoApiKey' | 'doubaoAppId' | 'doubaoAccessKey'>;

function missingVoiceReason(v: VoiceProbe): string | null {
  if (v.doubaoAuthMode === 'apikey') return v.doubaoApiKey ? null : '还没有填写豆包 API Key';
  if (!v.doubaoAppId || !v.doubaoAccessKey) return '还没有填写豆包 App ID / Access Key';
  return null;
}

function voiceAuth(v: VoiceProbe): DoubaoAuthInput {
  return { mode: v.doubaoAuthMode, apiKey: v.doubaoApiKey, appId: v.doubaoAppId, accessKey: v.doubaoAccessKey };
}

function voiceHeaders(service: DoubaoAuthService, v: VoiceProbe, resourceId: string): Record<string, string> {
  return {
    ...doubaoAuthHeadersFor(service, voiceAuth(v)),
    'X-Api-Resource-Id': resourceId,
    ...(service === 'asr'
      ? { 'X-Api-Request-Id': randomUUID(), 'X-Api-Sequence': '-1' }
      : { 'X-Api-Connect-Id': randomUUID() }),
  };
}

export function testDoubaoTts(v: VoiceProbe & Pick<SettingsValues, 'doubaoTtsResourceId'>): Promise<CheckResult> {
  const missing = missingVoiceReason(v);
  if (missing) return Promise.resolve({ ok: false, reason: missing });
  return probeWs({
    url: doubaoTtsWsUrl(),
    headers: voiceHeaders('tts', v, v.doubaoTtsResourceId),
    onOpen: () => encodeTtsEvent({ event: 1, payload: Buffer.from('{}', 'utf8') }), // StartConnection
    judge: (buf) => {
      const err = parseErrorFrame(buf);
      if (err) return { verdict: 'error', text: err };
      try {
        const frame = decodeTtsFrame(buf);
        if (frame.event === 50) return { verdict: 'ok' }; // ConnectionStarted
        if (frame.event === 51) return { verdict: 'error', text: frame.payload.toString('utf8') }; // ConnectionFailed
      } catch {}
      return { verdict: 'continue' };
    },
  });
}

export function testDoubaoAsr(v: VoiceProbe & Pick<SettingsValues, 'doubaoAsrResourceId'>): Promise<CheckResult> {
  const missing = missingVoiceReason(v);
  if (missing) return Promise.resolve({ ok: false, reason: missing });
  return probeWs({
    url: doubaoAsrWsUrl(),
    headers: voiceHeaders('asr', v, v.doubaoAsrResourceId),
    // 与 asr-proxy 相同的 full client request,不带热词
    onOpen: () =>
      encodeFullClientRequest(
        {
          user: { uid: 'eduagent-settings-test', platform: 'web' },
          audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
          request: { model_name: 'bigmodel', enable_punc: true, enable_ddc: false, show_utterances: true, result_type: 'full', end_window_size: 800 },
        },
        1,
      ),
    judge: (buf) => {
      const err = parseErrorFrame(buf);
      if (err) return { verdict: 'error', text: err };
      return { verdict: 'ok' }; // 任何非错误的首个服务端帧 = 鉴权通过
    },
    okAfterOpenMs: 3000, // 握手成功但服务端暂无回包也算通过
  });
}

export interface TestReport {
  llm: CheckResult;
  tts: CheckResult;
  asr: CheckResult;
}

export async function runAllTests(v: SettingsValues): Promise<TestReport> {
  const [llm, tts, asr] = await Promise.all([testLlm(activeChannel(v)), testDoubaoTts(v), testDoubaoAsr(v)]);
  return { llm, tts, asr };
}

export function runChannelTest(v: SettingsValues, channelId: string): Promise<CheckResult> {
  const channel = v.llmChannels.find((item) => item.id === channelId);
  if (!channel) return Promise.resolve({ ok: false, reason: '找不到这个渠道' });
  return testLlm(channel);
}

export function runVoiceTests(v: SettingsValues): Promise<Pick<TestReport, 'tts' | 'asr'>> {
  return Promise.all([testDoubaoTts(v), testDoubaoAsr(v)]).then(([tts, asr]) => ({ tts, asr }));
}

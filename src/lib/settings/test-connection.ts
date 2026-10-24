// "测试连接":用表单里的值各发一次最小请求,返回家长能看懂的原因。
// 不在日志和返回里带任何 key;原始错误只保留 HTTP 状态码 / 豆包错误码。
import { randomUUID } from 'node:crypto';
import { WebSocket as WsClient } from 'ws';
import { decodeTtsFrame, encodeFullClientRequest, encodeTtsEvent, MessageType } from '../voice/doubao-codec';
import { doubaoAsrWsUrl, doubaoTtsWsUrl } from '../voice/doubao-endpoints';
import type { SettingsValues } from './store';

export interface CheckResult {
  ok: boolean;
  reason: string;
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

export async function testLlm(v: Pick<SettingsValues, 'llmApiKey' | 'llmBaseUrl' | 'llmModel'>): Promise<CheckResult> {
  if (!v.llmApiKey) return { ok: false, reason: '还没有填写 LLM API Key' };
  const url = `${v.llmBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${v.llmApiKey}` },
      body: JSON.stringify({ model: v.llmModel, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: true, reason: '连接正常' };
    }
    const text = await res.text().catch(() => '');
    // 模型名错误常见返回 400/404 + model 字样
    if (res.status === 400 && /model/i.test(text)) return { ok: false, reason: `模型名称不对或没有权限(HTTP 400)` };
    return { ok: false, reason: classifyFailure(res.status, text) };
  } catch (err) {
    return { ok: false, reason: networkReason(err) };
  }
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

export function testDoubaoTts(v: Pick<SettingsValues, 'doubaoAppId' | 'doubaoAccessKey' | 'doubaoTtsResourceId'>): Promise<CheckResult> {
  if (!v.doubaoAppId || !v.doubaoAccessKey) return Promise.resolve({ ok: false, reason: '还没有填写豆包 App ID / Access Key' });
  return probeWs({
    url: doubaoTtsWsUrl(),
    // 与 tts-proxy.ts 同样的头
    headers: {
      'X-Api-App-Id': v.doubaoAppId,
      'X-Api-Access-Key': v.doubaoAccessKey,
      'X-Api-Resource-Id': v.doubaoTtsResourceId,
      'X-Api-Connect-Id': randomUUID(),
    },
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

export function testDoubaoAsr(v: Pick<SettingsValues, 'doubaoAppId' | 'doubaoAccessKey' | 'doubaoAsrResourceId'>): Promise<CheckResult> {
  if (!v.doubaoAppId || !v.doubaoAccessKey) return Promise.resolve({ ok: false, reason: '还没有填写豆包 App ID / Access Key' });
  return probeWs({
    url: doubaoAsrWsUrl(),
    // 与 asr-proxy.ts 同样的头
    headers: {
      'X-Api-App-Key': v.doubaoAppId,
      'X-Api-Access-Key': v.doubaoAccessKey,
      'X-Api-Resource-Id': v.doubaoAsrResourceId,
      'X-Api-Request-Id': randomUUID(),
      'X-Api-Sequence': '-1',
    },
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
  const [llm, tts, asr] = await Promise.all([testLlm(v), testDoubaoTts(v), testDoubaoAsr(v)]);
  return { llm, tts, asr };
}

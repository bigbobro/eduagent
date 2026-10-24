// Electron e2e(Phase 0):启动打包后的 .app,临时 userData + VOICE_MOCK,Chromium 假麦克风。
// 用法:node desktop/e2e/app.e2e.mjs [path-to-EduAgent.app]
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';
import { WebSocketServer } from 'ws';

const appPath = resolve(process.argv[2] || 'desktop/dist/mac-arm64/EduAgent.app');
const exe = join(appPath, 'Contents/MacOS/EduAgent');
const userData = mkdtempSync(join(tmpdir(), 'eduagent-e2e-'));
const userData2 = mkdtempSync(join(tmpdir(), 'eduagent-e2e-settings-'));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`[e2e] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

let app;
let exitCode = 0;
try {
  app = await electron.launch({
    executablePath: exe,
    env: { ...process.env, EDUAGENT_TEST: '1', EDUAGENT_USER_DATA: userData, VOICE_MOCK: 'true' },
    timeout: 60000,
  });
  const page = await app.firstWindow();
  page.on('request', (r) => r.url().includes('/api/') && console.log('[req]', r.method(), r.url().replace(/.*38417/, ''), (r.postData() || '').slice(0, 80)));
  page.on('console', (m) => m.type() === 'error' && console.log('[renderer error]', m.text()));

  // 1. 首页
  await page.waitForURL(/127\.0\.0\.1:38417\/$/, { timeout: 60000 });
  await page.getByText('动物 Animals').first().waitFor({ timeout: 30000 });
  check('home page loads with course list', true, page.url());

  // 2. 进课
  await page.getByText('动物 Animals').first().click();
  await page.waitForURL(/\/lesson\/animals/, { timeout: 10000 });
  await page.getByRole('button', { name: /我们开始吧/ }).click();
  check('entered lesson', true);

  // 3. 按住说话 -> recording
  const button = page.getByRole('button', { name: /按住 Space 跟我读/ });
  await button.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.includes('按住 Space'));
    return Boolean(b && !b.disabled);
  }, undefined, { timeout: 30000 });
  const hero = '[data-picture-card-size="hero"][data-picture-card-state="recording"]';
  const chatPosts = [];
  page.on('response', (res) => {
    const req = res.request();
    if (req.url().endsWith('/api/chat') && req.method() === 'POST') {
      chatPosts.push({ action: /"action":"([^"]+)"/.exec(req.postData() || '')?.[1], status: res.status() });
    }
  });
  await page.keyboard.down('Space');
  let recording = true;
  try {
    await page.waitForSelector(hero, { timeout: 5000 });
    await page.waitForTimeout(500);
    recording = (await page.locator(hero).count()) > 0;
  } catch {
    recording = false;
  }
  check('recording state held while Space pressed', recording);

  // 4. mock 老师回复:按住足够久(避免"太短"提示),松开后 /api/chat 的 message 请求返回 200 且 UI 变化
  await page.waitForTimeout(1500); // 同一次按压继续按住,超过 800ms 的"太短"阈值
  await page.keyboard.up('Space');
  let replied = false;
  try {
    await page.waitForFunction(() => !document.querySelector('[data-picture-card-state="recording"]'), undefined, { timeout: 5000 });
    await page.waitForTimeout(4000);
    replied = chatPosts.some((p) => p.action === 'message' && p.status === 200);
  } catch {}
  const after = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160));
  check('mock round trip: /api/chat message -> 200', replied, `${JSON.stringify(chatPosts)} ui=${after}`);

  // 6. 日志文件
  const logPath = join(userData, 'logs/server.log');
  const logText = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  check('server.log written', logText.includes('Server listening') && logText.includes('127.0.0.1'));
  check('no real credential-like strings in log', !/sk-[A-Za-z0-9]{10,}/.test(logText));
  check('db created in userData', existsSync(join(userData, 'eduagent.db')));
} catch (err) {
  console.log('[e2e] ERROR', err);
  exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  rmSync(userData, { recursive: true, force: true });
}

// ───────────────────────── 场景 B:非 mock,设置页流程(Phase 1)─────────────────────────
// 全部使用假 key + 本地 fake server(LLM 走表单里的 Base URL,豆包走 DOUBAO_*_WS_URL),不请求真实厂商。
const B_PORT = 38427;
const B_ORIGIN = `http://127.0.0.1:${B_PORT}`;
const GOOD_LLM = 'fake-llm-key-e2e-ABCD1111';
const GOOD_ACCESS = 'fake-access-key-e2e-EFGH2222';
const FAKE_APP_ID = 'fake-app-id-e2e-3333';
const ALL_KEYS = [GOOD_LLM, GOOD_ACCESS, FAKE_APP_ID];

function ttsConnectionStarted() {
  const body = Buffer.from('{}');
  const sid = Buffer.from('c1');
  const ev = Buffer.alloc(4); ev.writeInt32BE(50);
  const sl = Buffer.alloc(4); sl.writeUInt32BE(sid.length);
  const bl = Buffer.alloc(4); bl.writeUInt32BE(body.length);
  return Buffer.concat([Buffer.from([0x11, 0x94, 0x10, 0x00]), ev, sl, sid, bl, body]);
}
function asrFrame() {
  const body = Buffer.from('{"result":{"text":""}}');
  const seq = Buffer.alloc(4); seq.writeInt32BE(1);
  const bl = Buffer.alloc(4); bl.writeUInt32BE(body.length);
  return Buffer.concat([Buffer.from([0x11, 0x91, 0x10, 0x00]), seq, bl, body]);
}
const verifyClient = (info, cb) => (info.req.headers['x-api-access-key'] === GOOD_ACCESS ? cb(true) : cb(false, 401, 'Unauthorized'));
const llmServer = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    if (req.headers.authorization === `Bearer ${GOOD_LLM}`) res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"choices":[{"message":{"content":"hi"}}]}');
    else res.writeHead(401).end('{"error":{"message":"Invalid token"}}');
  });
});
const ttsServer = new WebSocketServer({ port: 0, host: '127.0.0.1', verifyClient });
ttsServer.on('connection', (ws) => ws.on('message', () => ws.send(ttsConnectionStarted())));
const asrServer = new WebSocketServer({ port: 0, host: '127.0.0.1', verifyClient });
asrServer.on('connection', (ws) => ws.on('message', () => ws.send(asrFrame())));
await new Promise((r) => llmServer.listen(0, '127.0.0.1', r));
await Promise.all([ttsServer, asrServer].map((s) => (s.address() ? null : new Promise((r) => s.once('listening', r)))));
const llmUrl = `http://127.0.0.1:${llmServer.address().port}/v1`;

function nodeRequest(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: B_PORT, path, method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

let appB;
try {
  const envB = { ...process.env, EDUAGENT_TEST: '1', EDUAGENT_USER_DATA: userData2, EDUAGENT_PORT: String(B_PORT),
    DOUBAO_TTS_WS_URL: `ws://127.0.0.1:${ttsServer.address().port}`, DOUBAO_ASR_WS_URL: `ws://127.0.0.1:${asrServer.address().port}` };
  delete envB.VOICE_MOCK;
  appB = await electron.launch({ executablePath: exe, env: envB, timeout: 60000 });
  const page = await appB.firstWindow();
  page.on('console', (m) => m.type() === 'error' && console.log('[renderer error]', m.text()));

  // B1. 空 userData + 非 mock -> 首页跳转设置页
  await page.waitForURL(/\/settings$/, { timeout: 60000 });
  await page.getByTestId('config-status').waitFor({ timeout: 30000 });
  check('empty userData, non-mock: opens the settings page', (await page.getByTestId('config-status').innerText()).includes('还没有配置'), page.url());

  // B2. 填假 key,测试连接成功
  await page.getByLabel('Base URL').fill(llmUrl);
  await page.getByLabel(/^API Key/).fill(GOOD_LLM);
  await page.getByLabel('App ID').fill(FAKE_APP_ID);
  await page.getByLabel('Access Key').fill('wrong-access-key-0000');
  await page.getByRole('button', { name: '测试连接' }).click();
  await page.getByTestId('result-语音合成(TTS)').waitFor({ timeout: 20000 });
  const failText = await page.locator('main').innerText();
  check('test connection: wrong key shows readable auth failure (fake server)', /鉴权失败/.test(failText) && failText.includes('401') && !failText.includes('wrong-access-key-0000'));
  await page.getByLabel('Access Key').fill(GOOD_ACCESS);
  await page.getByRole('button', { name: '测试连接' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('语音识别(ASR):'), undefined, { timeout: 20000 });
  const okText = await page.locator('main').innerText();
  check('test connection: correct fake key -> LLM/TTS/ASR all ok', ['LLM', '语音合成(TTS)', '语音识别(ASR)'].every((n) => okText.includes(`✓ ${n}`)), okText.split('\n').filter((l) => /[✓✗]/.test(l)).join(' | '));

  // B3. 外链走系统浏览器(stub shell.openExternal)
  await appB.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = (u) => { globalThis.__opened.push(u); return Promise.resolve(); }; });
  await page.getByRole('link', { name: /火山引擎豆包语音控制台/ }).click();
  await page.waitForTimeout(500);
  const opened = await appB.evaluate(() => globalThis.__opened);
  check('external guide link opens in system browser, window stays on settings', opened.length === 1 && opened[0].startsWith('https://console.volcengine.com/') && /\/settings$/.test(page.url()), JSON.stringify(opened));

  // B4. 保存 -> server 重启 -> 窗口 reload -> configured=true
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByRole('status').waitFor({ timeout: 10000 });
  await page.getByText('动物 Animals').first().waitFor({ timeout: 60000 });
  const info = JSON.parse((await nodeRequest('/api/settings')).text);
  const logPath2 = join(userData2, 'logs/server.log');
  const log2 = readFileSync(logPath2, 'utf8');
  const restarts = (log2.match(/server requested restart/g) || []).length;
  check('save: server restarted once, window reloaded to home, configured=true', info.configured === true && info.mode === 'app' && restarts === 1 && /127\.0\.0\.1:38427\/$/.test(page.url()), `restarts=${restarts} url=${page.url()}`);

  // B5. 文件权限、无完整 key
  const settingsPath = join(userData2, 'settings.json');
  check('settings.json mode is 0600', (statSync(settingsPath).mode & 0o777) === 0o600, (statSync(settingsPath).mode & 0o777).toString(8));
  const infoText = (await nodeRequest('/api/settings')).text;
  const logAll = readFileSync(logPath2, 'utf8');
  check('no full key in server.log or HTTP responses', ALL_KEYS.every((k) => !logAll.includes(k) && !infoText.includes(k)) && info.values.llmApiKey === '••••1111');

  // B6. CSRF:无 Origin / 外站 Origin 的 POST 被拒
  const noOrigin = await nodeRequest('/api/settings', { method: 'POST', body: '{}' });
  const evil = await nodeRequest('/api/settings/test', { method: 'POST', headers: { Origin: 'http://evil.example' }, body: '{}' });
  check('POST /api/settings* without allowed Origin -> 403', noOrigin.status === 403 && evil.status === 403, `${noOrigin.status}/${evil.status}`);

  // B7. 重启后配置真的生效:/api/chat 不再是 503
  const ctl = await nodeRequest('/api/chat', { method: 'POST', headers: { Origin: B_ORIGIN }, body: JSON.stringify({ action: 'end', sessionId: 'nope' }) }).catch((e) => ({ status: String(e) }));
  check('after restart /api/chat is no longer NOT_CONFIGURED', ctl.status !== 503, String(ctl.status));
} catch (err) {
  console.log('[e2e] ERROR (scenario B)', err);
  exitCode = 1;
} finally {
  if (appB) await appB.close().catch(() => {});
  llmServer.close();
  ttsServer.close();
  asrServer.close();
  rmSync(userData2, { recursive: true, force: true });
}
if (results.some((r) => !r.ok)) exitCode = 1;
console.log(`[e2e] ${exitCode === 0 ? 'ALL PASS' : 'FAILED'} (${results.filter((r) => r.ok).length}/${results.length})`);
process.exit(exitCode);

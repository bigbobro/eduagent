// Electron e2e(Phase 0):启动打包后的 .app,临时 userData + VOICE_MOCK,Chromium 假麦克风。
// 用法:node desktop/e2e/app.e2e.mjs [path-to-EduAgent.app]
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

const appPath = resolve(process.argv[2] || 'desktop/dist/mac-arm64/EduAgent.app');
const exe = join(appPath, 'Contents/MacOS/EduAgent');
const userData = mkdtempSync(join(tmpdir(), 'eduagent-e2e-'));
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
    env: { ...process.env, EDUAGENT_TEST: '1', EDUAGENT_USER_DATA: userData },
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
if (results.some((r) => !r.ok)) exitCode = 1;
console.log(`[e2e] ${exitCode === 0 ? 'ALL PASS' : 'FAILED'} (${results.filter((r) => r.ok).length}/${results.length})`);
process.exit(exitCode);

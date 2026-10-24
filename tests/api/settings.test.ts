// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfig } from '@/lib/config';

const restart = vi.hoisted(() => vi.fn());
vi.mock('@/lib/settings/restart', () => ({ scheduleRestart: restart, RESTART_EXIT_CODE: 75 }));

import { GET, POST } from '@/app/api/settings/route';
import { POST as TEST_POST } from '@/app/api/settings/test/route';

const ORIGIN = 'http://127.0.0.1:3000';
const FAKE_KEY = 'sk-fake-0123456789abcdefWXYZ';
const FAKE_ACCESS = 'fake-access-token-QRST';

const form = (over: Record<string, string> = {}) => ({
  llmApiKey: FAKE_KEY,
  llmBaseUrl: 'https://llm.example.test/v1',
  llmModel: 'fake-model',
  doubaoAppId: 'fake-app-id-12345678',
  doubaoAccessKey: FAKE_ACCESS,
  doubaoAsrResourceId: 'asr-res',
  doubaoTtsResourceId: 'tts-res',
  doubaoTtsSpeaker: 'spk',
  ...over,
});

function post(handler: typeof POST, body: unknown, origin: string | null = ORIGIN) {
  return handler(
    new Request('http://127.0.0.1:3000/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe('/api/settings', () => {
  let dir: string;
  let settingsPath: string;
  const envKeys = ['EDUAGENT_APP', 'EDUAGENT_SETTINGS_PATH', 'PORT', 'VOICE_MOCK', 'LLM_API_KEY', 'MIMO_API_KEY', 'DOUBAO_APP_ID', 'DOUBAO_ACCESS_KEY', 'DOUBAO_ASR_RESOURCE_ID', 'DOUBAO_TTS_RESOURCE_ID'];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'eduagent-settings-api-'));
    settingsPath = join(dir, 'settings.json');
    for (const k of envKeys) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.PORT = '3000';
    restart.mockClear();
    resetConfig();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const k of envKeys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!; }
    resetConfig();
  });

  function appMode() {
    process.env.EDUAGENT_APP = '1';
    process.env.EDUAGENT_SETTINGS_PATH = settingsPath;
  }

  it('GET app mode, nothing saved: unconfigured with defaults and empty secrets', async () => {
    appMode();
    const body = await (await GET()).json();
    expect(body.mode).toBe('app');
    expect(body.configured).toBe(false);
    expect(body.values.llmApiKey).toBe('');
    expect(body.values.llmBaseUrl).toBe('https://api.siliconflow.cn/v1');
    expect(body.values.doubaoAsrResourceId).toBe('volc.seedasr.sauc.duration');
  });

  it('GET masks every credential field (last 4 only) and returns non-secrets as is', async () => {
    appMode();
    expect((await post(POST, form())).status).toBe(200);
    // 模拟重启后 server 把文件写进 env
    const { applySettingsToEnv } = await import('@/lib/settings/store');
    applySettingsToEnv();
    const res = await GET();
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.configured).toBe(true);
    expect(body.values.llmApiKey).toBe('••••WXYZ');
    expect(body.values.doubaoAccessKey).toBe('••••QRST');
    expect(body.values.doubaoAppId).toBe('••••5678');
    expect(body.values.llmBaseUrl).toBe('https://llm.example.test/v1');
    expect(body.values.doubaoTtsResourceId).toBe('tts-res');
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain(FAKE_ACCESS);
  });

  it('GET web mode reads the current env and reports mode=web / mock', async () => {
    process.env.VOICE_MOCK = 'true';
    const body = await (await GET()).json();
    expect(body).toMatchObject({ mode: 'web', configured: true, mock: true });
  });

  it('POST app mode: writes settings.json 0600, asks for a restart, response never contains the key', async () => {
    appMode();
    const res = await post(POST, form());
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(FAKE_KEY);
    expect(statSync(settingsPath).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).llmApiKey).toBe(FAKE_KEY);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('POST with masked or empty secrets keeps the saved values, while other fields update', async () => {
    appMode();
    await post(POST, form());
    const res = await post(POST, form({ llmApiKey: '••••WXYZ', doubaoAccessKey: '', doubaoAppId: '••••5678', llmModel: 'changed-model' }));
    expect(res.status).toBe(200);
    const saved = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(saved.llmApiKey).toBe(FAKE_KEY);
    expect(saved.doubaoAccessKey).toBe(FAKE_ACCESS);
    expect(saved.doubaoAppId).toBe('fake-app-id-12345678');
    expect(saved.llmModel).toBe('changed-model');
    expect(statSync(settingsPath).mode & 0o777).toBe(0o600);
  });

  it('POST web mode is 403 and writes nothing', async () => {
    process.env.EDUAGENT_SETTINGS_PATH = settingsPath; // 即使有路径,没有 EDUAGENT_APP 也不写
    const res = await post(POST, form());
    expect(res.status).toBe(403);
    expect(restart).not.toHaveBeenCalled();
    expect(() => statSync(settingsPath)).toThrow();
  });

  it('POST rejects invalid payloads with 400', async () => {
    appMode();
    expect((await post(POST, form({ llmBaseUrl: 'javascript:alert(1)' }))).status).toBe(400);
    expect((await post(POST, { llmApiKey: 'x' })).status).toBe(400);
    expect(restart).not.toHaveBeenCalled();
  });

  describe.each([
    ['POST /api/settings', POST],
    ['POST /api/settings/test', TEST_POST],
  ])('%s Origin check (CSRF)', (_name, handler) => {
    it.each([
      ['missing Origin', null],
      ['foreign Origin', 'http://evil.example'],
      ['wrong port', 'http://127.0.0.1:4000'],
      ['opaque null Origin', 'null'],
    ])('rejects %s with 403 before doing anything', async (_label, origin) => {
      appMode();
      const res = await post(handler, form(), origin);
      expect(res.status).toBe(403);
      expect(restart).not.toHaveBeenCalled();
      expect(() => statSync(settingsPath)).toThrow();
    });
  });
});

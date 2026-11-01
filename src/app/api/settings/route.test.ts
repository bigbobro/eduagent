// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { resetConfig } from '@/lib/config';

vi.mock('@/lib/settings/restart', () => ({ scheduleRestart: vi.fn() }));

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'eduagent-settings-route-'));
  path = join(dir, 'settings.json');
  vi.stubEnv('EDUAGENT_APP', '1');
  vi.stubEnv('EDUAGENT_SETTINGS_PATH', path);
  vi.stubEnv('REALTIME_TURN_MODE', '');
  vi.stubEnv('VOICE_MOCK', 'true');
  resetConfig();
});
afterEach(() => { vi.unstubAllEnvs(); resetConfig(); rmSync(dir, { recursive: true, force: true }); });

const body = (extra: object = {}) => ({
  llmChannels: [{ id: 'c1', name: 'x', provider: 'siliconflow', baseUrl: 'https://api.siliconflow.cn/v1', apiKey: 'sk-fake-route-test-1234', model: 'm' }],
  activeLlmChannelId: 'c1', doubaoAuthMode: 'apikey', doubaoApiKey: '', doubaoAppId: '', doubaoAccessKey: '',
  doubaoAsrResourceId: 'a', doubaoTtsResourceId: 'b', doubaoTtsSpeaker: 'c', ...extra,
});
const post = (payload: unknown) => POST(new Request('http://localhost:3000/api/settings', {
  method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
}));

it('saves the turn mode, reports the effective mode, and keeps keys masked', async () => {
  expect((await (await GET()).json()).realtimeTurnMode).toBe('auto');
  expect((await post(body({ realtimeTurnMode: 'manual' }))).status).toBe(200);
  expect(JSON.parse(readFileSync(path, 'utf8')).realtimeTurnMode).toBe('manual');
  const got = await (await GET()).json();
  expect(got.realtimeTurnMode).toBe('manual');
  expect(got.values.realtimeTurnMode).toBe('manual');
  expect(JSON.stringify(got)).not.toContain('sk-fake-route-test-1234');
  vi.stubEnv('REALTIME_TURN_MODE', 'auto');
  const overridden = await (await GET()).json();
  expect(overridden.realtimeTurnMode).toBe('auto');
  expect(overridden.values.realtimeTurnMode).toBe('manual');
});

it('rejects an invalid turn mode and does not write', async () => {
  expect((await post(body({ realtimeTurnMode: 'sideways' }))).status).toBe(400);
  expect(() => readFileSync(path, 'utf8')).toThrow();
});

it('a submission without the field keeps the saved turn mode', async () => {
  await post(body({ realtimeTurnMode: 'manual' }));
  await post(body());
  expect(JSON.parse(readFileSync(path, 'utf8')).realtimeTurnMode).toBe('manual');
});

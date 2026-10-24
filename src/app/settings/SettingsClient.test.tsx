import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsClient } from './SettingsClient';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const values = {
  llmApiKey: '', llmBaseUrl: '', llmModel: '',
  doubaoAppId: '', doubaoAccessKey: '', doubaoAsrResourceId: '', doubaoTtsResourceId: '', doubaoTtsSpeaker: '',
};
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => vi.restoreAllMocks());

describe('SettingsClient', () => {
  it('web mode is read-only and points at .env.local', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json({ mode: 'web', configured: true, values }));
    render(<SettingsClient />);
    expect(await screen.findByTestId('readonly-hint')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
    expect((screen.getByLabelText(/Base URL/) as HTMLInputElement).disabled).toBe(true);
  });

  it('app mode unconfigured: defaults prefilled, masked key shown only as placeholder, test + save post the form', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      calls.push({ url, body: init?.body as string | undefined });
      if (url === '/api/settings' && !init) {
        return json({ mode: 'app', configured: false, values: { ...values, doubaoAccessKey: '••••5678' } });
      }
      if (url === '/api/settings/test') {
        return json({ llm: { ok: true, reason: '连接正常' }, tts: { ok: false, reason: '鉴权失败:x(HTTP 401)' }, asr: { ok: true, reason: '连接正常' } });
      }
      return json({ ok: true });
    });
    render(<SettingsClient />);
    expect(await screen.findByText('还没有配置 Key')).toBeTruthy();
    expect((screen.getByLabelText(/Base URL/) as HTMLInputElement).value).toBe('https://api.siliconflow.cn/v1');
    expect((screen.getByLabelText(/TTS Resource ID/) as HTMLInputElement).value).toBe('seed-tts-2.0');
    const access = screen.getByLabelText(/Access Key/) as HTMLInputElement;
    expect(access.value).toBe('');
    expect(access.placeholder).toContain('••••5678');

    fireEvent.change(screen.getByLabelText(/^API Key/), { target: { value: 'sk-fake-typed' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findByText(/鉴权失败/)).toBeTruthy();
    const testCall = calls.find((c) => c.url === '/api/settings/test')!;
    expect(JSON.parse(testCall.body!)).toMatchObject({ llmApiKey: 'sk-fake-typed', doubaoAccessKey: '' });

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('正在重启'));
  });
});

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsClient } from './SettingsClient';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/audio/microphone', () => ({ getMicStatus: async () => 'granted', requestMic: async () => 'granted' }));

const values = {
  llmApiKey: '', llmBaseUrl: '', llmModel: '',
  doubaoAppId: '', doubaoAccessKey: '', doubaoAsrResourceId: '', doubaoTtsResourceId: '', doubaoTtsSpeaker: '',
};
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/settings');
});

describe('SettingsClient', () => {
  it('web mode is read-only and points at .env.local', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => String(input) === '/api/learners' ? json([]) : json({ mode: 'web', configured: true, values }));
    render(<SettingsClient />);
    expect(await screen.findByTestId('readonly-hint')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
    expect((screen.getByLabelText('服务地址') as HTMLInputElement).disabled).toBe(true);
  });

  it('switches sections and keeps advanced fields folded until asked', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => String(input) === '/api/learners' ? json([]) : json({ mode: 'app', configured: true, values }));
    render(<SettingsClient />);
    expect(await screen.findByLabelText('服务地址')).toBeTruthy();
    expect(screen.queryByLabelText(/TTS Resource ID/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /高级/ }));
    expect((screen.getByLabelText(/TTS Resource ID/) as HTMLInputElement).value).toBe('seed-tts-2.0');
    fireEvent.click(screen.getByRole('button', { name: '麦克风' }));
    expect(await screen.findByTestId('mic-status')).toHaveTextContent('已允许');
    expect(screen.queryByLabelText('服务地址')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '关于' }));
    expect(await screen.findByRole('heading', { name: '关于' })).toBeTruthy();
  });

  it('app mode unconfigured: defaults prefilled, masked key shown only as placeholder, test + save post the form', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url === '/api/learners') return json([]);
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
    expect(screen.getByTestId('result-AI 老师')).toHaveTextContent('未测试');
    expect((screen.getByLabelText('服务地址') as HTMLInputElement).value).toBe('https://api.siliconflow.cn/v1');
    fireEvent.click(screen.getByRole('button', { name: /高级/ }));
    expect((screen.getByLabelText(/TTS Resource ID/) as HTMLInputElement).value).toBe('seed-tts-2.0');
    const access = screen.getByLabelText(/Access Key/) as HTMLInputElement;
    expect(access.value).toBe('');
    expect(access.placeholder).toContain('••••5678');

    fireEvent.change(screen.getByLabelText(/^API Key/), { target: { value: 'sk-fake-typed' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findByTestId('result-发音')).toHaveTextContent('鉴权失败');
    const testCall = calls.find((c) => c.url === '/api/settings/test')!;
    expect(JSON.parse(testCall.body!)).toMatchObject({ llmApiKey: 'sk-fake-typed', doubaoAccessKey: '' });

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('正在重启'));
  });
});

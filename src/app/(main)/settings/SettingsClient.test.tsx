import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsClient } from './SettingsClient';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/audio/microphone', () => ({ getMicStatus: async () => 'granted', requestMic: async () => 'granted' }));

const channel = {
  id: 'default-llm',
  name: 'SiliconFlow',
  provider: 'siliconflow',
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKey: '',
  model: 'deepseek-ai/DeepSeek-V3.2',
};
const values = {
  llmChannels: [channel],
  activeLlmChannelId: channel.id,
  doubaoAppId: '',
  doubaoAccessKey: '',
  doubaoAsrResourceId: '',
  doubaoTtsResourceId: '',
  doubaoTtsSpeaker: '',
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
    expect(screen.getByRole('button', { name: '添加渠道' })).toBeDisabled();
    expect(screen.getByText('正在使用')).toBeTruthy();
    expect(screen.queryByLabelText('服务地址')).toBeNull();
  });

  it('switches sections and keeps advanced fields folded until asked', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => String(input) === '/api/learners' ? json([]) : json({ mode: 'app', configured: true, values }));
    render(<SettingsClient />);
    expect(await screen.findByRole('heading', { name: 'AI 老师' })).toBeTruthy();
    expect(screen.queryByLabelText(/TTS Resource ID/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '语音' }));
    expect(screen.getByLabelText('豆包 API Key')).toBeTruthy();
    expect(screen.queryByLabelText('App ID')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /旧版控制台/ }));
    expect(screen.getByLabelText('App ID')).toBeTruthy();
    expect(screen.queryByLabelText('豆包 API Key')).toBeNull();
    expect(screen.queryByLabelText(/TTS Resource ID/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /高级/ }));
    expect((screen.getByLabelText(/TTS Resource ID/) as HTMLInputElement).value).toBe('seed-tts-2.0');
    fireEvent.click(screen.getByRole('button', { name: '麦克风' }));
    expect(await screen.findByTestId('mic-status')).toHaveTextContent('已允许');
    expect(screen.queryByLabelText(/TTS Resource ID/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '关于' }));
    expect(await screen.findByRole('heading', { name: '关于' })).toBeTruthy();
  });

  it('app mode: channel test posts that channel, and the only channel cannot be deleted', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url === '/api/learners') return json([]);
      calls.push({ url, body: init?.body as string | undefined });
      if (url === '/api/settings' && !init) {
        return json({
          mode: 'app',
          configured: false,
          values: { ...values, llmChannels: [{ ...channel, apiKey: '••••5678' }], doubaoAccessKey: '••••5678' },
        });
      }
      if (url === '/api/settings/test') {
        return json({ llm: { ok: true, reason: '正常 · 首字 0.2s · 整轮 0.4s' } });
      }
      return json({ ok: true });
    });
    render(<SettingsClient />);
    expect(await screen.findByText('还没有配置 Key')).toBeTruthy();
    expect(screen.getByText('deepseek-ai/DeepSeek-V3.2')).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    const key = screen.getByLabelText('API Key') as HTMLInputElement;
    expect(key.value).toBe('');
    expect(key.placeholder).toContain('••••5678');
    fireEvent.change(key, { target: { value: 'sk-fake-typed' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findByTestId('result-SiliconFlow')).toHaveTextContent('首字 0.2s');
    const testCall = calls.find((item) => item.url === '/api/settings/test')!;
    expect(JSON.parse(testCall.body!)).toMatchObject({
      scope: 'channel',
      channelId: 'default-llm',
      llmChannels: [expect.objectContaining({ apiKey: 'sk-fake-typed', provider: 'siliconflow' })],
    });

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('正在重启'));
  });
});

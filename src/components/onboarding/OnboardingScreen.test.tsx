import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingScreen } from './OnboardingScreen';
import { MIC_SETUP_COMPLETE, ONBOARDING_SKIP_CHILD, ONBOARDING_SKIP_CONFIG } from '@/lib/onboarding-entry';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
const permission = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace }) }));
vi.mock('@/lib/audio/microphone', () => ({ getMicStatus: permission.status, requestMic: permission.request }));
vi.mock('@/lib/audio/recorder', () => ({ LessonRecorder: class { start = vi.fn(); dispose = vi.fn(); } }));

const values = {
  llmApiKey: '', llmBaseUrl: '', llmModel: '',
  doubaoAppId: '', doubaoAccessKey: '', doubaoAsrResourceId: '', doubaoTtsResourceId: '', doubaoTtsSpeaker: '',
};
const storage = new Map<string, string>();
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  storage.clear();
  replace.mockClear();
  permission.status.mockReset();
  permission.request.mockReset();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe('OnboardingScreen', () => {
  it('walks the three steps and remembers each skip', async () => {
    permission.status.mockResolvedValue('not-determined');
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url === '/api/settings') return json({ mode: 'app', configured: false, values });
      if (url === '/api/learners') return json([]);
      return json({ ok: true });
    });
    render(<OnboardingScreen />);
    expect(await screen.findByRole('heading', { name: '连上 AI 老师和语音服务' })).toBeTruthy();
    expect(await screen.findByTestId('result-听写')).toHaveTextContent('未测试');
    fireEvent.click(screen.getByRole('button', { name: '以后再说' }));
    expect(await screen.findByRole('heading', { name: '允许使用麦克风' })).toBeTruthy();
    expect(storage.get(ONBOARDING_SKIP_CONFIG)).toBe('1');
    expect(permission.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '以后再说' }));
    expect(await screen.findByRole('heading', { name: '建第一个孩子档案' })).toBeTruthy();
    expect(storage.get(MIC_SETUP_COMPLETE)).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '以后再说' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(storage.get(ONBOARDING_SKIP_CHILD)).toBe('1');
  });

  it('shows the connection step as already finished in demo mode', async () => {
    permission.status.mockResolvedValue('granted');
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => String(input) === '/api/learners'
      ? json([])
      : json({ mode: 'app', configured: true, mock: true, values }));
    render(<OnboardingScreen />);
    expect(await screen.findByRole('heading', { name: '建第一个孩子档案' })).toBeTruthy();
    expect(screen.getByText('演示模式不需要填写 Key。连接这一步已经完成。')).toBeTruthy();
    expect(screen.getAllByLabelText('已完成').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: '连上 AI 老师和语音服务' })).toBeNull();
  });
});

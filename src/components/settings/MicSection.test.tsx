import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MicSection } from './MicSection';
import { AboutSection } from './AboutSection';
import { MicOnboarding } from '@/app/microphone/MicOnboarding';

const permission = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn() }));
vi.mock('@/lib/audio/microphone', () => ({ getMicStatus: permission.status, requestMic: permission.request }));
const audio = vi.hoisted(() => ({ start: vi.fn(), dispose: vi.fn() }));
vi.mock('@/lib/audio/recorder', () => ({ LessonRecorder: class { start = audio.start; dispose = audio.dispose; } }));
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); delete window.eduagentDesktop; });

describe('microphone settings', () => {
  it('web mode hides native controls and never requests access while mounting', async () => {
    permission.status.mockResolvedValue('denied');
    render(<><MicSection /><AboutSection /></>);
    await screen.findByText('已拒绝');
    expect(screen.queryByRole('button', { name: '打开系统设置' })).toBeNull();
    expect(screen.queryByRole('button', { name: '打开日志文件夹' })).toBeNull();
    expect(permission.request).not.toHaveBeenCalled();
  });
  it('onboarding completes only after an explicit grant or skip', async () => {
    permission.status.mockResolvedValue('not-determined');
    permission.request.mockResolvedValue('granted');
    const done = vi.fn();
    render(<MicOnboarding onDone={done} />);
    await screen.findByRole('button', { name: '允许使用麦克风' });
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '允许使用麦克风' }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(localStorage.getItem('eduagent:mic-setup-complete')).toBe('1');
  });
  it('disposes the existing recorder when leaving during a pending test recording', async () => {
    permission.status.mockResolvedValue('granted');
    let ready!: () => void;
    audio.start.mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    audio.dispose.mockResolvedValue(undefined);
    const view = render(<MicSection />);
    await screen.findByText('已允许');
    fireEvent.click(screen.getByRole('button', { name: '试录一下' }));
    await waitFor(() => expect(audio.start).toHaveBeenCalledOnce());
    view.unmount();
    expect(audio.dispose).toHaveBeenCalled();
    ready();
    await waitFor(() => expect(audio.dispose).toHaveBeenCalledTimes(2));
  });
});

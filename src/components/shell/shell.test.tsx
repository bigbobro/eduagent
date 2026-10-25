import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import { DesktopEvents } from './DesktopEvents';
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/records', useRouter: () => ({ push }) }));
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ id: 'a', name: '阿甲' }, { id: 'b', name: '阿乙' }]))));
});
afterEach(() => { vi.unstubAllGlobals(); delete window.eduagentDesktop; push.mockClear(); });
describe('shell', () => {
  it('labels the active tab and supports keyboard learner switching and Escape', async () => {
    render(<Toolbar />);
    expect(screen.getByRole('link', { name: '学习记录' })).toHaveAttribute('aria-current', 'page');
    const trigger = screen.getByRole('button', { name: /切换孩子/ });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const first = await screen.findByRole('menuitemradio', { name: '阿甲' });
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitemradio', { name: '阿乙' })).toHaveFocus();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '阿乙' }));
    expect(localStorage.getItem('eduagent.currentLearnerId')).toBe('b');
    expect(trigger).toHaveTextContent('阿乙');
    fireEvent.click(trigger); fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull(); expect(trigger).toHaveFocus();
  });
  it('routes native commands and cleans up the one subscription', () => {
    let listener: (command: import('@/lib/audio/microphone').MenuCommand) => void = () => {};
    const unsubscribe = vi.fn();
    window.eduagentDesktop = {
      onMenuCommand: (callback) => { listener = callback; return unsubscribe; },
      getMicStatus: async () => 'granted', requestMic: async () => 'granted', getAppInfo: async () => ({ version: '0.1.0' }), openMicSettings: async () => {}, openLogsFolder: async () => {},
    };
    const { unmount } = render(<DesktopEvents />);
    listener('nav:records'); expect(push).toHaveBeenLastCalledWith('/records');
    listener('nav:settings'); expect(push).toHaveBeenLastCalledWith('/settings');
    listener('learner:new'); expect(push).toHaveBeenLastCalledWith('/settings#learner-name');
    listener('learner:b'); expect(localStorage.getItem('eduagent.currentLearnerId')).toBe('b');
    const content = document.createElement('div'); document.body.appendChild(content);
    const input = document.createElement('input'); document.body.appendChild(input);
    expect(fireEvent.contextMenu(content)).toBe(false); expect(fireEvent.contextMenu(input)).toBe(true);
    content.remove(); input.remove(); unmount(); expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

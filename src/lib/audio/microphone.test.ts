import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMicStatus, requestMic } from './microphone';

afterEach(() => { vi.unstubAllGlobals(); delete window.eduagentDesktop; });
describe('microphone permission entry points', () => {
  it.each([['prompt', 'not-determined'], ['denied', 'denied'], ['granted', 'granted']])('checks browser %s without capturing audio', async (state, expected) => {
    const capture = vi.fn();
    vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue({ state }) }, mediaDevices: { getUserMedia: capture } });
    expect(await getMicStatus()).toBe(expected);
    expect(capture).not.toHaveBeenCalled();
  });
  it('returns an undetermined status when browser permission query is unsupported', async () => {
    vi.stubGlobal('navigator', {});
    expect(await getMicStatus()).toBe('not-determined');
  });
  it('releases the browser permission-request stream immediately', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    expect(await requestMic()).toBe('granted');
    expect(stop).toHaveBeenCalledOnce();
  });
  it('uses the isolated bridge instead of browser media capture in desktop mode', async () => {
    const status = vi.fn().mockResolvedValue('not-determined');
    const request = vi.fn().mockResolvedValue('granted');
    window.eduagentDesktop = { getMicStatus: status, requestMic: request, getAppInfo: vi.fn(), openMicSettings: vi.fn(), openLogsFolder: vi.fn() };
    expect(await getMicStatus()).toBe('not-determined');
    expect(request).not.toHaveBeenCalled();
    expect(await requestMic()).toBe('granted');
  });
});

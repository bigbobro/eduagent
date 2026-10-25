'use client';

import { useEffect, useRef, useState } from 'react';
import { clearResumeMicrophone, markResumeMicrophone } from '@/lib/onboarding-entry';
import { LLM_PROVIDERS, type LlmChannel, type LlmProviderId } from '@/lib/llm-providers';
import type { DoubaoAuthMode, SettingsValues, VoiceField } from '@/lib/settings/types';

export type { LlmChannel, LlmProviderId, VoiceField };
export interface CheckResult { ok: boolean; reason: string }
export interface TestReport { llm?: CheckResult; tts?: CheckResult; asr?: CheckResult }
export interface SettingsResponse {
  mode: 'app' | 'web';
  configured: boolean;
  mock?: boolean;
  values: SettingsValues;
}

const VOICE_DEFAULTS: Pick<SettingsValues, 'doubaoAsrResourceId' | 'doubaoTtsResourceId'> = {
  doubaoAsrResourceId: 'volc.seedasr.sauc.duration',
  doubaoTtsResourceId: 'seed-tts-2.0',
};

export type VoiceDraft = Pick<SettingsValues, VoiceField | 'doubaoApiKey'> & {
  doubaoAuthMode: DoubaoAuthMode;
};

const EMPTY_VOICE: VoiceDraft = {
  doubaoAuthMode: 'apikey',
  doubaoApiKey: '',
  doubaoAppId: '',
  doubaoAccessKey: '',
  doubaoAsrResourceId: '',
  doubaoTtsResourceId: '',
  doubaoTtsSpeaker: '',
};

export interface SettingsDraft {
  info: SettingsResponse | null;
  loadError: boolean;
  channels: LlmChannel[];
  maskedKeys: Record<string, string>;
  activeLlmChannelId: string;
  voice: VoiceDraft;
  maskedVoice: Partial<Pick<SettingsValues, 'doubaoApiKey' | 'doubaoAppId' | 'doubaoAccessKey'>>;
  report: TestReport | null;
  channelReports: Record<string, CheckResult>;
  testing: null | 'all' | 'voice' | string;
  phase: 'idle' | 'saving' | 'restarting';
  error: string | null;
  readOnly: boolean;
  setChannel: (id: string, patch: Partial<LlmChannel>) => void;
  setVoice: (key: keyof VoiceDraft, value: string) => void;
  runTest: (options?: TestOptions) => Promise<void>;
  save: (options?: SaveOptions) => Promise<void>;
}

interface TestOptions {
  scope?: 'all' | 'channel' | 'voice';
  channelId?: string;
  channels?: LlmChannel[];
  activeLlmChannelId?: string;
}

interface SaveOptions {
  resumeMicrophone?: boolean;
  channels?: LlmChannel[];
  activeLlmChannelId?: string;
}

export function useSettingsDraft(): SettingsDraft {
  const [info, setInfo] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [channels, setChannels] = useState<LlmChannel[]>([]);
  const [maskedKeys, setMaskedKeys] = useState<Record<string, string>>({});
  const [activeLlmChannelId, setActiveLlmChannelId] = useState('');
  const [voice, setVoiceState] = useState(EMPTY_VOICE);
  const [maskedVoice, setMaskedVoice] = useState<SettingsDraft['maskedVoice']>({});
  const [report, setReport] = useState<TestReport | null>(null);
  const [channelReports, setChannelReports] = useState<Record<string, CheckResult>>({});
  const [testing, setTesting] = useState<SettingsDraft['testing']>(null);
  const [phase, setPhase] = useState<SettingsDraft['phase']>('idle');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const snapshot = useRef({ channels, activeLlmChannelId, voice });
  snapshot.current = { channels, activeLlmChannelId, voice };

  useEffect(() => {
    alive.current = true;
    fetch('/api/settings')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: SettingsResponse) => {
        if (!alive.current) return;
        const hidden: Record<string, string> = {};
        const nextChannels = (data.values.llmChannels ?? []).map((channel) => {
          hidden[channel.id] = channel.apiKey ?? '';
          return { ...channel, apiKey: '' };
        });
        const nextVoice: VoiceDraft = {
          ...EMPTY_VOICE,
          doubaoAuthMode: data.values.doubaoAuthMode === 'legacy' ? 'legacy' : 'apikey',
          doubaoAsrResourceId: data.values.doubaoAsrResourceId || VOICE_DEFAULTS.doubaoAsrResourceId,
          doubaoTtsResourceId: data.values.doubaoTtsResourceId || VOICE_DEFAULTS.doubaoTtsResourceId,
          doubaoTtsSpeaker: data.values.doubaoTtsSpeaker || '',
        };
        setInfo(data);
        setChannels(nextChannels);
        setMaskedKeys(hidden);
        setActiveLlmChannelId(data.values.activeLlmChannelId || nextChannels[0]?.id || '');
        setVoiceState(nextVoice);
        setMaskedVoice({
          doubaoApiKey: data.values.doubaoApiKey ?? '',
          doubaoAppId: data.values.doubaoAppId ?? '',
          doubaoAccessKey: data.values.doubaoAccessKey ?? '',
        });
      })
      .catch((err: unknown) => {
        console.error('[settings] load failed', { message: err instanceof Error ? err.message : 'unknown' });
        if (alive.current) setLoadError(true);
      });
    return () => { alive.current = false; };
  }, []);

  const setChannel = (id: string, patch: Partial<LlmChannel>) => {
    setChannels((current) => current.map((channel) => (channel.id === id ? { ...channel, ...patch, id } : channel)));
  };

  const setVoice = (key: keyof VoiceDraft, value: string) => {
    if (key === 'doubaoAuthMode') {
      if (value !== 'apikey' && value !== 'legacy') return;
      setVoiceState((current) => ({ ...current, doubaoAuthMode: value }));
      return;
    }
    setVoiceState((current) => ({ ...current, [key]: value }));
  };

  const payload = (options?: { channels?: LlmChannel[]; activeLlmChannelId?: string }): SettingsValues => {
    const current = snapshot.current;
    return {
      llmChannels: options?.channels ?? current.channels,
      activeLlmChannelId: options?.activeLlmChannelId ?? current.activeLlmChannelId,
      ...current.voice,
    };
  };

  const runTest = async (options?: TestOptions) => {
    const scope = options?.scope ?? 'all';
    const body = payload(options);
    const channelId = options?.channelId || body.activeLlmChannelId;
    setTesting(scope === 'channel' ? channelId : scope);
    setError(null);
    if (scope === 'all') setReport(null);
    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, scope, channelId }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as TestReport;
      if (!alive.current) return;
      if (scope === 'channel' && data.llm) {
        setChannelReports((current) => ({ ...current, [channelId]: data.llm! }));
      } else {
        setReport(data);
        if (data.llm) setChannelReports((current) => ({ ...current, [channelId]: data.llm! }));
      }
    } catch (err) {
      console.error('[settings] test failed', { message: err instanceof Error ? err.message : 'unknown' });
      if (alive.current) setError('测试没有完成,请稍后重试');
    } finally {
      if (alive.current) setTesting(null);
    }
  };

  const save = async (options?: SaveOptions) => {
    const body = payload(options);
    setPhase('saving');
    setError(null);
    if (options?.resumeMicrophone) markResumeMicrophone();
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(String(response.status));
      if (!alive.current) return;
      setChannels(body.llmChannels.map((channel) => ({ ...channel, apiKey: '' })));
      setActiveLlmChannelId(body.activeLlmChannelId);
      setPhase('restarting');
      // Packaged Electron reloads the window from `/` after exit 75.
      // The browser dev poll below does the same once this process answers again.
      window.setTimeout(function poll() {
        if (!alive.current) return;
        fetch('/api/settings')
          .then((ready) => {
            if (!alive.current) return;
            if (ready.ok) window.location.assign('/');
            else window.setTimeout(poll, 600);
          })
          .catch(() => {
            if (alive.current) window.setTimeout(poll, 600);
          });
      }, 1800);
    } catch (err) {
      console.error('[settings] save failed', { message: err instanceof Error ? err.message : 'unknown' });
      if (options?.resumeMicrophone) clearResumeMicrophone();
      if (alive.current) {
        setPhase('idle');
        setError('保存失败,请重试');
      }
    }
  };

  return {
    info,
    loadError,
    channels,
    maskedKeys,
    activeLlmChannelId,
    voice,
    maskedVoice,
    report,
    channelReports,
    testing,
    phase,
    error,
    readOnly: info?.mode === 'web',
    setChannel,
    setVoice,
    runTest,
    save,
  };
}

export function providerLabel(provider: LlmProviderId): string {
  return LLM_PROVIDERS[provider].label;
}

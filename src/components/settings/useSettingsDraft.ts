'use client';

import { useEffect, useRef, useState } from 'react';
import { clearResumeMicrophone, markResumeMicrophone } from '@/lib/onboarding-entry';

export type FieldKey =
  | 'llmApiKey' | 'llmBaseUrl' | 'llmModel'
  | 'doubaoAppId' | 'doubaoAccessKey' | 'doubaoAsrResourceId' | 'doubaoTtsResourceId' | 'doubaoTtsSpeaker';
export type SettingsValues = Record<FieldKey, string>;
export interface CheckResult { ok: boolean; reason: string }
export interface TestReport { llm: CheckResult; tts: CheckResult; asr: CheckResult }
export interface SettingsResponse {
  mode: 'app' | 'web';
  configured: boolean;
  mock?: boolean;
  values: SettingsValues;
}

const SECRET: FieldKey[] = ['llmApiKey', 'doubaoAppId', 'doubaoAccessKey'];

const DEFAULTS: Partial<SettingsValues> = {
  llmBaseUrl: 'https://api.siliconflow.cn/v1',
  llmModel: 'deepseek-ai/DeepSeek-V3.2',
  doubaoAsrResourceId: 'volc.seedasr.sauc.duration',
  doubaoTtsResourceId: 'seed-tts-2.0',
};

const EMPTY: SettingsValues = {
  llmApiKey: '',
  llmBaseUrl: '',
  llmModel: '',
  doubaoAppId: '',
  doubaoAccessKey: '',
  doubaoAsrResourceId: '',
  doubaoTtsResourceId: '',
  doubaoTtsSpeaker: '',
};

export interface SettingsDraft {
  info: SettingsResponse | null;
  loadError: boolean;
  form: SettingsValues;
  masked: Partial<SettingsValues>;
  report: TestReport | null;
  testing: boolean;
  phase: 'idle' | 'saving' | 'restarting';
  error: string | null;
  readOnly: boolean;
  set: (key: FieldKey, value: string) => void;
  runTest: () => Promise<void>;
  save: (options?: { resumeMicrophone?: boolean }) => Promise<void>;
}

export function useSettingsDraft(): SettingsDraft {
  const [info, setInfo] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<SettingsValues>(EMPTY);
  const [masked, setMasked] = useState<Partial<SettingsValues>>({});
  const [report, setReport] = useState<TestReport | null>(null);
  const [testing, setTesting] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'saving' | 'restarting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    fetch('/api/settings')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: SettingsResponse) => {
        if (!alive.current) return;
        const next = { ...EMPTY };
        const hidden: Partial<SettingsValues> = {};
        (Object.keys(EMPTY) as FieldKey[]).forEach((key) => {
          if (SECRET.includes(key)) hidden[key] = data.values[key] ?? '';
          else next[key] = data.values[key] || DEFAULTS[key] || '';
        });
        setInfo(data);
        setForm(next);
        setMasked(hidden);
      })
      .catch((err: unknown) => {
        console.error('[settings] load failed', { message: err instanceof Error ? err.message : 'unknown' });
        if (alive.current) setLoadError(true);
      });
    return () => { alive.current = false; };
  }, []);

  const set = (key: FieldKey, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const runTest = async () => {
    setTesting(true);
    setReport(null);
    setError(null);
    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(String(response.status));
      if (alive.current) setReport(await response.json());
    } catch (err) {
      console.error('[settings] test failed', { message: err instanceof Error ? err.message : 'unknown' });
      if (alive.current) setError('测试没有完成,请稍后重试');
    } finally {
      if (alive.current) setTesting(false);
    }
  };

  const save = async (options?: { resumeMicrophone?: boolean }) => {
    setPhase('saving');
    setError(null);
    if (options?.resumeMicrophone) markResumeMicrophone();
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(String(response.status));
      if (!alive.current) return;
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
    form,
    masked,
    report,
    testing,
    phase,
    error,
    readOnly: info?.mode === 'web',
    set,
    runTest,
    save,
  };
}

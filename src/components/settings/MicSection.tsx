'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { getMicStatus, requestMic, type MicStatus } from '@/lib/audio/microphone';
import { LessonRecorder } from '@/lib/audio/recorder';

const LABELS: Record<MicStatus, string> = {
  granted: '已允许',
  'not-determined': '未询问',
  denied: '已拒绝',
};

export function MicSection({
  onAllowed,
  variant = 'panel',
  extra,
}: {
  onAllowed?: () => void;
  variant?: 'panel' | 'embedded';
  extra?: ReactNode;
}) {
  const [status, setStatus] = useState<MicStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<LessonRecorder | null>(null);
  const mounted = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      void getMicStatus().then((next) => {
        if (mounted.current) setStatus(next);
      }).catch(() => {
        if (mounted.current) setError('暂时读不到麦克风状态,请重试。');
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', refresh);
      if (timeout.current) clearTimeout(timeout.current);
      void recorder.current?.dispose();
      recorder.current = null;
    };
  }, []);

  const stop = async () => {
    const current = recorder.current;
    recorder.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    await current?.dispose();
    if (mounted.current) {
      setRecording(false);
      setLevel(0);
    }
  };
  const allow = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await requestMic();
      if (!mounted.current) return;
      setStatus(next);
      if (next === 'granted') onAllowed?.();
    } catch {
      if (mounted.current) setError('无法使用麦克风,请检查设备连接后重试。');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const test = async () => {
    if (recorder.current) {
      await stop();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await getMicStatus();
      if (!mounted.current) return;
      setStatus(next);
      if (next !== 'granted') {
        setError('请先允许使用麦克风,再试录。');
        return;
      }
      const current = new LessonRecorder();
      recorder.current = current;
      await current.start({
        onChunk: (pcm) => {
          if (!mounted.current || recorder.current !== current) return;
          const samples = new Int16Array(pcm);
          let sum = 0;
          for (let i = 0; i < samples.length; i++) sum += (samples[i] / 32768) ** 2;
          setLevel(Math.min(100, Math.sqrt(sum / Math.max(1, samples.length)) * 400));
        },
      });
      if (!mounted.current || recorder.current !== current) {
        await current.dispose();
        return;
      }
      setRecording(true);
      timeout.current = setTimeout(() => { void stop(); }, 10000);
    } catch {
      await stop();
      if (mounted.current) setError('没有收到声音,请检查麦克风权限和设备后重试。');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const desktop = typeof window !== 'undefined' && Boolean(window.eduagentDesktop);
  return (
    <section
      className={variant === 'embedded' ? 'mic-embedded settings-section' : 'settings-section'}
      aria-label="麦克风"
    >
      {variant === 'panel' && <h1>麦克风</h1>}
      <p>
        当前状态:
        <span data-testid="mic-status">{status ? LABELS[status] : '读取中…'}</span>
      </p>
      <div className="ui-glass mic-trial">
        <Button
          size="sm"
          disabled={busy || status !== 'granted'}
          onClick={() => { void test(); }}
        >
          {recording ? '停止试录' : '试录一下'}
        </Button>
        {recording && (
          <div
            role="meter"
            aria-label="麦克风音量"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level)}
            className="settings-meter"
          >
            <span style={{ width: `${level}%` }} />
          </div>
        )}
      </div>
      {recording && <p>说句话,看看音量条是否变化。试录会在 10 秒后停止。</p>}
      <div className="mic-actions">
        {status === 'not-determined' && (
          <Button
            size={variant === 'embedded' ? 'lg' : 'md'}
            disabled={busy}
            onClick={() => { void allow(); }}
          >
            允许使用麦克风
          </Button>
        )}
        {status === 'granted' && onAllowed && (
          <Button
            size="lg"
            onClick={onAllowed}
          >
            继续
          </Button>
        )}
        {status === 'denied' && desktop && (
          <Button
            variant="glass"
            onClick={() => {
              void window.eduagentDesktop?.openMicSettings().catch(() => setError('无法打开系统设置,请手动进入隐私与安全性中的麦克风。'));
            }}
          >
            打开系统设置
          </Button>
        )}
        {extra}
      </div>
      {status === 'denied' && (
        <p>
          请在{desktop ? '系统设置' : '浏览器的网站权限'}中允许麦克风。
          {desktop ? '更改后请退出并重新打开 EduAgent。' : '然后刷新页面。'}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

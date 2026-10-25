'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import maji from '../../../desktop/build-resources/icon-source.png';
import { Button } from '@/components/ui/Button';
import { MicSection } from '@/components/settings/MicSection';
import { ConnectPanel } from '@/components/settings/ConnectPanel';
import { useSettingsDraft } from '@/components/settings/useSettingsDraft';
import { loadLearners, saveCurrentLearnerId } from '@/lib/current-learner';
import { getMicStatus } from '@/lib/audio/microphone';
import {
  decideOnboardingStep,
  markChildSkipped,
  markConfigSkipped,
  markMicFinished,
  readOnboardingGate,
  type OnboardingStep,
} from '@/lib/onboarding-entry';
import '@/components/settings/settings.css';
import './onboarding.css';

const STEPS = [
  '连上 AI 老师和语音服务',
  '允许使用麦克风',
  '添加第一个孩子',
];

export function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep | null>(null);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/settings');
      const settings = response.ok ? await response.json() as { configured?: boolean; mock?: boolean } : null;
      if (!settings) {
        router.replace('/');
        return;
      }
      const learners = await loadLearners();
      const configured = settings.configured !== false;
      const gateSoFar = readOnboardingGate({
        configured,
        mic: null,
        hasLearner: learners.length > 0,
        profileUnreadable: false,
      });
      const needsMic = configured || gateSoFar.configSkipped || gateSoFar.resumeMic;
      const mic = needsMic ? await getMicStatus() : null;
      const next = decideOnboardingStep(readOnboardingGate({
        configured,
        mic,
        hasLearner: learners.length > 0,
        profileUnreadable: false,
      }));
      if (!next) {
        router.replace('/');
        return;
      }
      setMock(Boolean(settings.mock));
      setStep(next);
    } catch (err) {
      console.error('[onboarding] failed to choose a step', { message: err instanceof Error ? err.message : 'unknown' });
      setError('暂时读不到准备进度,请重试。');
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const skip = () => {
    if (step === 1) markConfigSkipped();
    if (step === 2) markMicFinished();
    if (step === 3) {
      markChildSkipped();
      router.replace('/');
      return;
    }
    void load();
  };

  return (
    <div className="onboarding-window" data-testid="onboarding" data-onboarding-step={step ?? undefined}>
      <header className="shell-toolbar onboarding-title">
        <b>欢迎使用 EduAgent</b>
      </header>
      <div className="onboarding">
        <aside className="onboarding-side">
          <Image src={maji} alt="" width={104} height={104} />
          <h1>
            三步准备好,
            <br />
            就能开始上课
          </h1>
          {mock && <p>演示模式不需要填写 Key。连接这一步已经完成。</p>}
          <ol className="onboarding-steps">
            {STEPS.map((label, index) => {
              const number = (index + 1) as OnboardingStep;
              const done = step !== null && number < step;
              const current = step === number;
              const state = current ? 'on' : done ? 'ok' : 'later';
              return (
                <li key={label} className={`onboarding-step ${state}`} aria-current={current ? 'step' : undefined}>
                  <span className="onboarding-num">
                    {done ? <Check size={14} strokeWidth={3} aria-label="已完成" /> : number}
                  </span>
                  {label}
                </li>
              );
            })}
          </ol>
        </aside>
        <main className="onboarding-main" data-testid={step === 2 ? 'mic-onboarding' : undefined}>
          <div className="onboarding-panel">
            {error && (
              <p role="alert" className="onboarding-error">
                {error}
                {' '}
                <Button size="sm" variant="glass" onClick={() => { void load(); }}>重试</Button>
              </p>
            )}
            {!step && !error && <p role="status">正在准备…</p>}
            {step === 1 && <ConnectStep onSkip={skip} />}
            {step === 2 && (
              <MicStep
                onAllowed={() => { markMicFinished(); void load(); }}
                onSkip={skip}
              />
            )}
            {step === 3 && <ChildStep onSkip={skip} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function ConnectStep({ onSkip }: { onSkip: () => void }) {
  const draft = useSettingsDraft();
  return (
    <>
      <span className="ui-tag">第 1 步 · 共 3 步</span>
      <h2>连上 AI 老师和语音服务</h2>
      <ConnectPanel
        draft={draft}
        onSkip={onSkip}
      />
    </>
  );
}

function MicStep({ onAllowed, onSkip }: { onAllowed: () => void; onSkip: () => void }) {
  return (
    <>
      <span className="ui-tag">第 2 步 · 共 3 步</span>
      <h2>允许使用麦克风</h2>
      <p>
        上课时,孩子按住空格或按钮跟读。只有按住的时候才录音,声音发送到豆包识别后用于判断发音。以后也可以在「设置 › 麦克风」里修改。
      </p>
      <MicSection
        variant="embedded"
        onAllowed={onAllowed}
        extra={(
          <Button variant="glass" size="lg" onClick={onSkip}>
            以后再说
          </Button>
        )}
      />
    </>
  );
}

function ChildStep({ onSkip }: { onSkip: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const finish = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/learners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const created = await response.json() as { id?: string };
      if (!created.id) throw new Error('missing id');
      saveCurrentLearnerId(created.id);
      router.replace('/');
    } catch (err) {
      console.error('[onboarding] create learner failed', { message: err instanceof Error ? err.message : 'unknown' });
      setError('没有建成档案,请重试。');
      setBusy(false);
    }
  };
  return (
    <>
      <span className="ui-tag">第 3 步 · 共 3 步</span>
      <h2>建第一个孩子档案</h2>
      <p>每个孩子的学习进度分开保存在这台电脑上。</p>
      <label className="onboarding-child" htmlFor="onboarding-learner-name">
        孩子名字
        <input
          id="onboarding-learner-name"
          className="settings-input"
          maxLength={80}
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="onboarding-actions">
        <Button
          variant="glass"
          size="lg"
          disabled={busy}
          onClick={onSkip}
        >
          以后再说
        </Button>
        <span className="settings-spacer" />
        <Button
          size="lg"
          disabled={busy || !name.trim()}
          onClick={() => { void finish(); }}
        >
          完成
        </Button>
      </div>
    </>
  );
}

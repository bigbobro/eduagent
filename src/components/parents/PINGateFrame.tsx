'use client';

import { useEffect, useState } from 'react';
import { Cat, PaperBg } from '@/components/magic';
import { MAX_FAIL, hasPin, setPin, verifyPin, recordFail, isLockedOut } from '@/lib/pin';

interface PINGateFrameProps {
  onUnlock: () => void;
}

export function PINGateFrame({ onUnlock }: PINGateFrameProps) {
  const [mode, setMode] = useState<'set' | 'verify' | 'confirm'>('verify');
  const [hydrated, setHydrated] = useState(false);
  const [value, setValue] = useState('');
  const [draftPin, setDraftPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lock, setLock] = useState<{ locked: boolean; resumeAt?: number }>({ locked: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setMode(hasPin() ? 'verify' : 'set');
    setLock(isLockedOut());
    setHydrated(true);
    const id = setInterval(() => setTick((next) => next + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setLock(isLockedOut());
  }, [tick]);

  if (!hydrated) return null;

  const locked = lock.locked;
  const remain = Math.max(0, Math.ceil(((lock.resumeAt ?? 0) - Date.now()) / 1000));
  const title = locked
    ? `稍等 ${remain} 秒`
    : mode === 'set'
      ? '设置家长阁楼 PIN'
      : mode === 'confirm'
        ? '再输一次确认'
        : '家长阁楼';

  const pushDigit = (digit: string) => {
    if (locked) return;
    setValue((current) => {
      if (current.length >= 4) return current;
      const next = current + digit;
      if (next.length === 4) queueMicrotask(() => void handleComplete(next));
      return next;
    });
  };

  const popDigit = () => setValue((current) => current.slice(0, -1));

  const handleComplete = async (pinValue: string) => {
    setValue('');
    if (mode === 'set') {
      setDraftPin(pinValue);
      setMode('confirm');
      setError(null);
      return;
    }
    if (mode === 'confirm') {
      if (pinValue === draftPin) {
        await setPin(pinValue);
        onUnlock();
      } else {
        setDraftPin('');
        setMode('set');
        setError('两次输入不一样');
      }
      return;
    }
    const ok = await verifyPin(pinValue);
    if (ok) {
      onUnlock();
    } else {
      const failCount = recordFail();
      const next = isLockedOut();
      if (next.locked) setLock(next);
      else setError(`不对哦,还剩 ${Math.max(0, MAX_FAIL - failCount)} 次`);
    }
  };

  return (
    <PaperBg tone="paperDeep" className="h-screen w-screen">
      <div className="flex h-full items-center justify-center bg-ink/10 backdrop-blur-[2px]">
        <section className="w-[480px] rotate-[-1deg] rounded-paper-lg border-[2.4px] border-ink bg-paper p-8 text-center text-ink shadow-paper-hero">
          <Cat size={120} mood={locked ? 'think' : 'idle'} />
          <h1 className="mt-2 font-display text-[30px] leading-none">{title}</h1>
          <p className="mt-2 min-h-5 font-zh text-sm text-peachDeep">{error}</p>
          <div className="my-5 flex justify-center gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <span
                key={index}
                className={`h-4 w-4 rounded-full border-2 border-ink ${index < value.length ? 'bg-butter' : 'bg-paperDeep'}`}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="mx-auto grid w-[240px] grid-cols-3 gap-3">
            {['1','2','3','4','5','6','7','8','9'].map((digit) => (
              <KeyButton key={digit} label={`数字${digit}`} disabled={locked} onClick={() => pushDigit(digit)}>{digit}</KeyButton>
            ))}
            <KeyButton label="确认" disabled={locked} onClick={() => value.length === 4 && void handleComplete(value)}>✓</KeyButton>
            <KeyButton label="数字0" disabled={locked} onClick={() => pushDigit('0')}>0</KeyButton>
            <KeyButton label="退格" disabled={locked} onClick={popDigit}>←</KeyButton>
          </div>
        </section>
      </div>
    </PaperBg>
  );
}

function KeyButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-16 w-16 items-center justify-center rounded-paper-md border-2 border-ink bg-paperDeep font-en text-2xl text-ink shadow-paper transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

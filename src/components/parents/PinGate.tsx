'use client';
import { useEffect, useState } from 'react';
import { PinPad } from '@/components/ui/PinPad';
import { Bunny } from '@/components/bunny/Bunny';
import { hasPin, setPin, verifyPin, recordFail, isLockedOut } from '@/lib/pin';

interface PinGateProps {
  onUnlock: () => void;
}

export function PinGate({ onUnlock }: PinGateProps) {
  const [mode, setMode] = useState<'set' | 'verify' | 'confirm'>('verify');
  const [hydrated, setHydrated] = useState(false);
  const [draftPin, setDraftPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lock, setLock] = useState<{ locked: boolean; resumeAt?: number }>({ locked: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setMode(hasPin() ? 'verify' : 'set');
    setLock(isLockedOut());
    setHydrated(true);
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setLock(isLockedOut());
  }, [tick]);

  if (!hydrated) return null;

  if (lock.locked) {
    const remain = Math.ceil(((lock.resumeAt ?? 0) - Date.now()) / 1000);
    return (
      <div className="flex flex-col items-center gap-6 p-8">
        <Bunny pose="stand" mood="thinking" size={180} />
        <p className="font-zh text-2xl text-bunny-ink text-center">
          稍等一会儿再试哦,{Math.max(0, remain)} 秒后再开
        </p>
      </div>
    );
  }

  const handle = async (pinValue: string) => {
    if (mode === 'set') {
      setDraftPin(pinValue);
      setMode('confirm');
      setError(null);
    } else if (mode === 'confirm') {
      if (pinValue === draftPin) {
        await setPin(pinValue);
        onUnlock();
      } else {
        setError('两次输入不一样,再来一次');
        setDraftPin('');
        setMode('set');
      }
    } else {
      const ok = await verifyPin(pinValue);
      if (ok) onUnlock();
      else {
        recordFail();
        const next = isLockedOut();
        if (next.locked) setLock(next);
        else setError('不对哦,再试一次');
      }
    }
  };

  const title =
    mode === 'set'
      ? '请设置爸爸妈妈的 4 位数字密码'
      : mode === 'confirm'
        ? '再输一次确认'
        : '请输入爸爸妈妈的密码';

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <Bunny pose="stand" mood="idle" size={180} />
      <h2 className="font-zh text-2xl text-bunny-ink">{title}</h2>
      <PinPad onComplete={handle} error={error} />
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { PinPad } from '@/components/ui/PinPad';
import { setPin, verifyPin } from '@/lib/pin';

export function SettingsAccordion({ ttsVoice }: { ttsVoice: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'closed' | 'old' | 'new'>('closed');
  const [msg, setMsg] = useState<string | null>(null);

  const changePin = async (newPin: string) => {
    await setPin(newPin);
    setStep('closed');
    setMsg('密码已更新');
  };
  const checkOld = async (oldPin: string) => {
    const ok = await verifyPin(oldPin);
    if (ok) {
      setStep('new');
      setMsg(null);
    } else {
      setMsg('当前密码不对');
    }
  };

  return (
    <Surface tone="night" className="!bg-bunny-wood/20 !text-bunny-bg-cream">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left font-zh text-lg flex justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink rounded"
      >
        <span>设置</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="font-zh text-sm text-bunny-bg-cream/80 mb-1">
              TTS 音色(只读,如需修改请改 .env)
            </div>
            <div className="font-en">{ttsVoice}</div>
          </div>

          <div>
            <div className="font-zh text-sm text-bunny-bg-cream/80 mb-2">
              难度档(占位,暂未生效)
            </div>
            <div className="flex gap-2">
              {(['简单', '标准', '进阶'] as const).map((d) => (
                <Button key={d} size="sm" variant="ghost" disabled>
                  {d}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-zh text-sm text-bunny-bg-cream/80 mb-2">修改密码</div>
            {step === 'closed' && (
              <Button size="sm" onClick={() => setStep('old')}>
                修改
              </Button>
            )}
            {step === 'old' && <PinPad onComplete={checkOld} error={msg} />}
            {step === 'new' && <PinPad onComplete={changePin} />}
            {msg && step === 'closed' && (
              <p className="text-bunny-gold text-sm font-zh">{msg}</p>
            )}
          </div>
        </div>
      )}
    </Surface>
  );
}

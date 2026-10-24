'use client';

import { MicSection } from '@/components/settings/MicSection';
import { PaperBg } from '@/components/magic/PaperBg';
import { PaperButton } from '@/components/magic/PaperButton';

export const MIC_SETUP_COMPLETE = 'eduagent:mic-setup-complete';

export function MicOnboarding({ onDone }: { onDone: () => void }) {
  const finish = () => {
    try { localStorage.setItem(MIC_SETUP_COMPLETE, '1'); } catch {}
    onDone();
  };
  return (
    <PaperBg tone="paper" className="h-screen w-screen">
      <main data-testid="mic-onboarding" className="mx-auto max-w-2xl px-8 py-16 text-ink">
        <h1 className="mb-4 font-display text-3xl">让老师听见你的声音</h1>
        <p className="mb-6 font-zh">上课需要使用麦克风。你可以现在允许,也可以稍后在设置里完成。</p>
        <MicSection onAllowed={finish} />
        <div className="mt-6"><PaperButton size="sm" color="paper" onClick={finish}>稍后设置</PaperButton></div>
      </main>
    </PaperBg>
  );
}

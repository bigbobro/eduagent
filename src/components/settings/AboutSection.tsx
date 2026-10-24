'use client';

import { useEffect, useState } from 'react';
import { PaperButton } from '@/components/magic/PaperButton';
import '@/lib/audio/microphone';

export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void window.eduagentDesktop?.getAppInfo().then((info) => { if (active) setVersion(info.version); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return (
    <section className="rounded-paper-lg border-2 border-ink bg-paper p-5 shadow-paper" aria-labelledby="about-heading">
      <h2 id="about-heading" className="font-display text-[24px]">关于</h2>
      <p data-testid="app-version" className="my-3 font-zh text-sm">EduAgent {version ? `版本 ${version}` : '网页版'}</p>
      {version && <PaperButton size="sm" color="paper" onClick={() => { void window.eduagentDesktop?.openLogsFolder().catch(() => setError(true)); }}>打开日志文件夹</PaperButton>}
      {error && <p role="alert" className="mt-3 font-zh text-sm text-ember">暂时无法读取应用信息或打开日志文件夹。</p>}
    </section>
  );
}

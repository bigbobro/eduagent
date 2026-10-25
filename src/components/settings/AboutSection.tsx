'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import '@/lib/audio/microphone';

export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void window.eduagentDesktop?.getAppInfo().then((info) => {
      if (active) setVersion(info.version);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);
  return (
    <section className="settings-section" aria-labelledby="about-heading">
      <h1 id="about-heading">关于</h1>
      <p data-testid="app-version">
        EduAgent {version ? `版本 ${version}` : '网页版'}
      </p>
      {version && (
        <Button
          variant="glass"
          size="sm"
          onClick={() => {
            void window.eduagentDesktop?.openLogsFolder().catch(() => setError(true));
          }}
        >
          打开日志文件夹
        </Button>
      )}
      {error && <p role="alert">暂时无法读取应用信息或打开日志文件夹。</p>}
    </section>
  );
}

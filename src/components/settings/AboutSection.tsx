'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import maji from '../../../desktop/build-resources/icon-source.png';
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
    <section
      className="settings-section"
      aria-labelledby="about-heading"
    >
      <h1 id="about-heading">关于</h1>
      <div className="settings-card about-card">
        <Image
          src={maji}
          alt=""
          width={72}
          height={72}
          className="about-mark"
        />
        <div className="about-copy">
          <strong>EduAgent</strong>
          <p data-testid="app-version">
            EduAgent {version ? `版本 ${version}` : '网页版'}
          </p>
          <p>装在这台电脑上的儿童英语课。跟读声音会发送到豆包识别,老师的发音由豆包合成。</p>
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
        </div>
      </div>
      {error && <p role="alert">暂时无法读取应用信息或打开日志文件夹。</p>}
    </section>
  );
}

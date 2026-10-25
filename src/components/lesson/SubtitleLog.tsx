'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import maji from '../../../desktop/build-resources/icon-source.png';
import type { LessonController } from '@/lib/voice/lesson-controller';

interface Message { text: string; source: 'user' | 'ai'; live: boolean }

export function SubtitleLog({ controller }: { controller: LessonController }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const pending = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const subtitle = (next: { text: string; source: 'user' | 'ai' }) => {
      if (!next.text) return;
      const replace = next.source === 'user' && pending.current;
      pending.current = next.source === 'user';
      setMessages((prev) => [...(replace ? prev.slice(0, -1) : prev), { ...next, live: next.source === 'user' }].slice(-50));
    };
    const finish = () => {
      pending.current = false;
      setMessages((prev) => prev.map((message) => message.live ? { ...message, live: false } : message));
    };
    controller.on('subtitle', subtitle);
    controller.on('subtitle-clear', finish);
    controller.on('asr-final', finish);
    return () => { controller.off('subtitle', subtitle); controller.off('subtitle-clear', finish); controller.off('asr-final', finish); };
  }, [controller]);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'end' }); }, [messages]);
  return <aside className="p2-log" aria-label="课堂字幕"><header><Image src={maji} width={36} height={36} alt="" /><b>麻吉老师</b><span className="p2-tag">字幕</span></header>
    <div className="p2-msgs" role="log" aria-live="polite">{messages.map((message, i) => <div key={i} className={`p2-message ${message.source === 'user' ? 'p2-me' : ''} ${message.live ? 'p2-live' : ''}`}><small>{message.source === 'ai' ? '麻吉' : message.live ? '你 · 识别中' : '你'}</small>{message.text}</div>)}<div ref={bottom} /></div>
  </aside>;
}

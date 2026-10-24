'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PINGateFrame } from '@/components/parents/PINGateFrame';
import { ParentsPage } from '@/components/parents/ParentsPage';
import type { StatsSnapshot, SessionSummary } from '@/types/progress';

export function ParentsClient() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [errStats, setErrStats] = useState(false);
  const [errSessions, setErrSessions] = useState(false);
  const [ttsVoice, setTtsVoice] = useState('');

  useEffect(() => {
    if (!unlocked) return;
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStats)
      .catch(() => setErrStats(true));
    fetch('/api/sessions?limit=10')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSessions)
      .catch(() => setErrSessions(true));
    // 音色来自运行时设置(桌面版没有 NEXT_PUBLIC_* 构建期常量)
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) => setTtsVoice(s?.values?.doubaoTtsSpeaker ?? ''))
      .catch(() => {});
  }, [unlocked]);

  if (!unlocked) {
    return (
      <PINGateFrame onUnlock={() => setUnlocked(true)} />
    );
  }

  return (
    <ParentsPage
      stats={stats}
      sessions={sessions}
      errStats={errStats}
      errSessions={errSessions}
      ttsVoice={ttsVoice}
      onSettings={() => router.push('/settings')}
      onBack={() => router.push('/')}
    />
  );
}

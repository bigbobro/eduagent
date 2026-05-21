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
      ttsVoice={process.env.NEXT_PUBLIC_DOUBAO_TTS_DEFAULT_SPEAKER ?? '(未配置)'}
      onBack={() => router.push('/')}
    />
  );
}

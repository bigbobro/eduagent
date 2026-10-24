'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveCurrentLearner } from '@/lib/current-learner';
import { ParentsPage } from '@/components/parents/ParentsPage';
import type { StatsSnapshot, SessionSummary } from '@/types/progress';

export function ParentsClient() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [errStats, setErrStats] = useState(false);
  const [errSessions, setErrSessions] = useState(false);
  useEffect(() => {
    let active = true;
    resolveCurrentLearner().then((learner) => {
      if (!active) return;
      if (!learner) { router.replace('/'); return; }
      setName(learner.name);
      const query = `learnerId=${encodeURIComponent(learner.id)}`;
      fetch(`/api/stats?${query}`).then((r) => r.ok ? r.json() : Promise.reject()).then((s) => { if (active) setStats(s); }).catch(() => { if (active) setErrStats(true); });
      fetch(`/api/sessions?limit=10&${query}`).then((r) => r.ok ? r.json() : Promise.reject()).then((s) => { if (active) setSessions(s); }).catch(() => { if (active) setErrSessions(true); });
    }).catch(() => { if (active) { setErrStats(true); setErrSessions(true); } });
    return () => { active = false; };
  }, [router]);
  return <ParentsPage stats={stats} sessions={sessions} errStats={errStats} errSessions={errSessions} learnerName={name} onBack={() => router.push('/')} />;
}

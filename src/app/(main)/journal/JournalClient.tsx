'use client';
import { resolveCurrentLearner } from '@/lib/current-learner';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { JournalPage } from '@/components/journal/JournalPage';
import type { ProgressSnapshot } from '@/types/progress';

export function JournalClient() {
  const router = useRouter();
  const [snap, setSnap] = useState<ProgressSnapshot | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    resolveCurrentLearner().then((learner) => {
      if (!learner) { router.replace('/'); throw new Error('请选择孩子'); }
      return fetch(`/api/progress?learnerId=${encodeURIComponent(learner.id)}`);
    })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(setSnap)
      .catch(() => setError(true));
  }, [router]);
  useEffect(() => {
    load();
    window.addEventListener('eduagent:learner-change', load);
    return () => window.removeEventListener('eduagent:learner-change', load);
  }, [load]);

  return (
    <JournalPage
      snapshot={snap}
      error={error}
      onRetry={load}
      onBack={() => router.push('/')}
    />
  );
}

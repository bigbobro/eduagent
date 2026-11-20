'use client';

import { useEffect, useState } from 'react';
import { loadLearners, selectedLearner } from '@/lib/current-learner';
import type { ProgressSnapshot, SessionSummary, StatsSnapshot } from '@/types/progress';

interface LearningRecords {
  learnerId: string;
  name: string;
  progress: ProgressSnapshot;
  stats: StatsSnapshot | null;
  sessions: SessionSummary[];
}

async function fetchRecord<T>(endpoint: 'progress' | 'stats' | 'sessions', learnerId: string): Promise<T> {
  const response = await fetch(`/api/${endpoint}?learnerId=${encodeURIComponent(learnerId)}${endpoint === 'sessions' ? '&limit=50' : ''}`);
  if (!response.ok) throw new Error(`${endpoint} unavailable`);
  return response.json();
}

export function useLearningRecords({ learnerId, includeStats = false }: { learnerId?: string; includeStats?: boolean } = {}) {
  const [data, setData] = useState<LearningRecords | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let request = 0;
    const load = async () => {
      const own = ++request;
      setData(null);
      setError(false);
      try {
        const learners = await loadLearners();
        const learner = learnerId ? learners.find(item => item.id === learnerId) : selectedLearner(learners);
        const id = learnerId ?? learner?.id;
        if (!id) throw new Error('请选择孩子');
        const [progress, sessions, stats] = await Promise.all([
          fetchRecord<ProgressSnapshot>('progress', id),
          fetchRecord<SessionSummary[]>('sessions', id),
          includeStats ? fetchRecord<StatsSnapshot>('stats', id) : null,
        ]);
        if (active && own === request) {
          setData({
            learnerId: id,
            name: learner?.id === id ? learner.name : '孩子',
            progress,
            stats,
            sessions,
          });
        }
      } catch {
        if (active && own === request) setError(true);
      }
    };
    void load();
    window.addEventListener('eduagent:learner-change', load);
    window.addEventListener('eduagent:profiles-change', load);
    return () => {
      active = false;
      window.removeEventListener('eduagent:learner-change', load);
      window.removeEventListener('eduagent:profiles-change', load);
    };
  }, [learnerId, includeStats, retry]);

  return { data, error, reload: () => setRetry(count => count + 1) };
}

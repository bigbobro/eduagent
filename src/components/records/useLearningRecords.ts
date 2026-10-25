'use client';
import { useEffect, useState } from 'react';
import { loadLearners, selectedLearner } from '@/lib/current-learner';
import type { ProgressSnapshot, SessionSummary, StatsSnapshot } from '@/types/progress';
interface LearningRecords { learnerId: string; name: string; progress: ProgressSnapshot; stats: StatsSnapshot; sessions: SessionSummary[] }
export function useLearningRecords(learnerId?: string) {
  const [data, setData] = useState<LearningRecords | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, request = 0;
    const load = async () => {
      const own = ++request;
      setData(null); setError(false);
      try {
        const learners = await loadLearners();
        const learner = learnerId ? learners.find(l => l.id === learnerId) : selectedLearner(learners);
        const id = learnerId ?? learner?.id;
        if (!id) throw new Error('请选择孩子');
        const [progress, stats, sessions] = await Promise.all(['progress','stats','sessions'].map(async endpoint => {
          const r = await fetch(`/api/${endpoint}?learnerId=${encodeURIComponent(id)}${endpoint === 'sessions' ? '&limit=50' : ''}`);
          if (!r.ok) throw new Error(`${endpoint} unavailable`);
          return r.json();
        }));
        if (active && own === request) setData({ learnerId:id, name:learner?.id === id ? learner.name : '孩子', progress, stats, sessions });
      } catch { if (active && own === request) setError(true); }
    };
    void load();
    window.addEventListener('eduagent:learner-change', load);
    window.addEventListener('eduagent:profiles-change', load);
    return () => { active = false; window.removeEventListener('eduagent:learner-change', load); window.removeEventListener('eduagent:profiles-change', load); };
  }, [learnerId, retry]);
  return { data, error, reload: () => setRetry(n => n+1) };
}

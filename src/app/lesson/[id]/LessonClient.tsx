'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadLearners, selectedLearner, saveCurrentLearnerId } from '@/lib/current-learner';
import Link from 'next/link';
import { getMicStatus, type MicStatus } from '@/lib/audio/microphone';
import { Course } from '@/types/course';
import { PhasedLessonView } from '@/components/lesson/PhasedLessonView';

interface LessonClientProps {
  course: Course;
  requestedLearnerId?: string;
}

export function LessonClient({ course, requestedLearnerId: requested }: LessonClientProps) {
  const router = useRouter();
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<MicStatus | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { void getMicStatus().then((next) => { if (active) setStatus(next); }).catch(() => { if (active) setStatus('not-determined'); }); };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (status !== 'granted') return;
    let active = true;
    loadLearners().then((items) => {
      if (!active) return;
      const current = requested ? items.find((l) => l.id === requested) : selectedLearner(items);
      if (!current) { router.replace('/'); return; }
      saveCurrentLearnerId(current.id);
      setLearnerId(current.id);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [requested, router, status]);
  // Do not mount the controller (or prewarm the recorder) until access is allowed.
  if (status !== 'granted') return (
    <main className="grid h-screen place-items-center bg-paper p-8 text-ink">
      <div role={status ? 'alert' : 'status'} className="text-center font-zh">
        <h1 className="mb-4 text-2xl">{status ? '上课前需要允许使用麦克风' : '正在检查麦克风…'}</h1>
        {status && <><p className="mb-6">请到设置页允许麦克风,再回来上课。</p><Link href="/settings" className="rounded-paper-md border-2 border-ink bg-butter px-5 py-3 focus-visible:outline">去设置</Link></>}
      </div>
    </main>
  );
  if (!learnerId) return <p role="status">{error ? '暂时读不到孩子档案，请返回首页重试。' : '正在读取孩子档案…'}</p>;
  return <PhasedLessonView course={course} learnerId={learnerId} />;

}

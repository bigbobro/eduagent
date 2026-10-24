'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HomeStudy, type CourseCardStatus } from '@/components/home/HomeStudy';
import { Course } from '@/types/course';
import { PaperBg, PaperButton } from '@/components/magic';
import { loadLearners, selectedLearner, saveCurrentLearnerId, type LearnerProfile } from '@/lib/current-learner';
import type { ProgressSnapshot } from '@/types/progress';

export default function HomePage() {
  const router = useRouter();
  const [learners, setLearners] = useState<LearnerProfile[] | null>(null);
  const [learner, setLearner] = useState<LearnerProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [progress, setProgress] = useState<Record<string, CourseCardStatus>>({});
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    fetch('/api/courses')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(setCourses)
      .catch(() => setError(true));

  };
  useEffect(load, []);
  const loadProfiles = () => {
    setProfileError(false);
    loadLearners().then((items) => {
      setLearners(items);
      const current = selectedLearner(items) ?? null;
      setLearner(current);
      saveCurrentLearnerId(current?.id ?? null);
    }).catch(() => setProfileError(true));
  };
  useEffect(loadProfiles, []);
  useEffect(() => {
    setProgress({});
    if (!learner) return;
    let active = true;
    fetch(`/api/progress?learnerId=${encodeURIComponent(learner.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((snap: ProgressSnapshot) => {
        const map: Record<string, CourseCardStatus> = {};
        for (const c of snap.courses) {
          map[c.courseId] = {
            timesStarted: c.timesStarted,
            progressPercent: c.progressPercent,
            hasResume: c.hasResume,
            completed: c.completed,
          };
        }
        if (active) setProgress(map);
      })
      .catch(() => { if (active) setProgress({}); });
    return () => { active = false; };
  }, [learner]);

  // 未配置(桌面版首次打开)时直接进入设置页;读取失败则不拦截,照常显示首页。
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s && s.configured === false) router.replace('/settings');
      })
      .catch(() => {});
  }, [router]);

  if (!learner) return (
    <PaperBg tone="paper" className="h-screen w-screen">
      <main className="mx-auto flex h-full max-w-xl flex-col gap-5 overflow-y-auto px-8 py-16 text-ink">
        <h1 className="font-display text-3xl">{learners?.length ? '今天谁来学英语？' : '建第一个孩子档案'}</h1>
        {profileError ? <><p role="alert">暂时读不到孩子档案</p><PaperButton onClick={loadProfiles}>重试</PaperButton></> : !learners ? <p>正在读取档案…</p> : learners.length === 0 ? <PaperButton onClick={() => router.push('/settings')}>建第一个孩子档案</PaperButton> : learners.map((item) => <PaperButton key={item.id} onClick={() => { saveCurrentLearnerId(item.id); setLearner(item); }}>{item.name}</PaperButton>)}
        <PaperButton color="paper" onClick={() => router.push('/settings')}>设置</PaperButton>
      </main>
    </PaperBg>
  );

  return (
    <>
    <div className="fixed right-4 top-2 z-50 flex items-center gap-2 rounded-paper-md border border-ink bg-paper px-3 py-1 font-zh text-sm">
      <span className="max-w-52 truncate" title={learner.name}>当前孩子：{learner.name}</span>
      {learners && learners.length > 1 && <button onClick={() => { setLearner(null); saveCurrentLearnerId(null); }}>切换孩子</button>}
      <button onClick={() => router.push('/settings')}>设置</button>
    </div>
    <HomeStudy
      courses={courses}
      progress={progress}
      error={error}
      onRetry={load}
      onCourseStart={(courseId) => router.push(`/lesson/${courseId}?learnerId=${encodeURIComponent(learner.id)}`)}
      onJournal={() => router.push('/journal')}
      onParents={() => router.push('/parents')}
    />
    </>
  );
}

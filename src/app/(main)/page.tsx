'use client';
import { MIC_SETUP_COMPLETE } from '../microphone/MicOnboarding';
import { getMicStatus } from '@/lib/audio/microphone';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourseHome, HomeSkeleton } from '@/components/home/CourseHome';
import { LearnerPicker } from '@/components/home/LearnerPicker';
import type { Course } from '@/types/course';
import { loadLearners, selectedLearner, saveCurrentLearnerId, type LearnerProfile } from '@/lib/current-learner';
import type { ProgressSnapshot } from '@/types/progress';

export default function HomePage() {
  const router = useRouter();
  const [learners, setLearners] = useState<LearnerProfile[] | null>(null);
  const [learner, setLearner] = useState<LearnerProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [needsMic, setNeedsMic] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [snapshot, setSnapshot] = useState<{ learnerId: string; data: ProgressSnapshot } | null>(null);
  const [courseError, setCourseError] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setCourses(null); setCourseError(false);
    fetch('/api/courses').then(r => { if (!r.ok) throw new Error('courses unavailable'); return r.json(); })
      .then(data => { if (active) setCourses(data); }).catch(() => { if (active) setCourseError(true); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    let active = true;
    let request = 0;
    const load = () => {
      const own = ++request;
      setProfileError(false);
      void loadLearners().then(items => {
        if (!active || own !== request) return;
        setLearners(items);
        const current = selectedLearner(items) ?? null;
        setLearner(current);
        saveCurrentLearnerId(current?.id ?? null);
      }).catch(() => { if (active && own === request) setProfileError(true); });
    };
    load();
    window.addEventListener('eduagent:learner-change', load);
    window.addEventListener('eduagent:profiles-change', load);
    return () => { active = false; window.removeEventListener('eduagent:learner-change', load); window.removeEventListener('eduagent:profiles-change', load); };
  }, [retry]);
  const learnerId = learner?.id;
  useEffect(() => {
    setSnapshot(null); setProgressError(null);
    if (!learnerId) return;
    let active = true;
    fetch(`/api/progress?learnerId=${encodeURIComponent(learnerId)}`)
      .then(r => { if (!r.ok) throw new Error('progress unavailable'); return r.json(); })
      .then((data: ProgressSnapshot) => { if (active) setSnapshot({ learnerId, data }); })
      .catch(() => { if (active) setProgressError(learnerId); });
    return () => { active = false; };
  }, [learnerId, retry]);

  useEffect(() => {
    let active = true;
    fetch('/api/settings').then(r => r.ok ? r.json() : null).then(async settings => {
      if (!active) return;
      if (settings?.configured === false) { router.replace('/settings'); return; }
      let needs = false;
      if (settings?.configured) {
        const status = await getMicStatus();
        let completed = false;
        try { completed = Boolean(localStorage.getItem(MIC_SETUP_COMPLETE)); } catch {}
        needs = status === 'not-determined' && !completed;
      }
      if (active) setNeedsMic(needs);
    }).catch(() => { if (active) setNeedsMic(false); });
    return () => { active = false; };
  }, [router]);
  useEffect(() => { if (needsMic) router.replace('/microphone'); }, [needsMic, router]);

  const reload = () => setRetry(value => value + 1);
  if (needsMic !== false) return <HomeSkeleton />;
  if (profileError || !learner) {
    if (!learners && !profileError) return <HomeSkeleton />;
    return <LearnerPicker learners={learners ?? []} error={profileError} onRetry={reload} onSettings={() => router.push('/settings')} onSelect={item => { saveCurrentLearnerId(item.id); setLearner(item); }} />;
  }
  return <CourseHome key={learner.id} learnerId={learner.id} courses={courses} progress={snapshot?.learnerId === learner.id ? snapshot.data.courses : null} error={courseError || progressError === learner.id} onRetry={reload} onCourseStart={id => router.push(`/lesson/${id}?learnerId=${encodeURIComponent(learner.id)}`)} />;
}

'use client';

import { getMicStatus } from '@/lib/audio/microphone';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourseHome, HomeSkeleton } from '@/components/home/CourseHome';
import { LearnerPicker } from '@/components/home/LearnerPicker';
import type { Course } from '@/types/course';
import { loadLearners, selectedLearner, saveCurrentLearnerId, type LearnerProfile } from '@/lib/current-learner';
import { clearChildSkipped, decideOnboardingStep, readOnboardingGate } from '@/lib/onboarding-entry';
import type { ProgressSnapshot } from '@/types/progress';

export default function HomePage() {
  const router = useRouter();
  const [learners, setLearners] = useState<LearnerProfile[] | null>(null);
  const [learner, setLearner] = useState<LearnerProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [ready, setReady] = useState(false);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [snapshot, setSnapshot] = useState<{ learnerId: string; data: ProgressSnapshot } | null>(null);
  const [courseError, setCourseError] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setCourses(null);
    setCourseError(false);
    fetch('/api/courses')
      .then((response) => {
        if (!response.ok) throw new Error('courses unavailable');
        return response.json();
      })
      .then((data) => { if (active) setCourses(data); })
      .catch(() => { if (active) setCourseError(true); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    let active = true;
    let request = 0;
    const load = () => {
      const own = ++request;
      setProfileError(false);
      void loadLearners().then((items) => {
        if (!active || own !== request) return;
        setLearners(items);
        const current = selectedLearner(items) ?? null;
        setLearner(current);
        saveCurrentLearnerId(current?.id ?? null);
      }).catch(() => {
        if (active && own === request) setProfileError(true);
      });
    };
    load();
    window.addEventListener('eduagent:learner-change', load);
    window.addEventListener('eduagent:profiles-change', load);
    return () => {
      active = false;
      window.removeEventListener('eduagent:learner-change', load);
      window.removeEventListener('eduagent:profiles-change', load);
    };
  }, [retry]);

  const learnerId = learner?.id;
  useEffect(() => {
    setSnapshot(null);
    setProgressError(null);
    if (!learnerId) return;
    let active = true;
    fetch(`/api/progress?learnerId=${encodeURIComponent(learnerId)}`)
      .then((response) => {
        if (!response.ok) throw new Error('progress unavailable');
        return response.json();
      })
      .then((data: ProgressSnapshot) => { if (active) setSnapshot({ learnerId, data }); })
      .catch(() => { if (active) setProgressError(learnerId); });
    return () => { active = false; };
  }, [learnerId, retry]);

  const learnerCount = learners?.length ?? null;
  useEffect(() => {
    if (learnerCount === null && !profileError) return;
    let active = true;
    setReady(false);
    void (async () => {
      let settings: { configured?: boolean } | null = null;
      try {
        const response = await fetch('/api/settings');
        settings = response.ok ? await response.json() : null;
      } catch (err) {
        console.error('[home] settings gate failed', { message: err instanceof Error ? err.message : 'unknown' });
        settings = null;
      }
      if (!active) return;
      if (!settings) {
        setReady(true);
        return;
      }
      const configured = settings.configured !== false;
      const preliminary = readOnboardingGate({
        configured,
        mic: null,
        hasLearner: (learnerCount ?? 0) > 0,
        profileUnreadable: profileError,
      });
      if (!configured && !preliminary.configSkipped) {
        router.replace('/onboarding?step=1');
        return;
      }
      let mic: 'granted' | 'denied' | 'not-determined' | null = null;
      try {
        mic = await getMicStatus();
      } catch (err) {
        console.error('[home] microphone status failed', { message: err instanceof Error ? err.message : 'unknown' });
      }
      if (!active) return;
      const step = decideOnboardingStep(readOnboardingGate({
        configured,
        mic,
        hasLearner: (learnerCount ?? 0) > 0,
        profileUnreadable: profileError,
      }));
      if (step) router.replace(`/onboarding?step=${step}`);
      else setReady(true);
    })();
    return () => { active = false; };
  }, [learnerCount, profileError, retry, router]);

  const reload = () => setRetry((value) => value + 1);
  if (!ready) return <HomeSkeleton />;
  if (profileError || !learner) {
    if (!learners && !profileError) return <HomeSkeleton />;
    return (
      <LearnerPicker
        learners={learners ?? []}
        error={profileError}
        onRetry={reload}
        onAdd={() => {
          clearChildSkipped();
          router.push('/onboarding?step=3');
        }}
        onSelect={(item) => {
          saveCurrentLearnerId(item.id);
          setLearner(item);
        }}
      />
    );
  }
  return (
    <CourseHome
      key={learner.id}
      learnerId={learner.id}
      courses={courses}
      progress={snapshot?.learnerId === learner.id ? snapshot.data.courses : null}
      error={courseError || progressError === learner.id}
      onRetry={reload}
      onCourseStart={(id, options) => router.push(`/lesson/${id}?learnerId=${encodeURIComponent(learner.id)}${options?.fresh ? '&fresh=1' : ''}`)}
    />
  );
}

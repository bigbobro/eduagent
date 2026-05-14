'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { PinGate } from '@/components/parents/PinGate';
import { StatsCard } from '@/components/parents/StatsCard';
import { SessionRow } from '@/components/parents/SessionRow';
import { SettingsAccordion } from '@/components/parents/SettingsAccordion';
import { ArrowLeft } from '@/components/ui/icons';
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
      <main className="w-screen h-screen relative">
        <SceneFrame variant="attic" enterFrom="yard">
          <div className="absolute inset-0 flex items-center justify-center">
            <PinGate onUnlock={() => setUnlocked(true)} />
          </div>
        </SceneFrame>
      </main>
    );
  }

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="attic">
        <header className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-20">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-3 py-2 rounded-bunny-md text-bunny-bg-cream hover:bg-bunny-pink-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink"
            aria-label="下楼回院子"
          >
            <ArrowLeft width={20} height={20} />
            <span className="font-zh text-sm">下楼</span>
          </button>
          <h1 className="font-zh text-xl text-bunny-bg-cream">爸爸妈妈的小阁楼</h1>
          <div className="w-24" />
        </header>

        <div className="absolute inset-0 top-14 overflow-y-auto px-12 py-8 space-y-6">
          <section className="grid grid-cols-3 gap-4">
            {errStats ? (
              <StatsCard title="数据" value="—" hint="暂时拿不到数据" />
            ) : !stats ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="h-32 rounded-bunny-lg bg-bunny-wood/20 animate-pulse" />
              ))
            ) : (
              <>
                <StatsCard
                  title="学习时长"
                  value={`${stats.totalMinutes} 分钟`}
                  hint={`共 ${stats.totalSessions} 节课`}
                >
                  <div className="flex gap-1 items-end h-12">
                    {stats.last7Days.map((d) => (
                      <div
                        key={d.date}
                        className="flex-1 bg-bunny-gold/60 rounded-sm"
                        style={{ height: `${Math.min(100, d.minutes * 2)}%` }}
                        title={`${d.date}: ${d.minutes} 分钟`}
                      />
                    ))}
                  </div>
                </StatsCard>
                <StatsCard
                  title="掌握单词"
                  value={stats.totalWordsMastered}
                  hint="3 颗 ★ 视为掌握"
                />
                <StatsCard title="课程次数" value={stats.totalSessions} />
              </>
            )}
          </section>

          <section>
            <h2 className="font-zh text-xl text-bunny-bg-cream mb-3">最近 10 节课</h2>
            <div className="rounded-bunny-lg bg-bunny-wood/20 p-4">
              {errSessions ? (
                <p className="font-zh text-bunny-bg-cream/60">暂时拿不到数据</p>
              ) : !sessions ? (
                <div className="h-32 animate-pulse" />
              ) : sessions.length === 0 ? (
                <p className="font-zh text-bunny-bg-cream/60">还没开始第一节课</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2 py-2 border-b border-bunny-bg-cream/20 font-zh text-sm text-bunny-bg-cream/70">
                    <span>时间</span>
                    <span>课程</span>
                    <span>时长</span>
                    <span>掌握</span>
                  </div>
                  {sessions.map((s) => (
                    <SessionRow key={s.lessonId} session={s} />
                  ))}
                </>
              )}
            </div>
          </section>

          <SettingsAccordion
            ttsVoice={process.env.NEXT_PUBLIC_DOUBAO_TTS_DEFAULT_SPEAKER ?? '(未配置)'}
          />
        </div>
      </SceneFrame>
    </main>
  );
}

'use client';

import type { SessionSummary, StatsSnapshot } from '@/types/progress';
import { Cat, PaperBg, PaperButton, palette } from '@/components/magic';

interface ParentsPageProps {
  stats: StatsSnapshot | null;
  sessions: SessionSummary[] | null;
  errStats?: boolean;
  errSessions?: boolean;
  learnerName: string;
  onBack: () => void;
}

export function ParentsPage({
  stats,
  sessions,
  errStats = false,
  errSessions = false,
  learnerName,
  onBack,
}: ParentsPageProps) {
  return (
    <PaperBg tone="paper" className="h-screen w-screen">
      <main className="h-full px-12 py-6 text-ink">
        <header className="flex items-center justify-between border-b border-dashed border-inkPale pb-4">
          <div className="flex items-center gap-4">
            <PaperButton size="sm" color="paper" onClick={onBack}>回首页</PaperButton>
            <h1 className="font-display text-[30px] leading-none">学习记录</h1>
            <span className="font-en-script text-lg text-inkSoft">Learning</span>
          </div>
          <span className="font-zh text-sm text-inkSoft">{learnerName}</span>
        </header>

        <section className="grid grid-cols-4 gap-5 py-6">
          {errStats ? (
            <StatCard label="数据" value="—" unit="" tone="peach" />
          ) : !stats ? (
            [1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-paper-lg border-2 border-inkPale bg-paperDeep" />)
          ) : (
            <>
              <StatCard label="本周学习" value={stats.totalMinutes} unit="分钟" tone="mint" />
              <StatCard label="掌握单词" value={stats.totalWordsMastered} unit="个" tone="peach" />
              <StatCard label="连续打卡" value="—" unit="天" tone="butter" />
              <StatCard label="发音准确率" value="—" unit="%" tone="sky" />
            </>
          )}
        </section>

        <section className="grid h-[calc(100%-236px)] grid-cols-[1.35fr_1fr] gap-6">
          <div className="rounded-paper-lg border-2 border-ink bg-paper p-5 shadow-paper">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-[24px] leading-none">最近几次课</h2>
              <span className="font-en-script text-base text-inkSoft">recent sessions</span>
            </div>
            {errSessions ? (
              <p className="font-zh text-inkSoft">暂时拿不到数据</p>
            ) : !sessions ? (
              <div className="h-40 animate-pulse rounded-paper-md bg-paperDeep" />
            ) : sessions.length === 0 ? (
              <p className="font-zh text-inkSoft">还没开始第一节课</p>
            ) : (
              <div className="space-y-2">
                {sessions.slice(0, 5).map((session) => (
                  <SessionLine key={session.lessonId} session={session} />
                ))}
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-5">
            <div className="flex items-center gap-4 rounded-paper-lg border-2 border-ink bg-lilac p-4 shadow-paper">
              <Cat size={90} mood="idle" />
              <p className="font-zh text-sm leading-relaxed text-ink">
                本周数据会跟着真实课堂记录更新。缺少的 streak / accuracy 暂时显示占位。
              </p>
            </div>
          </aside>
        </section>
      </main>
    </PaperBg>
  );
}

function StatCard({ label, value, unit, tone }: { label: string; value: string | number; unit: string; tone: 'mint' | 'peach' | 'butter' | 'sky' }) {
  return (
    <div className="rounded-paper-lg border-2 border-ink p-4 shadow-paper" style={{ background: palette[tone] }}>
      <div className="font-zh text-sm text-inkSoft">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-[46px] leading-none">{value}</span>
        <span className="font-zh text-base text-inkSoft">{unit}</span>
      </div>
    </div>
  );
}

function SessionLine({ session }: { session: SessionSummary }) {
  const minutes = Math.round(session.durationMs / 60_000);
  return (
    <div className="grid grid-cols-[120px_1fr_90px_90px] gap-3 rounded-paper-md bg-paperDeep px-4 py-3 font-zh text-sm">
      <span className="text-inkSoft">{formatDate(session.startTime)}</span>
      <span>{session.courseTitle}</span>
      <span>{minutes} 分钟</span>
      <span className="text-mintDeep">{session.wordsMastered} 个词</span>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

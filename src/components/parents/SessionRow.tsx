import type { SessionSummary } from '@/types/progress';

interface SessionRowProps {
  session: SessionSummary;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SessionRow({ session }: SessionRowProps) {
  const minutes = Math.round(session.durationMs / 60_000);
  return (
    <div className="grid grid-cols-4 gap-2 py-2 border-b border-bunny-bg-cream/10 font-zh text-sm text-bunny-bg-cream">
      <span>{fmtDate(session.startTime)}</span>
      <span>{session.courseTitle}</span>
      <span>{minutes} 分钟</span>
      <span className="text-bunny-gold">{session.wordsMastered} 个词</span>
    </div>
  );
}

import { summarizeRealtimeUsage } from './realtime/usage';
import type { Database } from './db/sqlite';
import type { Course } from '@/types/course';
import type { StatsSnapshot, SessionSummary } from '@/types/progress';
import { getLessonTimings, getRecentLessons, getLessonWordPerfCount } from './db/queries';

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function durationMs(start: string, end: string | null): number {
  if (!end) return 0;
  return new Date(end).getTime() - new Date(start).getTime();
}

export function buildStatsSnapshot(db: Database, learnerId: string): StatsSnapshot {
  const rows = getLessonTimings(db, learnerId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyMs = new Map<string, number>();
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dailyMs.set(dateKey(d), 0);
  }

  let totalMs = 0;
  for (const r of rows) {
    const ms = durationMs(r.startTime, r.endTime);
    totalMs += ms;
    const date = dateKey(new Date(r.startTime));
    const dayMs = dailyMs.get(date);
    if (dayMs !== undefined) dailyMs.set(date, dayMs + ms);
  }

  const days = Array.from(dailyMs, ([date, ms]) => ({ date, minutes: Math.round(ms / 60_000) }));
  return {
    totalMinutes: Math.round(totalMs / 60_000),
    totalSessions: rows.length,
    totalWordsMastered: 0,
    last7Days: days.slice(-7),
    lastDays: days,
  };
}

export function buildSessionList(db: Database, courses: Course[], learnerId: string, limit = 10): SessionSummary[] {
  const rows = getRecentLessons(db, limit, learnerId);

  const titleByCourse = new Map(courses.map((c) => [c.id, c.title]));

  return rows.map((r) => {
    const perf = getLessonWordPerfCount(db, r.id);
    let realtimeUsage;
    if (r.lesson_mode === 'realtime') {
      let raw: unknown; try { raw = JSON.parse(r.token_usage ?? '{}').realtime; } catch { raw = undefined; }
      realtimeUsage = summarizeRealtimeUsage(raw);
    }
    return {
      lessonId: r.id,
      mode: r.lesson_mode === 'realtime' ? 'realtime' : 'legacy',
      ...(realtimeUsage ? { realtimeUsage } : {}),
      courseId: r.courseId,
      courseTitle: titleByCourse.get(r.courseId) ?? r.courseId,
      startTime: r.startTime,
      endTime: r.endTime,
      durationMs: durationMs(r.startTime, r.endTime),
      interactionCount: r.interactionCount ?? 0,
      wordsAttempted: perf.attempted ?? 0,
      wordsMastered: perf.mastered ?? 0,
    };
  });
}

import type { Database } from 'better-sqlite3';
import type { Course } from '@/types/course';
import type { StatsSnapshot, SessionSummary } from '@/types/progress';

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function durationMs(start: string, end: string | null): number {
  if (!end) return 0;
  return new Date(end).getTime() - new Date(start).getTime();
}

export function buildStatsSnapshot(db: Database): StatsSnapshot {
  const rows = db
    .prepare(`SELECT id, start_time AS startTime, end_time AS endTime FROM lesson_logs`)
    .all() as Array<{ id: string; startTime: string; endTime: string | null }>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Array<{ date: string; minutes: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      minutes: 0,
    });
  }
  const byKey = new Map(days.map((d) => [d.date, d]));

  let totalMs = 0;
  for (const r of rows) {
    const ms = durationMs(r.startTime, r.endTime);
    totalMs += ms;
    const k = dateKey(r.startTime);
    const slot = byKey.get(k);
    if (slot) slot.minutes += Math.round(ms / 60_000);
  }

  return {
    totalMinutes: Math.round(totalMs / 60_000),
    totalSessions: rows.length,
    totalWordsMastered: 0,
    last7Days: days,
  };
}

export function buildSessionList(db: Database, courses: Course[], limit = 10): SessionSummary[] {
  const rows = db
    .prepare(
      `
    SELECT id, course_id AS courseId, start_time AS startTime, end_time AS endTime, interaction_count AS interactionCount
    FROM lesson_logs
    ORDER BY start_time DESC
    LIMIT ?
  `,
    )
    .all(limit) as Array<{
      id: string;
      courseId: string;
      startTime: string;
      endTime: string | null;
      interactionCount: number;
    }>;

  const titleByCourse = new Map(courses.map((c) => [c.id, c.title]));

  const perfStmt = db.prepare(`
    SELECT COUNT(*) AS attempted,
           SUM(CASE WHEN attempts > 0 AND correct * 1.0 / attempts >= 0.6 THEN 1 ELSE 0 END) AS mastered
    FROM word_performance WHERE lesson_id = ?
  `);

  return rows.map((r) => {
    const perf = perfStmt.get(r.id) as { attempted: number; mastered: number };
    return {
      lessonId: r.id,
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

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildStatsSnapshot } from '@/lib/stats';
import { buildProgressSnapshot } from '@/lib/progress';
import { allCourses } from '@/data/courses/transportation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const stats = buildStatsSnapshot(db);
  const prog = buildProgressSnapshot(db, allCourses);
  return NextResponse.json({ ...stats, totalWordsMastered: prog.totalWordsMastered });
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildStatsSnapshot } from '@/lib/stats';
import { buildProgressSnapshot } from '@/lib/progress';
import { allCourses } from '@/data/courses';
import { ensureDatabaseInitialized } from '@/lib/init';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const learnerId = new URL(req.url).searchParams.get('learnerId');
  if (!learnerId) return NextResponse.json({ error: 'learnerId is required' }, { status: 400 });
  ensureDatabaseInitialized();
  const db = getDb();
  const stats = buildStatsSnapshot(db, learnerId);
  const prog = buildProgressSnapshot(db, allCourses, learnerId);
  return NextResponse.json({ ...stats, totalWordsMastered: prog.totalWordsMastered });
}

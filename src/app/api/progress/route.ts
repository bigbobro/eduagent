import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildProgressSnapshot } from '@/lib/progress';
import { allCourses } from '@/data/courses';
import { ensureDatabaseInitialized } from '@/lib/init';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureDatabaseInitialized();
  const snap = buildProgressSnapshot(getDb(), allCourses);
  return NextResponse.json(snap);
}

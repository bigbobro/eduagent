import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSessionList } from '@/lib/stats';
import { allCourses } from '@/data/courses';
import { ensureDatabaseInitialized } from '@/lib/init';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const learnerId = new URL(req.url).searchParams.get('learnerId');
  if (!learnerId) return NextResponse.json({ error: 'learnerId is required' }, { status: 400 });
  ensureDatabaseInitialized();
  const url = new URL(req.url);
  const limitRaw = url.searchParams.get('limit');
  const limit = Math.max(1, Math.min(50, Number(limitRaw) || 10));
  const list = buildSessionList(getDb(), allCourses, learnerId, limit);
  return NextResponse.json(list);
}

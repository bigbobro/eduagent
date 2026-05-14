import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSessionList } from '@/lib/stats';
import { allCourses } from '@/data/courses';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitRaw = url.searchParams.get('limit');
  const limit = Math.max(1, Math.min(50, Number(limitRaw) || 10));
  const list = buildSessionList(getDb(), allCourses, limit);
  return NextResponse.json(list);
}
